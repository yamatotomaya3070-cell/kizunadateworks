export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();
  if (!data || data.role !== 'admin') throw new Error('管理者権限が必要です');
}

// GET: 保存済み集計一覧
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const userId = searchParams.get('userId') || '';
  const clientId = searchParams.get('clientId') || '';
  try { await requireAdmin(userId); } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  let query = supabaseAdmin
    .from('monthly_reports')
    .select('id, client_id, month, title, subtitle, rows, created_at')
    .order('created_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

// POST: 集計を保存
export async function POST(req: NextRequest) {
  const { userId, clientId, month, title, subtitle, rows } = await req.json();
  try { await requireAdmin(userId); } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { error } = await supabaseAdmin.from('monthly_reports').insert({
    client_id: clientId || null,
    month,
    title,
    subtitle: subtitle || '',
    rows,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: 保存済み集計を削除
export async function DELETE(req: NextRequest) {
  const { userId, reportId } = await req.json();
  try { await requireAdmin(userId); } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { error } = await supabaseAdmin.from('monthly_reports').delete().eq('id', reportId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
