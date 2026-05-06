import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// オンデマンドのレシートテキスト生成。
// アーキテクチャ：
//   Gemini → テキスト → クライアント側 Canvas で画像レンダリング
//   サーバー側で画像生成・Storage 保存はしない（image_url なし）
//
// 安定化のポイント：
//   1. 詳細ログ（[ondemand] プレフィックスで Vercel Logs に出力）
//   2. モデル × リトライ × 縮小バッチの3段フォールバック
//   3. Vercel タイムアウト対策（maxDuration、全体タイムアウト早期リターン）
//   4. 部分成功でも返す（5件要求→3件取れたら3件返す）
//   5. 失敗時は HTTP 200 + `{ texts: [], error, diagnostics }` で
//      クライアント側のキャッチオール扱いをきれいにする

export const maxDuration = 60;

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.5-flash',
];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_COUNT = 50;
const RETRY_PER_MODEL = 2;
const RETRY_DELAY_MS = 1200;
const FETCH_TIMEOUT_MS = 12000;
const OVERALL_BUDGET_MS = 45000;

const STORE_TYPES = [
  'スーパー', 'コンビニ', 'カフェ', 'ドラッグストア', '居酒屋', '弁当屋',
  'パン屋', 'ホームセンター', '書店', 'ラーメン屋', '焼肉店', 'ファミレス',
  '花屋', 'スポーツ用品店',
];

type Attempt = { model: string; count: number; status: number | 'timeout' | 'network'; ok: boolean; parsed: number; durationMs: number; error?: string };

function buildPrompt(category: string, count: number): string {
  if (category.includes('レシート')) {
    const hint = Array.from({ length: count }, () =>
      STORE_TYPES[Math.floor(Math.random() * STORE_TYPES.length)]
    ).join('・');
    return `レシートのダミーデータを${count}件、JSON配列で生成してください。
形式: [{"store":"店名","date":"YYYY/MM/DD","items":[{"name":"品目名","price":金額整数},...]}]
条件: 全件異なる内容。店種ヒント:${hint}。品目2〜5点。日付は2024〜2025年でバラバラに。JSON配列のみ出力。`;
  }
  if (category.includes('メモ') || category.includes('カルテ')) {
    return `以下の条件で、手書きメモや医療カルテのダミーデータを${count}件生成し、JSON配列形式で出力してください。

条件：
・実務のデータ入力訓練用。
・走り書きや、医療用語・略称（Rp.、Do、血圧、BT、HR、BSなど）が混ざったリアルなテキスト。
・改行は \\n を使用。

出力は文字列の配列のみ。前後の説明文は不要です。`;
  }
  return `以下の条件で、OCR練習用テキストを${count}件生成し、JSON配列形式で出力してください。
カテゴリ：${category}
条件：1〜2行程度のリアルな業務データ。改行は \\n を使用。
出力は文字列の配列のみ。説明文不要。`;
}

// JSON 配列パース。途中で切れた配列でも、解析できる範囲のオブジェクトを拾う。
function parseJsonSafely(text: string): string[] {
  if (!text) return [];
  // ```json ``` マーカーを除去
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // まず配列全体としてパース
  const m = cleaned.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((it: unknown) => typeof it === 'string' ? it : JSON.stringify(it));
      }
    } catch { /* fall through */ }
  }
  // フォールバック：個別のオブジェクトを最大限拾う（途中で切れた JSON 対策）
  const objects: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const slice = cleaned.slice(start, i + 1);
        try { JSON.parse(slice); objects.push(slice); }
        catch { /* skip */ }
        start = -1;
      }
    }
  }
  return objects;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function tryGemini(
  apiKey: string,
  model: string,
  count: number,
  category: string,
): Promise<{ texts: string[]; attempt: Attempt }> {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`;
  const prompt = buildPrompt(category, count);
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0 },
      }),
    }, FETCH_TIMEOUT_MS);

    const durationMs = Date.now() - t0;

    if (!res.ok) {
      // ボディは長すぎる可能性があるので 300 文字に切る。シークレットを含まない。
      const body = await res.text().catch(() => '');
      return {
        texts: [],
        attempt: {
          model, count, status: res.status, ok: false, parsed: 0, durationMs,
          error: body.slice(0, 300),
        },
      };
    }
    const json = await res.json();
    const rawText: string = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseJsonSafely(rawText);
    return {
      texts: parsed,
      attempt: {
        model, count, status: res.status, ok: true, parsed: parsed.length, durationMs,
        error: parsed.length === 0 ? `parse failed (rawLen=${rawText.length}, sample=${rawText.slice(0, 120)})` : undefined,
      },
    };
  } catch (e) {
    const durationMs = Date.now() - t0;
    const isAbort = (e as Error).name === 'AbortError';
    return {
      texts: [],
      attempt: {
        model, count,
        status: isAbort ? 'timeout' : 'network',
        ok: false, parsed: 0, durationMs,
        error: (e as Error).message,
      },
    };
  }
}

// モデル × リトライ × 縮小バッチの3段フォールバック
async function generate(apiKey: string, requestedCount: number, category: string, deadline: number): Promise<{ texts: string[]; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  // バッチサイズの段階：要求 → 半分 → 1
  const half = Math.max(1, Math.ceil(requestedCount / 2));
  const sizes = Array.from(new Set([requestedCount, half, 1]));

  for (const size of sizes) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < RETRY_PER_MODEL; attempt++) {
        if (Date.now() > deadline) {
          console.warn('[ondemand] deadline reached, aborting', { attempts: attempts.length });
          return { texts: [], attempts };
        }
        const r = await tryGemini(apiKey, model, size, category);
        attempts.push(r.attempt);
        console.log('[ondemand] attempt', JSON.stringify(r.attempt));
        if (r.texts.length > 0) {
          console.log('[ondemand] success', { model, requestedCount, returned: r.texts.length, attempts: attempts.length });
          return { texts: r.texts, attempts };
        }
        // 503/429 は次のリトライに価値がある。それ以外は次のモデルへ
        const status = r.attempt.status;
        if (status !== 503 && status !== 429 && status !== 'timeout' && status !== 'network') break;
        await new Promise(rs => setTimeout(rs, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
    console.warn('[ondemand] batch size failed, trying smaller', { failedSize: size });
  }

  console.error('[ondemand] all attempts failed', { attempts: attempts.length, last: attempts[attempts.length - 1] });
  return { texts: [], attempts };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const deadline = t0 + OVERALL_BUDGET_MS;

  try {
    const { userId, count = 5, category = 'レシート' } = await req.json();
    console.log('[ondemand] request', { hasUserId: !!userId, count, category });

    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です', texts: [] }, { status: 401 });
    }
    const { data: u } = await supabaseAdmin
      .from('users').select('id').eq('id', userId).single();
    if (!u) {
      return NextResponse.json({ error: 'ユーザーが見つかりません', texts: [] }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[ondemand] GEMINI_API_KEY missing');
      return NextResponse.json({
        error: 'GEMINI_API_KEY 未設定。Vercel Project Settings > Environment Variables で設定してください',
        texts: [],
      }, { status: 500 });
    }

    const target = Math.min(Math.max(1, parseInt(String(count)) || 5), MAX_COUNT);
    const { texts, attempts } = await generate(apiKey, target, String(category), deadline);

    const totalMs = Date.now() - t0;
    if (texts.length === 0) {
      return NextResponse.json({
        texts: [],
        count: 0,
        error: 'Gemini API からの取得に失敗しました（全フォールバック失敗）',
        diagnostics: { attempts: attempts.slice(-5), totalMs },
      });
    }
    return NextResponse.json({
      texts, count: texts.length,
      partial: texts.length < target,
      diagnostics: { attempts: attempts.length, totalMs, lastModel: attempts[attempts.length - 1]?.model },
    });
  } catch (e) {
    console.error('[ondemand] unexpected error', { message: (e as Error).message, stack: (e as Error).stack?.slice(0, 500) });
    return NextResponse.json({
      texts: [], count: 0,
      error: '予期しないエラー: ' + (e as Error).message,
    }, { status: 500 });
  }
}
