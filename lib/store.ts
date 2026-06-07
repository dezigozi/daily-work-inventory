import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Entry } from "./types";

const STORE_KEY = "frictionLog:entries:v1";

/**
 * データ層。サーバー側のみで動く（クライアントから直接 KV / API キーを触らせない）。
 *
 * - 本番（Vercel）: Upstash Redis（Vercel KV）を使う。
 *   環境変数 KV_REST_API_URL / KV_REST_API_TOKEN が入っていれば自動でこちら。
 * - ローカル開発: 上記が無ければ .data/entries.json に保存するfallback。
 *   Upstash の認証情報なしでもすぐ動かせる。
 */

interface Backend {
  load(): Promise<Entry[]>;
  save(entries: Entry[]): Promise<void>;
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
    async load() {
      const data = await redis.get<Entry[]>(STORE_KEY);
      return Array.isArray(data) ? data : [];
    },
    async save(entries) {
      await redis.set(STORE_KEY, entries);
    },
  };
}

// ---- Local file backend (dev fallback) ----
function makeFileBackend(): Backend {
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "entries.json");
  return {
    async load() {
      try {
        const raw = await fs.readFile(file, "utf8");
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    async save(entries) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(entries, null, 2), "utf8");
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

export function loadEntries(): Promise<Entry[]> {
  return getBackend().load();
}

export function saveEntries(entries: Entry[]): Promise<void> {
  return getBackend().save(entries);
}
