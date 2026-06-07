# friction log — 日常の不便・棚卸しアプリ

## 目的
毎日使う作業ほど「不便を日常」と受け入れてしまい、改善対象として認識されない。
この「気づけない不便」を **記録 → 集計 → 改善ループ** に乗せて顕在化させる、個人用（非商用・一人用）ツール。

不便を1行で記録 → 同じ内容が3回たまると「改善候補」に昇格 → 週次レポートで TOP5 を出し、
Haiku の総評つきで Claude に貼って `friction-to-prd` スキルへ繋げる、までが一連の流れ。

---

## 使い方

### ローカル開発
```bash
npm install
npm run dev          # http://localhost:3000
```
- **Upstash の認証情報なしでもすぐ動く。** その場合データは `.data/entries.json`（gitignore済み）に保存される。
- Haiku 総評を試したい場合は `.env.local` に `ANTHROPIC_API_KEY` を入れる（未設定でもレポート本文は出る／総評だけスキップ）。

```bash
cp .env.local.example .env.local   # 必要な値を埋める
```

### 操作
1. **記録タブ**：不便だったことを1行入力して「＋記録」。同一判定された入力は新規追加されず回数が +1。
2. 同じ項目が **3回** に達すると通知バナーが出て「改善候補」に昇格（⚠️ 表示）。
3. **週次レポートタブ**：3回以上の項目を回数順に TOP5 表示。タブを開くと総評を自動生成。
4. 各候補の **頻度（高/中/低）／コスト（小/中/大）** はチップをタップで切り替え（保存される）。
5. **📋 TOP5をコピー** でレポート全文をクリップボードへ。Claude に貼って壁打ちへ。
6. ✓ で実装済み（完了）トグル、✕ で削除。完了にすると TOP5 から外れる。

---

## アーキテクチャ（実態に合わせた構成）

| レイヤ | 実装 |
|---|---|
| フロント/サーバー | Next.js 15（App Router）+ TypeScript + Tailwind CSS v4 |
| デザイン | モックアップ `friction-log.html` の CSS を `app/globals.css` に移植（ダークモード対応そのまま） |
| データ保存 | `lib/store.ts` がサーバー側で吸収。**Upstash Redis（Vercel KV）** が設定されていればそれ、無ければ **ローカルファイル** にfallback |
| API | Next.js API Routes 経由（クライアントから直接 KV / API キーを触らせない） |
| AI | Anthropic API（`claude-haiku-4-5`）。週次レポート生成時に1回だけ呼ぶ＝コスト最小 |

### 同一判定（`lib/match.ts`）
モックアップ同様のキーワードマッチ。先頭6文字の包含 or 相互包含。AI 意味判定はしない。精度は使いながら調整する前提。
**同一判定と3回昇格はサーバー側を真実の源にしている**（API Routes 内で実施）。

### ディレクトリ
```
app/
  layout.tsx            ルートレイアウト
  globals.css           デザイン（モックアップ移植）
  page.tsx              記録/週次レポート タブ（クライアントコンポーネント）
  api/
    entries/route.ts          GET 一覧 / POST 追加（同一判定・3回昇格）
    entries/[id]/route.ts     PATCH 頻度コスト切替・完了 / DELETE 削除
    report/route.ts           POST レポート生成（TOP5 + Haiku総評）
lib/
  types.ts    Entry 型・日本語ラベル
  match.ts    同一判定・日付
  store.ts    Upstash / ファイル fallback の切替（server-only）
  report.ts   TOP5・週番号・レポート組み立て（クライアント/サーバー共用）
```

---

## デプロイ手順（Vercel）

1. このリポジトリを Vercel にインポート（Framework は Next.js 自動検出）。
2. **Vercel Marketplace から Upstash（Redis）を接続** する。
   - ※ Vercel KV は現在 Upstash Redis ベース。Marketplace 経由で接続すると `KV_REST_API_URL` / `KV_REST_API_TOKEN`（または `UPSTASH_REDIS_REST_URL/TOKEN`）が自動で環境変数に入る。`store.ts` は両方の命名に対応済み。
   - 最新の接続手順は接続時に Vercel 側で案内が出るので、それに従う。
3. 環境変数に **`ANTHROPIC_API_KEY`** を追加（Haiku 総評用、サーバー側のみ）。
4. デプロイ。発行された URL を PC・スマホ両方で開いて動作確認。

> ローカルのファイル fallback は開発専用。Vercel のサーバーレス環境はファイルシステムが永続しないため、**本番は必ず Upstash を接続すること**（未接続だとリクエストごとにデータが消える）。

---

## 受け入れ条件 チェック
- [x] 1行入力して保存すると記録一覧に即反映
- [x] 同一判定された入力は新規追加されず回数が +1
- [x] 同一項目が3回で通知バナー＋改善候補に昇格
- [x] 週次レポートに3回以上の項目を回数順 TOP5 表示
- [x] 頻度・コストをタップ切り替え＆保存
- [x] コピーボタンでレポート全文をクリップボードへ
- [x] レポート生成時に Haiku が優先度の総評を返す（APIキー設定時）
- [x] ブラウザ再起動後もデータが残る（KV/ファイルに永続化）
- [ ] Vercel にデプロイして URL で PC・スマホ両方から開ける ← **デプロイ作業で確認**

---

## 更新履歴
- 2026-06-07 初版。モックアップ `friction-log.html` を Next.js + TS + Tailwind に移植。
  KV（Upstash）／ファイル fallback のストア層、API Routes 経由の CRUD、Haiku 総評つき週次レポートを実装。
  ローカルでビルド・API のエンドツーエンド動作確認まで完了。
