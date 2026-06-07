import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadEntries } from "@/lib/store";
import { getTop5, buildReportText } from "@/lib/report";
import { FREQ_JP, COST_JP } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/report — 週次レポートを生成して返す。
 * TOP5 と、Haiku による「頻度×コストから優先度の一言コメント」総評を含む。
 * Haiku 呼び出しはこのタイミングで1回だけ（毎入力では呼ばない＝コスト最小）。
 */
export async function POST() {
  const entries = await loadEntries();
  const top = getTop5(entries);

  let soron: string | null = null;
  let soronError: string | null = null;

  if (top.length && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const list = top
        .map(
          (e, i) =>
            `${i + 1}. ${e.text}（${e.count}回, 頻度:${FREQ_JP[e.freq]}, コスト:${COST_JP[e.cost]}）`,
        )
        .join("\n");

      const msg = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        system:
          "あなたは業務改善のアドバイザー。与えられた『繰り返している不便な作業』のTOP5を見て、" +
          "頻度とコストから優先順位を読み取り、どれから着手すべきかを1〜2文で前向きに助言する。" +
          "頻度が高くコストが小さいものを最優先に挙げること。箇条書きや前置きは不要で、本文のみを返す。",
        messages: [
          {
            role: "user",
            content: `今週の改善候補TOP5:\n${list}\n\nこの中から優先すべきものと理由を1〜2文で。`,
          },
        ],
      });

      soron = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    } catch (err) {
      // Haiku が失敗してもレポート自体は返す（総評なし）
      soronError =
        err instanceof Error ? err.message : "総評の生成に失敗しました";
    }
  } else if (top.length && !process.env.ANTHROPIC_API_KEY) {
    soronError = "ANTHROPIC_API_KEY が未設定のため総評をスキップしました";
  }

  const report = buildReportText(top, soron);
  return NextResponse.json({ report, soron, soronError });
}
