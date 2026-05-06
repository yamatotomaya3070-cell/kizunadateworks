import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// オンデマンド画像生成（実際は Gemini テキスト生成）の疎通確認エンドポイント。
// 管理画面の「画像生成診断」ボタンから呼ばれる。
// Gemini を1回だけ叩いて、所要時間・モデル・サンプル取得結果を返す。

export const maxDuration = 30;

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.5-flash',
];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const FETCH_TIMEOUT_MS = 12000;

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();
  if (!data || data.role !== 'admin') throw new Error('管理者権限が必要です');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  try { await requireAdmin(userId); }
  catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const apiKey = process.env.GEMINI_API_KEY;
  const env = {
    GEMINI_API_KEY: !!apiKey,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!apiKey) {
    return NextResponse.json({
      ok: false, env,
      error: 'GEMINI_API_KEY が未設定です。Vercel の Environment Variables に追加してください',
    });
  }

  const probe: Array<{ model: string; status: number | string; ok: boolean; durationMs: number; sample?: string; error?: string }> = [];

  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent`;
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(`${url}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'レシートのダミー1件のJSONを出力。形式: [{"store":"...","date":"YYYY/MM/DD","items":[{"name":"...","price":100}]}]' }] }],
          generationConfig: { temperature: 0.5 },
        }),
      }, FETCH_TIMEOUT_MS);
      const durationMs = Date.now() - t0;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        probe.push({ model, status: res.status, ok: false, durationMs, error: body.slice(0, 200) });
        continue;
      }
      const json = await res.json();
      const sample: string = (json.candidates?.[0]?.content?.parts?.[0]?.text || '').slice(0, 120);
      probe.push({ model, status: res.status, ok: true, durationMs, sample });
      // 1つでも成功したら早期に返す（疎通確認の目的のため）
      return NextResponse.json({ ok: true, env, probe, recommendedModel: model });
    } catch (e) {
      const durationMs = Date.now() - t0;
      const isAbort = (e as Error).name === 'AbortError';
      probe.push({ model, status: isAbort ? 'timeout' : 'network', ok: false, durationMs, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: false, env, probe, error: '全モデルで疎通失敗' });
}
