import { NextResponse } from "next/server";
import { loadEntries, saveEntries } from "@/lib/store";
import { sortEntries, todayStr } from "@/lib/match";
import type { Cost, Entry, Freq } from "@/lib/types";

export const dynamic = "force-dynamic";

const FREQ_ORDER: Freq[] = ["high", "mid", "low"];
const COST_ORDER: Cost[] = ["low", "mid", "high"];

function cycle<T>(order: T[], current: T): T {
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

// PATCH /api/entries/[id] — 頻度/コストの切り替え・完了トグル・+1再記録
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);
  const body = (await req.json().catch(() => ({}))) as {
    cycle?: "freq" | "cost";
    done?: boolean;
    bump?: boolean;
  };

  const entries = await loadEntries();
  const entry = entries.find((e) => e.id === numId);
  if (!entry) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let promoted: string | null = null;

  if (body.cycle === "freq") entry.freq = cycle(FREQ_ORDER, entry.freq);
  else if (body.cycle === "cost") entry.cost = cycle(COST_ORDER, entry.cost);
  if (typeof body.done === "boolean") entry.done = body.done;
  if (body.bump) {
    entry.count += 1;
    entry.date = todayStr(0);
    if (entry.count === 3) promoted = entry.text;
  }

  await saveEntries(entries);
  return NextResponse.json({ entries: sortEntries(entries), promoted });
}

// DELETE /api/entries/[id] — 記録削除
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);

  const entries = await loadEntries();
  const next: Entry[] = entries.filter((e) => e.id !== numId);
  await saveEntries(next);
  return NextResponse.json({ entries: sortEntries(next) });
}
