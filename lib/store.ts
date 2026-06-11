import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Entry } from "./types";

const STORE_KEY = "frictionLog:entries:v1";
const SORON_CACHE_KEY = "frictionLog:soronCache:v1";

/** ローカルfallback時のキー→ファイル名対応（entries.json は初版からの互換維持） */
const FILE_NAMES: Record<string, string> = {
  [STORE_KEY]: "entries.json",
  [SORON_CACHE_KEY]: "soron-cache.json",
};

/**
 * データ層。サーバー側のみで動く（クライアントから直接 KV / API キーを触らせない）。
 *
 * - 本番（Vercel）: Upstash Redis（Vercel KV）を使う。
 *   環境変数 KV_REST_API_URL / KV_REST_API_TOKEN が入っていれば自動でこちら。
 * - ローカル開発: 上記が無ければ .data/ 配下のJSONに保存するfallback。
 *   Upstash の認証情報なしでもすぐ動かせる。
 */

interface Backend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

// ---- Upstash Redis backend ----
function makeRedisBackend(): Backend | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // 動的 import 相当を避け、ここで require して未設定環境でも読み込みコストを抑える
  // （@upstash/redis は edge/node 両対応の純粋 fetch ベース）
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  const redis = new Redis({ url, token });

  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value) {
      await redis.set(key, value);
    },
  };
}

// ---- Local file backend (dev fallback) ----
function makeFileBackend(): Backend {
  const dir = path.join(process.cwd(), ".data");
  const fileFor = (key: string) =>
    path.join(dir, FILE_NAMES[key] ?? `${key.replace(/[^\w-]/g, "_")}.json`);
  return {
    async get(key) {
      try {
        return JSON.parse(await fs.readFile(fileFor(key), "utf8"));
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fileFor(key), JSON.stringify(value, null, 2), "utf8");
    },
  };
}

let backend: Backend | null = null;
function getBackend(): Backend {
  if (!backend) backend = makeRedisBackend() ?? makeFileBackend();
  return backend;
}

export function usingRedis(): boolean {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && token);
}

export async function loadEntries(): Promise<Entry[]> {
  const data = await getBackend().get(STORE_KEY);
  return Array.isArray(data) ? (data as Entry[]) : [];
}

export function saveEntries(entries: Entry[]): Promise<void> {
  return getBackend().set(STORE_KEY, entries);
}

// ---- 週次レポート総評のキャッシュ ----
// TOP5の内容が変わらない限りGeminiを呼び直さないための保存領域。
// 無料枠（1日あたり・モデル別の回数制限）をタブ開閉で浪費しないことが目的。

export interface SoronCache {
  /** TOP5内容のハッシュ。一致すればキャッシュ有効 */
  hash: string;
  soron: string;
  /** 生成に使ったモデル名 */
  model: string;
}

export async function loadSoronCache(): Promise<SoronCache | null> {
  const data = (await getBackend().get(SORON_CACHE_KEY)) as SoronCache | null;
  return data && typeof data.hash === "string" && typeof data.soron === "string"
    ? data
    : null;
}

export function saveSoronCache(cache: SoronCache): Promise<void> {
  return getBackend().set(SORON_CACHE_KEY, cache);
}
