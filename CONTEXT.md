# friction log — 日常の不便・棚卸しアプリ

## 目的
毎日使う作業ほど「不便を日常」と受け入れてしまい、改善対象として認識されない。
この「気づけない不便」を **記録 → 集計 → 改善ループ** に乗せて顕在化させる、個人用（非商用・一人用）ツール。

不便を1行で記録 → 同じ内容が3回たまると「改善候補」に昇格 → 週次レポートで TOP5 を出し、
Gemini の総評つきで Claude に貼って `friction-to-prd` スキルへ繋げる、までが一連の流れ。
**運用コストは全部無料枠**（Vercel Hobby / Upstash Free / Gemini API 無料枠）。

---

## 使い方

### ローカル開発
```bash
npm install
npm run dev          # http://localhost:3000
```
- **Upstash の認証情報なしでもすぐ動く。** その場合データは `.data/entries.json`（gitignore済み）に保存される。
- Gemini 総評を試したい場合は `.env.local` に `GEMINI_API_KEY` を入れる（未設定でもレポート本文は出る／総評だけスキップ）。
  キーは https://aistudio.google.com/apikey で **無料発行（クレカ不要）** できる。

```bash
cp .env.local.example .env.local   # 必要な値を埋める
```

### 操作
1. **記録タブ**：不便だったことを1行入力して「＋記録」。同一判定された入力は新規追加されず回数が +1。
   - 2回目以降は各項目の **＋1ボタン** をタップするだけで再記録できる（入力不要）。
2. 同じ項目が **3回** に達すると通知バナーが出て「改善候補」に昇格（⚠️ 表示）。＋1経由でも昇格する。
3. **週次レポートタブ**：3回以上の項目を回数順に TOP5 表示。タブを開くと総評を自動生成。
4. 各候補の **頻度（高/中/低）／コスト（小/中/大）** はチップをタップで切り替え（保存される）。
5. **📋 TOP5をコピー** でレポート全文をクリップボードへ。Claude に貼って壁打ちへ。
6. ✓ で実装済み（完了）トグル、✕ で削除（2回以上の項目は確認ダイアログあり）。完了にすると TOP5 から外れ、一覧の下に沈む。
7. **スマホはホーム画面に追加推奨**（PWA対応）。Safari/Chrome の共有メニュー →「ホーム画面に追加」でアプリのように起動できる。

---

## アーキテクチャ（実態に合わせた構成）

| レイヤ | 実装 |
|---|---|
| フロント/サーバー | Next.js 15（App Router）+ TypeScript + Tailwind CSS v4 |
| デザイン | モックアップ `friction-log.html` の CSS を `app/globals.css` に移植（ダークモード対応そのまま） |
| データ保存 | `lib/store.ts` がサーバー側で吸収。**Upstash Redis（Vercel KV）** が設定されていればそれ、無ければ **ローカルファイル** にfallback |
| API | Next.js API Routes 経由（クライアントから直接 KV / API キーを触らせない） |
| AI | Google Gemini API（SDKなしのREST直叩き）。無料枠は **「1日あたりの回数×モデル別」** なので、(1) 総評はTOP5内容のハッシュでキャッシュしタブ開閉ではAPIを呼ばない、(2) 上限時は flash-lite → 2.5-flash → 2.0-flash へ自動フォールバック、(3) 全滅時も前回キャッシュを表示。`GEMINI_MODEL` でチェーン先頭を上書き可 |

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
3. 環境変数に **`GEMINI_API_KEY`** を追加（Gemini 総評用、サーバー側のみ。AI Studio で無料発行）。
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
- [x] レポート生成時に Gemini が優先度の総評を返す（APIキー設定時）
- [x] ブラウザ再起動後もデータが残る（KV/ファイルに永続化）
- [x] Vercel にデプロイして URL で PC・スマホ両方から開ける（https://daily-work-inventory.vercel.app）

---

## 更新履歴
- 2026-06-11 Gemini無料枠（1日20回・モデル別）に合わせた総評の本質対策。
  従来はレポートタブを開くたびにAPIを呼んでいたため1日で枠が尽きる設計だった。
  (1) TOP5内容のハッシュによるサーバー側キャッシュ（内容不変ならAPI呼び出しゼロ、再生成ボタンのみ強制生成）、
  (2) 枠超過時のモデル自動フォールバック（flash-lite → 2.5-flash → 2.0-flash、枠はモデル別なので有効）、
  (3) 全モデル枠切れ時も前回キャッシュ表示＋日本語の説明メッセージ。
  フォールバック・キャッシュヒット・強制再生成の3パターンをローカルで実証済み。
- 2026-06-11 総評AIを Anthropic（claude-haiku-4-5）→ Google Gemini（gemini-2.5-flash-lite）に移行。
  無料運用を最優先とし、AI Studio の無料キー（クレカ不要）で動く構成に。SDK依存を外しREST直叩きに変更。
  環境変数は `ANTHROPIC_API_KEY` → `GEMINI_API_KEY`（Vercel側の差し替えが必要）。
- 2026-06-11 日常利用の摩擦を削減する改善。
  ＋1ワンタップ再記録（PATCH bump、3回昇格対応）／IME変換確定Enterの誤送信修正／
  入力オートフォーカス＋iOSフォーカスズーム防止（font-size 16px）／今日の記録数バッジ／
  完了項目を一覧の下に沈めるソート／2回以上の項目の削除確認／スマホのタップ領域拡大／
  PWA対応（manifest・アイコン・テーマカラー、ホーム画面追加でアプリ起動可）。
- 2026-06-07 初版。モックアップ `friction-log.html` を Next.js + TS + Tailwind に移植。
  KV（Upstash）／ファイル fallback のストア層、API Routes 経由の CRUD、Haiku 総評つき週次レポートを実装。
  ローカルでビルド・API のエンドツーエンド動作確認まで完了。
- 2026-06-07 Vercel 本番デプロイ完了（https://daily-work-inventory.vercel.app）。
  Upstash for Redis（東京リージョン・Free）を接続し、本番でKV永続化の動作確認済み。
  受け入れ条件すべてクリア。
