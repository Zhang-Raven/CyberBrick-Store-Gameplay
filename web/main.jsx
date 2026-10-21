import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import PrinterSettings from "./PrinterSettings.jsx";
import { PERSONALITY_DIMENSIONS } from "../src/personality.js";

const charms = ["贪狼", "禄存", "巨门", "廉贞", "武曲", "破军", "辅星"];
const steps = ["fortune", "selection", "slicing", "submitting", "confirmation", "printing", "completed"];
const labels = { fortune: "人格", selection: "选符", slicing: "备料", submitting: "送入", confirmation: "确认", printing: "打印", completed: "完成" };

function App() {
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [job, setJob] = useState(null);
  const [printer, setPrinter] = useState({ connected: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [checked, setChecked] = useState(false);
  const [runtime, setRuntime] = useState({ ready: false, missing: [] });
  const [catalogError, setCatalogError] = useState("");
  const [mode, setMode] = useState("real");
  const [clock, setClock] = useState(new Date());
  const [previewAvailable, setPreviewAvailable] = useState(true);

  const personality = useMemo(() => answers.join(""), [answers]);
  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/status");
        const data = await response.json();
        setPrinter(data.printer || { connected: false });
        setMode(data.mode);
        setRuntime(data.runtime || { ready: false, missing: [] });
        setCatalogError(data.catalogError || "");
        setConfirmation(previous => { if (previous?.id !== data.confirmation?.id) setChecked(false); return data.confirmation || null; });
        setPreviewAvailable(true);
        if (data.job) setJob(data.job);
      } catch { setPrinter({ connected: false }); }
    };
    refresh();
    const timer = setInterval(() => { refresh(); setClock(new Date()); }, 1800);
    return () => clearInterval(timer);
  }, []);

  async function start() {
    if (personality.length !== 4) { setError("请先完成四个小选择，生成你的九辰人格"); return; }
    setBusy(true); setError(""); setJob({ stage: "fortune", status: "running", message: "正在读取你的九辰人格" });
    try {
      const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personality }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "任务启动失败");
      setJob(data.job);
    } catch (e) { setError(e.message); setJob(null); }
    finally { setBusy(false); }
  }
  async function confirmPrint(confirmed) {
    try {
      const response = await fetch("/api/confirmation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: confirmation.id, confirmed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfirmation(null); setChecked(false);
    } catch (e) { setError(e.message); }
  }
  async function resolveJob() {
    try {
      const response = await fetch("/api/job/resolve", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setJob(data.job); setError("");
    } catch (e) { setError(e.message); }
  }

  const activeIndex = Math.max(0, steps.indexOf(job?.stage));
  const taskRunning = busy || ["running", "attention"].includes(job?.status);
  const result = job?.result;
  const selected = job?.selection || result?.selection;
  const fortune = job?.fortune || result?.fortune;
  const progress = Number(printer.hardwareProgress ?? result?.print?.progress ?? 0);
  const isPrinting = ["RUNNING", "PREPARE", "PAUSE"].includes(printer.status);
  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(clock);
  const canStart = personality.length === 4 && !taskRunning && !(mode === "real" && (!printer.connected || !runtime.ready)) && !catalogError;

  return <main className="site-shell">
    <header className="site-header"><div className="brand-lockup"><span className="brand-dot">九</span><div><b>九辰 × Bambu Lab</b><small>OFFLINE STORE EXPERIENCE</small></div></div><div className="header-status"><span className={`status-dot ${printer.connected ? "on" : ""}`} />{printer.connected ? "打印机在线" : "等待现场连接"}<span className="header-date">{now}</span></div></header>

    <section className="cover-card"><div className="cover-image"><div className="cover-copy"><span className="cover-kicker">2026 · 九辰人格灯符计划</span><h1>让你的<br /><em>人格发光</em></h1><p>完成四个轻量选择，生成一枚属于你的蓝白灯符。到店后连接同一局域网，即可确认打印。</p></div><div className="cover-arrow">↗</div><div className="cover-mark">BAMBU<br /><small>LAB</small></div></div><div className="cover-caption"><span>九辰人格测试</span><b>01 / 04</b><i>向下探索 ↓</i></div></section>

    <aside className="network-strip"><span className="network-icon">⌁</span><div><strong>到店打印前，请让手机 / 电脑与拓竹打印机连接同一 Wi-Fi 或热点</strong><small>现在可以先填写参数和体验测试；不在同一局域网时会显示“等待现场连接”，不会误提交打印。</small></div><span className={`network-state ${printer.connected ? "ready" : "waiting"}`}>{printer.connected ? "已连接" : "现场连接"}</span></aside>
    <PrinterSettings locked={busy || job?.status === "running"} onChanged={p => p && setPrinter(p)} />

    <section className="step-grid">
      <div className="step-label"><span>01</span><div><small>PERSONALITY TEST</small><h2>先认识今天的你</h2></div></div>
      <div className="personality-card"><p className="card-intro">每行选一个更像你的答案，四个字母会组成你的九辰人格。</p>{PERSONALITY_DIMENSIONS.map((item, index) => <div className="question-row" key={item.left}><span className="question-number">0{index + 1}</span><div className="question-copy"><b>{item.prompt}</b><small>{item.leftLabel} / {item.rightLabel}</small></div><div className="choice-pair"><button className={answers[index] === item.left ? "chosen" : ""} onClick={() => setAnswers(prev => prev.map((value, i) => i === index ? item.left : value))}>{item.left}</button><button className={answers[index] === item.right ? "chosen" : ""} onClick={() => setAnswers(prev => prev.map((value, i) => i === index ? item.right : value))}>{item.right}</button></div></div>)}<div className="personality-footer"><div className="type-preview">{personality || "— — — —"}</div><button className="lime-button" onClick={start} disabled={!canStart}>{taskRunning ? "正在生成…" : "生成我的灯符  ↗"}</button></div>{(error || job?.error || catalogError) && <div className="error">{error || job?.error || catalogError}</div>}{mode === "real" && !runtime.ready && <div className="soft-warning">打印环境还未就绪：{runtime.missing?.join("、") || "到现场连接打印机后再测试"}</div>}{job?.status === "attention" && <><p className="soft-warning">上一次任务需要现场核对打印机状态。</p><button className="outline-button" onClick={resolveJob}>已检查设备，结束旧任务监控</button></>}{job?.message && <p className="job-message" aria-live="polite">{job.message}</p>}</div>

      <div className="step-label"><span>02</span><div><small>YOUR CHARM</small><h2>你的今日灯符</h2></div></div>
      <div className="charm-card">{selected ? <><div className="charm-preview">{previewAvailable ? <img src={`/api/charm/thumbnail?name=${encodeURIComponent(selected.charm)}`} alt={`${selected.charm}灯符预览`} onError={() => setPreviewAvailable(false)} /> : <strong>{selected.charm}</strong>}</div><div className="charm-copy"><span>九辰人格 · {fortune?.personality || personality}</span><h3>{selected.charm}<em>符</em></h3><p>{fortune?.summary || selected.reason || "为你匹配的今日主题"}</p><div className="charm-tags">{charms.map(name => <span className={selected.charm === name ? "active" : ""} key={name}>{name}</span>)}</div></div></> : <div className="empty-charm"><span>✦</span><b>完成测试后，这里会出现你的灯符</b><small>蓝 / 白 PLA · 0.4 mm · 拓竹 X2D</small></div>}</div>

      <div className="step-label"><span>03</span><div><small>PRINT LIVE</small><h2>看见它正在发生</h2></div></div>
      <div className="print-card"><div className="print-card-head"><div><small>现场设备</small><h3>Bambu Lab {printer.model || "X2D"}</h3><p>{printer.serial || printer.host || "等待打印机参数"}</p></div><span className={`big-state ${printer.connected ? "online" : "offline"}`}>{printer.connected ? (isPrinting ? "打印中" : "设备在线") : "等待连接"}</span></div><div className="print-progress"><div className="progress-row"><span>{isPrinting ? "灯符正在逐层成形" : selected ? "灯符已准备，等待确认" : "完成人格测试后开始"}</span><b>{isPrinting ? `${progress}%` : selected ? "READY" : "—"}</b></div><div className="progress-bar"><i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div><div className="print-meta"><span>状态 <b>{printer.status || "待机"}</b></span><span>层数 <b>{isPrinting ? `${printer.layerNum ?? "—"} / ${printer.totalLayers ?? "—"}` : "—"}</b></span><span>剩余 <b>{isPrinting ? `${printer.remainingMinutes ?? "—"} min` : "—"}</b></span><span>温度 <b>{printer.nozzleTemp ?? "—"}°C</b></span></div></div><div className="process-line">{steps.map((step, index) => <span className={index < activeIndex ? "done" : index === activeIndex && taskRunning ? "current" : ""} key={step}><i>{index < activeIndex ? "✓" : index + 1}</i>{labels[step]}</span>)}</div></div>
    </section>

    {confirmation && <div className="confirm-modal"><div><span className="modal-kicker">最后一步 · 现场确认</span><h2>准备打印「{selected?.charm}符」</h2><p>{confirmation.message || "请核对蓝白 PLA 耗材，并确认打印板已清空。"}</p><label><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> 我已核对耗材，打印板已清空</label><div><button className="lime-button" disabled={!checked} onClick={() => confirmPrint(true)}>开始真实打印 ↗</button><button className="outline-button" onClick={() => confirmPrint(false)}>先不打印</button></div></div></div>}
    <footer><span>九辰 × Bambu Lab · 线下店联名体验</span><span>灯符是体验，连接状态以现场设备为准</span></footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
