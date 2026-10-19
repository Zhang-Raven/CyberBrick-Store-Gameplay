import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import PrinterSettings from "./PrinterSettings.jsx";

const charms = ["贪狼", "禄存", "巨门", "廉贞", "武曲", "破军", "辅星"];
const steps = ["fortune", "selection", "slicing", "submitting", "confirmation", "printing", "completed"];
const labels = { fortune: "今日运势", selection: "符箓匹配", slicing: "文件准备", submitting: "提交设备", confirmation: "打印确认", printing: "打印机运行", completed: "完成" };

function App() {
  const [year, setYear] = useState(1990);
  const [month, setMonth] = useState(5);
  const [job, setJob] = useState(null);
  const [printer, setPrinter] = useState({ connected: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [checked, setChecked] = useState(false);
  const [runtime, setRuntime] = useState({ ready: false, missing: [] });
  const [catalogError, setCatalogError] = useState("");
  const [mode, setMode] = useState("real");
  const [assetName, setAssetName] = useState("贪狼");
  const [assetPlate, setAssetPlate] = useState(1);
  const [assetSlots, setAssetSlots] = useState("0,3");
  const [assetFile, setAssetFile] = useState(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [previewAvailable, setPreviewAvailable] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(Date.now());

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/status");
        if (response.status === 401) { setPrinter({connected:false}); return; }
        const data = await response.json();
        setPrinter(data.printer || { connected: false });
        setMode(data.mode);
        setRuntime(data.runtime || {ready:false,missing:[]});
        setCatalogError(data.catalogError || "");
        setConfirmation(previous => { if (previous?.id !== data.confirmation?.id) setChecked(false); return data.confirmation || null; });
        setPreviewVersion(Date.now());
        setPreviewAvailable(true);
        if (data.job) setJob(data.job);
      } catch { setPrinter({ connected: false }); }
    };
    refresh();
    const timer = setInterval(() => { refresh(); setClock(new Date()); }, 1800);
    return () => clearInterval(timer);
  }, []);

  async function start() {
    setBusy(true); setError(""); setJob({ stage: "fortune", status: "running", message: "正在分析今日运势" });
    try {
      const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ birthYear: Number(year), birthMonth: Number(month) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "任务启动失败");
      setJob(data.job);
    } catch (e) { setError(e.message); setJob(null); }
    finally { setBusy(false); }
  }

  async function confirmPrint(confirmed) {
    try {
      const response = await fetch("/api/confirmation", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({id: confirmation.id, confirmed}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfirmation(null); setChecked(false);
    } catch (e) { setError(e.message); }
  }
  async function uploadAsset() {
    if (!assetFile) {setError("请先选择 .gcode.3mf 文件");return;}
    setAssetBusy(true);setError("");
    try {
      const config = {name:assetName,plateIndex:Number(assetPlate)-1,useAms:true,amsSlots:assetSlots.split(/[,，]/).map(n=>Number(n.trim()))};
      const response = await fetch("/api/charms",{method:"POST",headers:{"content-type":"application/octet-stream","x-charm-config":encodeURIComponent(JSON.stringify(config))},body:assetFile});
      const data = await response.json();if(!response.ok) throw new Error(data.error);
      setError(`已保存「${assetName}」切片文件`);
    } catch(e){setError(e.message);} finally {setAssetBusy(false);}
  }
  async function resolveJob() {
    try {
      const response = await fetch("/api/job/resolve", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setJob(data.job); setError("");
    } catch (e) {setError(e.message);}
  }
  const activeIndex = Math.max(0, steps.indexOf(job?.stage));
  const taskRunning = busy || ["running", "attention"].includes(job?.status);
  const result = job?.result;
  const selected = job?.selection || result?.selection;
  const fortune = job?.fortune || result?.fortune;
  const progress = printer.hardwareProgress ?? 0;
  const isPrinting = ["RUNNING", "PREPARE"].includes(printer.status);
  const now = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(clock);

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">九</div><div><div className="brand-name">九辰 <span>祈福打印站</span></div><div className="brand-sub">NINE STARS · BLESSING STATION</div></div></div><div className="top-meta"><span className="live-dot"/> {mode === "real" ? "真实打印机 · 局域网" : "软件仿真"} <span className="divider"/>{now}</div></header>
    <section className="hero"><div className="hero-copy"><div className="eyebrow">DAILY BLESSING · REAL PRINT</div><h1>让今日心意，<em>化作一枚符签。</em></h1><p>输入出生年月，Agent 将结合今日运势，从九辰灯符的七款命名符箓中择一，通过 MCP 为 X2D 准备蓝白双色灯符，确认后开始真实打印。</p><div className="hero-note"><span>✳</span> 仅作传统文化体验与打印流程测试，不构成现实预测</div></div><div className="orbital"><div className="ring ring-one"/><div className="ring ring-two"/><div className="orbit-core">九<span>辰</span></div><i className="star s1">✦</i><i className="star s2">✧</i><i className="star s3">✦</i><i className="star s4">✧</i></div></section>
    <aside className="network-notice"><strong>连接前请确认：本地服务电脑与打印机在同一局域网</strong><p>电脑与对应打印机应连接同一 Wi-Fi 或热点。通过 Cloudflare 域名访问时，浏览器不会直接连接打印机；请保持本地服务电脑和隧道在线。</p></aside>
    <PrinterSettings locked={busy || job?.status === "running"} onChanged={p => p && setPrinter(p)}/>
    <div className="dashboard">
      <section className="panel input-panel"><div className="panel-heading"><div><div className="section-kicker">01 / YOUR BIRTH</div><h2>开始今日祈福</h2></div><span className="panel-icon">☷</span></div><p className="muted">只需出生年月，无需提供具体日期或姓名。</p><div className="birth-fields"><label>出生年份<div className="input-wrap"><input type="number" min="1900" max={new Date().getFullYear()} value={year} onChange={e=>setYear(e.target.value)}/><span>年</span></div></label><label>出生月份<div className="input-wrap"><select value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} 月</option>)}</select><span>⌄</span></div></label></div><button className="primary-button" onClick={start} disabled={taskRunning || (mode === "real" && (!printer.connected || !runtime.ready)) || Boolean(catalogError)}>{taskRunning?<><span className="spinner"/> 正在运行 Agent</>:<>生成灯符并准备打印 <span>→</span></>}</button>{(error || job?.error || catalogError) && <div className="error">{error || job?.error || catalogError}</div>}
      {mode === "real" && !runtime.ready && <div className="error">打印环境待准备：{runtime.missing?.join("、")}</div>}
      {job?.status === "attention" && <><p className="muted">任务结果尚未确认。检查打印机屏幕后再操作，避免重复打印。</p><button className="secondary-button" onClick={resolveJob}>设备已停止，结束旧任务监控</button></>}
      {job?.message && <p className="muted" aria-live="polite">{job.message}</p>}
      {confirmation && <div className="confirmation-card"><h3>准备打印「{selected?.charm}」</h3><p>X2D · 0.4mm · 蓝 / 白 PLA。请核对实物耗材，并移走打印板上的旧模型和碎屑。</p><details><summary>查看设备检查结果</summary><p>{confirmation.message}</p></details><label className="confirm-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>我已核对耗材，打印板已清空</label><button className="primary-button" disabled={!checked} onClick={() => confirmPrint(true)}>开始真实打印</button><button className="secondary-button" onClick={() => confirmPrint(false)}>取消本次打印</button></div>}<div className="privacy"><span>◈</span> 出生信息只用于本次运势生成，不保存为个人档案</div></section>
      <section className="panel status-panel"><div className="panel-heading"><div><div className="section-kicker">02 / LIVE PRINTER</div><h2>拓竹局域网打印机</h2></div><span className={`status-pill ${printer.connected?"online":"offline"}`}><i/> {printer.connected?"设备在线":"等待设备"}</span></div><div className="printer-card"><div className="fake-preview">{selected && previewAvailable ? <img src={`/api/charm/thumbnail?name=${encodeURIComponent(selected.charm)}`} title="前两层切片路径，显示实际耗材颜色" alt="所选灯符前两层切片预览" onError={() => setPreviewAvailable(false)} /> : <div className="preview-empty"><span>⌁</span><b>{printer.status === "IDLE" ? "打印机当前空闲" : "暂无打印机预览"}</b><small>选择后显示灯符前两层切片</small></div>}</div><div className="printer-info"><div className="printer-model">Bambu Lab <strong>{printer.model || "X2D"}</strong></div><div className="printer-id">{printer.serial || printer.host || "等待局域网连接"}</div><div className="connection"><span className={printer.connected?"green":"amber"}/> {printer.connected?`MCP 在线 · 设备 ${printer.status || "未知"}`:"等待打印机状态"}</div></div><div className="temp-readout"><span>喷嘴</span><strong>{(isPrinting ? printer.nozzleTemp : printer.nozzleTemp) ?? "—"}<small>°C</small></strong><span>热床</span><strong>{(isPrinting ? printer.bedTemp : printer.bedTemp) ?? "—"}<small>°C</small></strong></div></div>
        <div className="progress-head"><span><i className="task-source">{isPrinting ? "真实设备状态" : "设备状态"}</i>{printer.status ? `设备 ${printer.status}` : "等待设备状态"}</span><b>{isPrinting ? `${progress}%` : "—"}</b></div><div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}}/></div>{isPrinting && <div className="layer-readout">打印机当前层数 <b>{printer.layerNum ?? "—"}</b> / {printer.totalLayers ?? "—"} · 剩余 {printer.remainingMinutes ?? "—"} 分钟</div>}<div className="steps">{steps.map((step,index)=><div className={`step ${index<activeIndex?"done":""} ${index===activeIndex&&job?.status==="running"?"current":""}`} key={step}><span>{index<activeIndex?"✓":String(index+1).padStart(2,"0")}</span>{labels[step]}</div>)}</div></section>
      <section className="panel result-panel"><div className="panel-heading"><div><div className="section-kicker">03 / TODAY'S CHARM</div><h2>今日符箓</h2></div><span className="tiny-tag">7 款命名灯符</span></div>{selected?<div className="selected-card"><div className="talisman"><span>九</span><b>{selected.charm}</b><small>平安顺遂</small><i>✳</i></div><div className="selected-copy"><div className="selected-label">今日推荐</div><h3>{selected.charm}<span>符</span></h3><p>{selected.reason || "依据今日运势主题匹配"}</p><div className="fortune-line">{fortune?.summary || "运势分析已完成"}</div></div></div>:<div className="empty-result"><div className="empty-seal">✧</div><strong>等待运势分析</strong><span>运行 Agent 后将在此呈现今日推荐</span></div>}<div className="charm-list">{charms.map((name,i)=><div key={name} className={`charm-chip ${selected?.charm===name?"chosen":""}`}><span className="chip-index">{String(i+1).padStart(2,"0")}</span>{name}<i>{selected?.charm===name?"✓":"✧"}</i></div>)}</div></section>
      <section className="panel detail-panel"><div className="panel-heading"><div><div className="section-kicker">04 / JOB DETAILS</div><h2>打印任务</h2></div><span className="panel-icon">▤</span></div>{result?<div className="job-details"><div><span>打印状态</span><b className="finished">{job?.status === "running" ? "真实打印中" : "真实打印完成"}</b></div><div><span>任务编号</span><b>{result.print.jobId}</b></div><div><span>打印板位</span><b>Plate {result.print.plateIndex+1}</b></div><div><span>预计耗时</span><b>{(Number.isFinite(result.print.estimatedSeconds) ? Math.round(result.print.estimatedSeconds/60) : "—")} 分钟</b></div><div><span>材料估算</span><b>{Number.isFinite(result.print.estimatedGrams) ? result.print.estimatedGrams : "—"} g</b></div><div><span>任务模式</span><b>{result.mode === "real-bambu-mcp" ? "真实 X2D · 蓝白 PLA" : "软件虚拟队列"}</b></div></div>:<div className="detail-placeholder"><span>⌁</span><p>完成一次打印后<br/>任务详情会显示在这里</p></div>}<div className="system-footer"><span>AGENT</span><b>运势匹配</b><i>→</i><b>MCP</b><i>→</i><b>X2D</b></div></section>
    </div><section className="panel asset-panel"><details><summary>更换某款灯符的切片文件</summary><p className="muted">七款灯符已配置。需要调整样式、颜色或切片时，可为单款更换 X2D 的 .gcode.3mf。AMS 按文件耗材顺序填写，蓝白当前为 0,3。</p><div className="asset-fields"><label>灯符<select value={assetName} onChange={e=>setAssetName(e.target.value)}>{charms.map(name=><option key={name}>{name}</option>)}</select></label><label>文件内板号<input type="number" min="1" value={assetPlate} onChange={e=>setAssetPlate(e.target.value)}/></label><label>AMS 槽位<input value={assetSlots} onChange={e=>setAssetSlots(e.target.value)}/></label><label>已切片文件<input type="file" accept=".3mf" onChange={e=>setAssetFile(e.target.files[0])}/></label></div><button className="secondary-button" disabled={taskRunning || assetBusy} onClick={uploadAsset}>{assetBusy ? "正在保存" : "保存这款切片文件"}</button></details></section><footer><span>九辰祈福打印站 <b>·</b> 本地运行</span><span>AGENT + MCP + BAMBU LAB</span></footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<App/>);
