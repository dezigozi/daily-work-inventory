export type Freq = "high" | "mid" | "low";
export type Cost = "low" | "mid" | "high";

export interface Entry {
  id: number;
  text: string;
  count: number;
  freq: Freq;
  cost: Cost;
  done: boolean;
  /** 最終記録日（"M/D" 表示用） */
  date: string;
}

export const FREQ_JP: Record<Freq, string> = { high: "高", mid: "中", low: "低" };
export const COST_JP: Record<Cost, string> = { low: "小", mid: "中", high: "大" };
