export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { currentMonth, jstTodayStartIso } from '@/lib/hash';

const DEFAULT_QUOTA = 750;

// GET: 進捗取得（ユーザー or 管理者全員）
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const userId = searchParams.get('userId') || '';
  const mode = searchParams.get('mode'); // 'admin'
  const clientId = searchParams.get('clientId');
  const targetMonthParam = searchParams.get('targetMonth') || null;

  const { data: setting } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'monthly_quota')
    .single();
  const quota = parseInt(setting?.value ?? String(DEFAULT_QUOTA));

  if (mode === 'admin') {
    const { data: adminUser } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (!adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const month = targetMonthParam ?? currentMonth();
    const isCurrentMonth = month === currentMonth();

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, login_id, client_id')
      .eq('role', 'user');

    const { data: progRows } = await supabaseAdmin
      .from('progress')
      .select('user_id, completed_count')
      .eq('month', month);

    const progMap = new Map((progRows ?? []).map((p) => [p.user_id, p.completed_count]));

    // JST月の開始・終了を UTC で計算
    const [myear, mmonth] = month.split('-').map(Number);
    const jstOffset = 9 * 60 * 60 * 1000;
    const monthStartUtc = new Date(Date.UTC(myear, mmonth - 1, 1) - jstOffset).toISOString();
    const nextYear = mmonth === 12 ? myear + 1 : myear;
    const nextMon = mmonth === 12 ? 1 : mmonth + 1;
    const monthEndUtc = new Date(Date.UTC(nextYear, nextMon - 1, 1) - jstOffset).toISOString();

    // 本日の集計（当月表示時のみ）— RPC で行数制限を回避
    const todayMap = new Map<string, number>();
    if (isCurrentMonth) {
      const { data: todayRows } = await supabaseAdmin.rpc('get_today_answer_counts', {
        p_today_start: jstTodayStartIso(),
      });
      for (const r of (todayRows ?? []) as { user_id: string; today_cnt: number }[]) {
        todayMap.set(r.user_id, Number(r.today_cnt));
      }
    }

    // 月間集計 — RPC で行数制限を回避
    type MonthStat = { user_id: string; correct_cnt: number; wrong_cnt: number; empty_cnt: number; accuracy_sum: number; answered_cnt: number };
    const { data: monthStats } = await supabaseAdmin.rpc('get_month_answer_stats', {
      p_start: monthStartUtc,
      p_end: isCurrentMonth ? null : monthEndUtc,
    });
    const monthMap = new Map<string, MonthStat>();
    for (const r of (monthStats ?? []) as MonthStat[]) {
      monthMap.set(r.user_id, r);
    }

    // 全期間集計 — RPC で行数制限を回避
    type AllTimeStat = { user_id: string; total_cnt: number; correct_cnt: number; accuracy_sum: number; answered_cnt: number };
    const { data: allTimeStats } = await supabaseAdmin.rpc('get_alltime_answer_stats');
    const allTimeMap = new Map<string, AllTimeStat>();
    for (const r of (allTimeStats ?? []) as AllTimeStat[]) {
      allTimeMap.set(r.user_id, r);
    }

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, name')
      .order('created_at', { ascending: true });

    let userList = users ?? [];
    if (clientId) userList = userList.filter((u) => u.client_id === clientId);

    const progress = userList.map((u) => {
      const ms = monthMap.get(u.id);
      const at = allTimeMap.get(u.id);
      const correctCnt = Number(ms?.correct_cnt ?? 0);
      const wrongCnt = Number(ms?.wrong_cnt ?? 0);
      const emptyCnt = Number(ms?.empty_cnt ?? 0);
      const answeredCnt = Number(ms?.answered_cnt ?? 0);
      const accSum = Number(ms?.accuracy_sum ?? 0);
      const avgAcc = answeredCnt > 0 ? accSum / answeredCnt : null;

      const atAnsweredCnt = Number(at?.answered_cnt ?? 0);
      const atAccSum = Number(at?.accuracy_sum ?? 0);
      const allAvgAcc = atAnsweredCnt > 0 ? atAccSum / atAnsweredCnt : null;

      return {
        user_id: u.id,
        name: u.name,
        login_id: u.login_id,
        client_id: u.client_id ?? null,
        month,
        completed_count: progMap.get(u.id) ?? 0,
        today_count: todayMap.get(u.id) ?? 0,
        correct_count: correctCnt,
        wrong_count: wrongCnt,
        empty_count: emptyCnt,
        answered_count: answeredCnt,
        avg_accuracy: avgAcc,
        all_total: Number(at?.total_cnt ?? 0),
        all_correct: Number(at?.correct_cnt ?? 0),
        all_avg_accuracy: allAvgAcc,
      };
    });

    return NextResponse.json({ progress, quota, clients: clients ?? [], targetMonth: month });
  }

  // ユーザー個人の進捗
  const month = currentMonth();
  const { data: prog } = await supabaseAdmin
    .from('progress')
    .select('completed_count')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  const { count: todayCount } = await supabaseAdmin
    .from('answers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', jstTodayStartIso());

  return NextResponse.json({
    progress: {
      completed: prog?.completed_count ?? 0,
      total: quota,
      todayCompleted: todayCount ?? 0,
    },
  });
}

// PATCH: クォータ更新（管理者）
export async function PATCH(req: NextRequest) {
  const { userId, quota } = await req.json();
  const { data: adminUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (!adminUser || adminUser.role !== 'admin') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
  }

  const n = parseInt(quota);
  if (isNaN(n) || n < 1) return NextResponse.json({ error: '正の整数を入力してください' }, { status: 400 });

  await supabaseAdmin
    .from('settings')
    .upsert({ key: 'monthly_quota', value: String(n) }, { onConflict: 'key' });

  return NextResponse.json({ success: true, quota: n });
}
