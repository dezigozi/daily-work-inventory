import type { Entry } from "./types";
import { FREQ_JP, COST_JP } from "./types";

/** 改善候補 TOP5（3回以上・未実装のものを回数順） */
export function getTop5(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.count >= 3 && !e.done)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function weekNo(d = new Date()): string {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(
    ((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7,
  );
  return `week ${wk}`;
}

export function weekRange(d = new Date()): string {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;
  return `${f(mon)}〜${f(sun)}`;
}

/**
 * コピー用レポートテキストを組み立てる。
 * soron に Haiku の総評コメントが渡されればレポートに差し込む。
 */
export function buildReportText(top: Entry[], soron?: string | null): string {
  if (!top.length) return "（まだ3回以上の改善候補がありません）";

  let txt = `## ${weekNo()} 改善レポート（${weekRange()}）\n\n【改善候補 TOP${top.length}】\n`;
  top.forEach((e, i) => {
    txt += `${i + 1}. ${e.text}（${e.count}回）\n`;
    txt += `   → 頻度:${FREQ_JP[e.freq]} / コスト:${COST_JP[e.cost]}`;
    if (e.freq === "high" && e.cost === "low") txt += " → 即ツール化推奨";
    txt += "\n";
  });

  if (soron && soron.trim()) {
    txt += `\n【総評（Haiku）】\n${soron.trim()}\n`;
  }

  txt += `\n【メモ】\n回数が多くコストが小さいものから着手すると費用対効果が高い。`;
  txt += `\nこのレポートを Claude に貼って「friction-to-prd スキルで壁打ちして」と言うと実装仕様まで進めます。`;
  return txt;
}
