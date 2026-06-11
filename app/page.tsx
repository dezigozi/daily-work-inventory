"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/lib/types";
import { FREQ_JP, COST_JP } from "@/lib/types";
import { getTop5, weekNo } from "@/lib/report";
import { todayStr } from "@/lib/match";

type Tab = "log" | "report";

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tab, setTab] = useState<Tab>("log");
  const [input, setInput] = useState("");
  const [alert, setAlert] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // レポート関連
  const [report, setReport] = useState("");
  const [soronNote, setSoronNote] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekLabel = `${weekNo()} / ${new Date().getFullYear()}`;

  // ===== 初期ロード =====
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/entries");
        const data = await res.json();
        setEntries(data.entries ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  function showAlert(text: string) {
    setAlert(`「${text.slice(0, 24)}」を改善候補に昇格させた`);
    if (alertTimer.current) clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlert(null), 5000);
  }

  // ===== 記録追加 =====
  async function addEntry() {
    const text = input.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries ?? []);
        setInput("");
        if (data.promoted) showAlert(data.promoted);
        else showToast("記録した！🖊️");
      } else {
        showToast(data.error ?? "保存に失敗したで");
      }
    } catch {
      showToast("通信エラーやで");
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  }

  // ===== ワンタップ再記録（+1） =====
  async function bumpEntry(id: number) {
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bump: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries ?? []);
        if (data.promoted) showAlert(data.promoted);
        else showToast("＋1 記録したで 🔥");
      }
    } catch {
      showToast("通信エラーやで");
    } finally {
      setBusyId(null);
    }
  }

  async function delEntry(id: number) {
    const target = entries.find((e) => e.id === id);
    if (
      target &&
      target.count >= 2 &&
      !window.confirm(`「${target.text}」（${target.count}回）を削除する？`)
    ) {
      return;
    }
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) setEntries(data.entries ?? []);
  }

  async function toggleDone(id: number, current: boolean) {
    const res = await fetch(`/api/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !current }),
    });
    const data = await res.json();
    if (res.ok) setEntries(data.entries ?? []);
  }

  async function cycleScore(id: number, field: "freq" | "cost") {
    const res = await fetch(`/api/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycle: field }),
    });
    const data = await res.json();
    if (res.ok) setEntries(data.entries ?? []);
  }

  // ===== レポート生成（Haiku総評つき） =====
  async function genReport() {
    setReportLoading(true);
    setSoronNote(null);
    try {
      const res = await fetch("/api/report", { method: "POST" });
      const data = await res.json();
      setReport(data.report ?? "");
      if (data.soronError) setSoronNote(data.soronError);
    } catch {
      setReport("（レポート生成に失敗したで）");
    } finally {
      setReportLoading(false);
    }
  }

  // レポートタブを開いたら自動生成
  useEffect(() => {
    if (tab === "report") genReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      showToast("コピーした！Claudeに貼ってな 📋");
    } catch {
      window.prompt("手動でコピーしてね（Cmd/Ctrl+C）", report);
    }
  }

  const top5 = getTop5(entries);
  const todayCount = entries.filter((e) => e.date === todayStr()).length;

  return (
    <div className="app">
      <header>
        <div className="logo">
          <span className="flame">🔥</span> friction log
        </div>
        <div className="week">
          {todayCount > 0 && (
            <span className="today-badge">今日 {todayCount}件 🔥</span>
          )}
          {weekLabel}
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${tab === "log" ? "active" : ""}`}
          onClick={() => setTab("log")}
        >
          記録
        </button>
        <button
          className={`tab ${tab === "report" ? "active" : ""}`}
          onClick={() => setTab("report")}
        >
          週次レポート
        </button>
      </div>

      {/* ===== 記録タブ ===== */}
      {tab === "log" && (
        <div>
          <div className="input-row">
            <input
              ref={inputRef}
              type="text"
              value={input}
              autoFocus
              placeholder="今日不便だったことを1行で…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // IME変換確定のEnterでは送信しない
                if (e.key === "Enter" && !e.nativeEvent.isComposing) addEntry();
              }}
            />
            <button
              className="btn btn-primary"
              onClick={addEntry}
              disabled={adding}
            >
              ＋ 記録
            </button>
          </div>
          <div className="hint">
            同じ内容を 3回 記録すると「改善候補」に昇格するで。2回目からは{" "}
            <strong>＋1</strong> をタップするだけでOK！
          </div>

          {alert && (
            <div className="alert-banner">
              🔔{" "}
              <span>
                <strong>3回目やで！</strong>
                {alert}
              </span>
            </div>
          )}

          <div className="section-label">今週の記録</div>
          <div className="log-list">
            {loading ? (
              <div className="empty">読み込み中…</div>
            ) : entries.length === 0 ? (
              <div className="empty">
                まだ記録なし。不便を感じたら1行書いてみて 🖊️
              </div>
            ) : (
              entries.map((e) => (
                <div
                  key={e.id}
                  className={`log-item ${e.count >= 3 ? "hot" : ""} ${
                    e.done ? "done" : ""
                  }`}
                >
                  <div className="log-text">
                    {e.count >= 3 ? "⚠️ " : ""}
                    {e.text}
                  </div>
                  <div className="log-meta">
                    <span className={`count-badge ${e.count >= 3 ? "hot" : ""}`}>
                      {e.count}回
                    </span>
                    <span className="log-date">{e.date}</span>
                    {!e.done && (
                      <button
                        className="bump-btn"
                        title="同じ不便がまた起きた（+1）"
                        onClick={() => bumpEntry(e.id)}
                        disabled={busyId === e.id}
                      >
                        ＋1
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title="完了"
                      onClick={() => toggleDone(e.id, e.done)}
                    >
                      ✓
                    </button>
                    <button
                      className="icon-btn"
                      title="削除"
                      onClick={() => delEntry(e.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== 週次レポートタブ ===== */}
      {tab === "report" && (
        <div>
          <div className="section-label">改善候補 TOP 5（3回以上）</div>
          <div className="log-list">
            {top5.length === 0 ? (
              <div className="empty">
                まだ3回以上の候補なし。記録がたまると出てくるで 📈
              </div>
            ) : (
              top5.map((e, i) => (
                <div key={e.id} className={`log-item ${i === 0 ? "hot" : ""}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      flex: 1,
                    }}
                  >
                    <span className="rank">{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div className="log-text" style={{ fontWeight: 600 }}>
                        {e.text}
                      </div>
                      <div className="scoring-controls">
                        <span
                          className={`chip ${e.freq === "high" ? "on" : ""}`}
                          onClick={() => cycleScore(e.id, "freq")}
                        >
                          頻度: {FREQ_JP[e.freq]}
                        </span>
                        <span
                          className={`chip ${e.cost === "low" ? "on" : ""}`}
                          onClick={() => cycleScore(e.id, "cost")}
                        >
                          コスト: {COST_JP[e.cost]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="count-badge hot">{e.count}回</span>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-label">
              コピー用テキスト（Claudeに貼ってね）
            </div>
            <div className="report-box">
              {reportLoading ? "総評を生成中…（Gemini）" : report}
            </div>
            {soronNote && <div className="soron-note">※ {soronNote}</div>}
            <div className="report-actions">
              <button
                className="btn btn-sm btn-primary"
                onClick={copyReport}
                disabled={reportLoading || !report}
              >
                📋 TOP5をコピー
              </button>
              <button
                className="btn btn-sm"
                onClick={genReport}
                disabled={reportLoading}
              >
                ↻ 再生成
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
