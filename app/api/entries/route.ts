import { NextResponse } from "next/server";
import { loadEntries, saveEntries } from "@/lib/store";
import { findSimilar, sortEntries, todayStr } from "@/lib/match";
import type { Entry } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/entries — 記録一覧（回数の多い順）
export async function GET() {
  const entries = await loadEntries();
  return NextResponse.json({ entries: sortEntries(entries) });
}

// POST /api/entries — 記録追加（同一判定→既存なら+1、新規なら追加）
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const entries = await loadEntries();
  const hit = findSimilar(entries, text);

  let promoted: string | null = null; // 3回到達で昇格した項目のテキスト

  if (hit) {
    hit.count += 1;
    hit.date = todayStr(0);
    if (hit.count === 3) promoted = hit.text;
  } else {
    const fresh: Entry = {
      id: Date.now(),
      text,
      count: 1,
      freq: "mid",
      cost: "mid",
      done: false,
      date: todayStr(0),
    };
    entries.unshift(fresh);
  }

  await saveEntries(entries);
  return NextResponse.json({ entries: sortEntries(entries), promoted });
}
