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

    // 本日の集計（当月表示時のみ）
    const todayMap = new Map<string, number>();
    if (isCurrentMonth) {
      const todayStart = jstTodayStartIso();
      const { data: todayRows } = await supabaseAdmin
        .from('answers')
        .select('user_id')
        .gte('created_at', todayStart);
      for (const r of todayRows ?? []) {
        todayMap.set(r.user_id, (todayMap.get(r.user_id) ?? 0) + 1);
      }
    }

    // 月間 正解/不正解/未入力 集計（JST月の範囲）
    const [myear, mmonth] = month.split('-').map(Number);
    const jstOffset = 9 * 60 * 60 * 1000;
    const monthStartUtc = new Date(Date.UTC(myear, mmonth - 1, 1) - jstOffset).toISOString();
    const nextYear = mmonth === 12 ? myear + 1 : myear;
    const nextMon = mmonth === 12 ? 1 : mmonth + 1;
    const monthEndUtc = new Date(Date.UTC(nextYear, nextMon - 1, 1) - jstOffset).toISOString();

    // 当月は上限なし（.lt 不要）、過去月のみ上限を設ける
    let answersQuery = supabaseAdmin
      .from('answers')
      .select('user_id, is_correct, answer_text')
      .gte('created_at', monthStartUtc);
    if (!isCurrentMonth) {
      answersQuery = answersQuery.lt('created_at', monthEndUtc);
    }
    const { data: monthAnswers } = await answersQuery;

    const correctMap = new Map<string, number>();
    const wrongMap = new Map<string, number>();
    const emptyMap = new Map<string, number>();
    for (const a of monthAnswers ?? []) {
      const isEmpty = !a.answer_text || a.answer_text.trim() === '' || a.answer_text === '{"items":[]}';
      // 空回答は empty のみカウント（wrong に含めない）
      if (isEmpty) {
        emptyMap.set(a.user_id, (emptyMap.get(a.user_id) ?? 0) + 1);
      } else if (a.is_correct) {
        correctMap.set(a.user_id, (correctMap.get(a.user_id) ?? 0) + 1);
      } else {
        wrongMap.set(a.user_id, (wrongMap.get(a.user_id) ?? 0) + 1);
      }
    }

    // 全期間集計（GAS の updateSummarySheet 互換：名前・回答数・正答数・正答率）
    const { data: allTimeRows } = await supabaseAdmin
      .from('answers')
      .select('user_id, is_correct');
    const allTotalMap = new Map<string, number>();
    const allCorrectMap = new Map<string, number>();
    for (const a of allTimeRows ?? []) {
      allTotalMap.set(a.user_id, (allTotalMap.get(a.user_id) ?? 0) + 1);
      if (a.is_correct) allCorrectMap.set(a.user_id, (allCorrectMap.get(a.user_id) ?? 0) + 1);
    }

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, name')
      .order('created_at', { ascending: true });

    let userList = users ?? [];
    if (clientId) userList = userList.filter((u) => u.client_id === clientId);

    const progress = userList.map((u) => ({
      user_id: u.id,
      name: u.name,
      login_id: u.login_id,
      client_id: u.client_id ?? null,
      month,
      completed_count: progMap.get(u.id) ?? 0,
      today_count: todayMap.get(u.id) ?? 0,
      correct_count: correctMap.get(u.id) ?? 0,
      wrong_count: wrongMap.get(u.id) ?? 0,
      empty_count: emptyMap.get(u.id) ?? 0,
      all_total: allTotalMap.get(u.id) ?? 0,
      all_correct: allCorrectMap.get(u.id) ?? 0,
    }));

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
