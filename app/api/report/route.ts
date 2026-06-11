import { NextResponse } from "next/server";
import { loadEntries } from "@/lib/store";
import { getTop5, buildReportText } from "@/lib/report";
import { FREQ_JP, COST_JP } from "@/lib/types";

export const dynamic = "force-dynamic";

// 無料枠が最も大きい flash-lite をデフォルトに（AI Studio の無料キーで動く）
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

/** Gemini generateContent のレスポンス（必要な部分だけ） */
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
  error?: { message?: string };
}

/**
 * POST /api/report — 週次レポートを生成して返す。
 * TOP5 と、Gemini による「頻度×コストから優先度の一言コメント」総評を含む。
 * Gemini 呼び出しはこのタイミングで1回だけ（毎入力では呼ばない＝コスト最小）。
 */
export async function POST() {
  const entries = await loadEntries();
  const top = getTop5(entries);

  let soron: string | null = null;
  let soronError: string | null = null;

  if (top.length && process.env.GEMINI_API_KEY) {
    try {
      const list = top
        .map(
          (e, i) =>
            `${i + 1}. ${e.text}（${e.count}回, 頻度:${FREQ_JP[e.freq]}, コスト:${COST_JP[e.cost]}）`,
        )
        .join("\n");

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
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
              // 思考トークンを無効化（短い総評に思考は不要＝コスト最小）
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );

      const data = (await res.json()) as GeminiResponse;
      if (!res.ok) {
        throw new Error(data.error?.message ?? `Gemini API error (${res.status})`);
      }

      soron =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? null;
      if (!soron) soronError = "Gemini から総評が返ってきませんでした";
    } catch (err) {
      // Gemini が失敗してもレポート自体は返す（総評なし）
      soronError =
        err instanceof Error ? err.message : "総評の生成に失敗しました";
    }
  } else if (top.length && !process.env.GEMINI_API_KEY) {
    soronError = "GEMINI_API_KEY が未設定のため総評をスキップしました";
  }

  const report = buildReportText(top, soron);
  return NextResponse.json({ report, soron, soronError });
}
