import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { loadEntries, loadSoronCache, saveSoronCache } from "@/lib/store";
import { getTop5, buildReportText } from "@/lib/report";
import { FREQ_JP, COST_JP } from "@/lib/types";
import type { Entry } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Gemini 無料枠は「1日あたりの回数 × モデル別」（GenerateRequestsPerDayPerProjectPerModel-FreeTier）。
 * このため：
 * 1. 総評はキャッシュし、TOP5の内容が変わらない限りAPIを呼ばない（タブ開閉で枠を消費しない）
 * 2. 上限に当たったらチェーン内の別モデルへフォールバック（枠はモデル別なので有効）
 */
const MODEL_CHAIN = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter((m, i, arr) => arr.indexOf(m) === i);

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; status?: string; message?: string };
}

/** TOP5の実質的な内容が同じならキャッシュを使い回すためのハッシュ */
function topHash(top: Entry[]): string {
  const src = top.map((e) => [e.text, e.count, e.freq, e.cost]);
  return createHash("sha256").update(JSON.stringify(src)).digest("hex");
}

class QuotaExceededError extends Error {}

async function generateSoron(top: Entry[]): Promise<{ soron: string; model: string }> {
  const list = top
    .map(
      (e, i) =>
        `${i + 1}. ${e.text}（${e.count}回, 頻度:${FREQ_JP[e.freq]}, コスト:${COST_JP[e.cost]}）`,
    )
    .join("\n");

  let lastQuotaMessage = "";

  for (const model of MODEL_CHAIN) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  "あなたは業務改善のアドバイザー。与えられた『繰り返している不便な作業』のTOP5を見て、" +
                  "頻度とコストから優先順位を読み取り、どれから着手すべきかを1〜2文で前向きに助言する。" +
                  "頻度が高くコストが小さいものを最優先に挙げること。箇条書きや前置きは不要で、本文のみを返す。",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `今週の改善候補TOP5:\n${list}\n\nこの中から優先すべきものと理由を1〜2文で。`,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            // 2.5系のみ思考トークンを無効化（2.0系は thinkingConfig 非対応）
            ...(model.startsWith("gemini-2.5")
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          },
        }),
      },
    );

    const data = (await res.json()) as GeminiResponse;

    if (res.status === 429) {
      // このモデルの無料枠（1日あたり）を使い切り → 次のモデルへ
      lastQuotaMessage = data.error?.message ?? "";
      continue;
    }
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Gemini API error (${res.status})`);
    }

    const soron = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (soron) return { soron, model };
    throw new Error(`Gemini（${model}）から総評が返ってきませんでした`);
  }

  throw new QuotaExceededError(
    "Gemini無料枠（モデル別・1日あたり）を全モデルで使い切りました。" +
      "毎日 太平洋時間0時（日本時間 夕方頃）にリセットされます。" +
      (lastQuotaMessage ? ` 詳細: ${lastQuotaMessage.slice(0, 120)}` : ""),
  );
}

/**
 * POST /api/report — 週次レポートを生成して返す。
 * body: { force?: boolean } — true なら（再生成ボタン）キャッシュを無視して生成し直す。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const entries = await loadEntries();
  const top = getTop5(entries);

  let soron: string | null = null;
  let soronError: string | null = null;
  let soronSource: string | null = null;

  if (top.length && process.env.GEMINI_API_KEY) {
    const hash = topHash(top);
    const cache = await loadSoronCache();

    if (!body.force && cache?.hash === hash) {
      // TOP5が変わっていない → API呼び出しゼロでキャッシュを返す
      soron = cache.soron;
      soronSource = "cache";
    } else {
      try {
        const result = await generateSoron(top);
        soron = result.soron;
        soronSource = result.model;
        await saveSoronCache({ hash, soron, model: result.model });
      } catch (err) {
        // 失敗してもレポート自体は返す。古くてもキャッシュがあれば総評として出す
        if (cache) {
          soron = cache.soron;
          soronSource = "stale-cache";
        }
        soronError =
          err instanceof QuotaExceededError
            ? err.message + (cache ? "（前回の総評を表示中）" : "")
            : err instanceof Error
              ? err.message
              : "総評の生成に失敗しました";
      }
    }
  } else if (top.length && !process.env.GEMINI_API_KEY) {
    soronError = "GEMINI_API_KEY が未設定のため総評をスキップしました";
  }

  const report = buildReportText(top, soron);
  return NextResponse.json({ report, soron, soronError, soronSource });
}
