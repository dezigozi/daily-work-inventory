import type { Entry } from "./types";

/**
 * 同一判定：キーワードマッチ（先頭6文字の包含 or 相互包含）。
 * AIによる意味判定はしない。精度は使いながら調整する前提の初期実装。
 * モックアップ（friction-log.html）のロジックをそのまま移植。
 */
export function findSimilar(entries: Entry[], text: string): Entry | undefined {
  const key = text.replace(/\s/g, "");
  if (!key) return undefined;
  const short = key.slice(0, 6);
  return entries.find((e) => {
    const ek = e.text.replace(/\s/g, "");
    const eshort = ek.slice(0, 6);
    return ek.includes(short) || key.includes(eshort);
  });
}

/** 一覧表示用ソート：未完了が上、回数の多い順 */
export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) => Number(a.done) - Number(b.done) || b.count - a.count,
  );
}

/** "M/D" 形式の日付文字列。offset は今日からの日数。 */
export function todayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
