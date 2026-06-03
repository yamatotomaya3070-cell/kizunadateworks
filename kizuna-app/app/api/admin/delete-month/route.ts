export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { userId, month, clientId } = await req.json();

  // 管理者確認
  const { data: adminUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (!adminUser || adminUser.role !== 'admin') {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
  }

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '月の形式が不正です（YYYY-MM）' }, { status: 400 });
  }

  // 対象ユーザーIDを取得
  let userQuery = supabaseAdmin.from('users').select('id').eq('role', 'user');
  if (clientId) userQuery = userQuery.eq('client_id', clientId);
  const { data: targetUsers } = await userQuery;
  const userIds = (targetUsers ?? []).map((u) => u.id);

  if (!userIds.length) {
    return NextResponse.json({ deleted_answers: 0, deleted_progress: 0 });
  }

  // 月の日時範囲（JST基準）
  const [y, m] = month.split('-').map(Number);
  const jstOffset = 9 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(y, m - 1, 1) - jstOffset).toISOString();
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = new Date(Date.UTC(nextY, nextM - 1, 1) - jstOffset).toISOString();

  // answers 削除
  const { count: deletedAnswers } = await supabaseAdmin
    .from('answers')
    .delete({ count: 'exact' })
    .gte('created_at', start)
    .lt('created_at', end)
    .in('user_id', userIds);

  // progress 削除
  const { count: deletedProgress } = await supabaseAdmin
    .from('progress')
    .delete({ count: 'exact' })
    .eq('month', month)
    .in('user_id', userIds);

  return NextResponse.json({
    success: true,
    deleted_answers: deletedAnswers ?? 0,
    deleted_progress: deletedProgress ?? 0,
  });
}
