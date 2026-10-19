import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chooseCharm } from "./catalog.js";
import { currentDateInChina, getDailyFortune } from "./fortune.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectPath = process.env.CHARM_PROJECT_3MF || "F:/chrome downloads/九辰灯符（上传版）.3mf";

export function validateBirthMonth(birthYear, birthMonth) {
  const [thisYear, thisMonth] = currentDateInChina().split("-").map(Number);
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > thisYear) throw new Error("出生年份必须在 1900 年至当前年份之间");
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) throw new Error("出生月份必须为 1 至 12 的整数");
  if (birthYear === thisYear && birthMonth > thisMonth) throw new Error("出生年月不能晚于当前月份");
}
function parseToolResult(result) {
  if (result.isError) throw new Error(result.content?.map((item) => item.text).join("\n") || "MCP 工具调用失败");
  const structured = result.structuredContent;
  if (structured && typeof structured === "object") return structured;
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP 工具没有返回 JSON 文本");
  try { return JSON.parse(text); } catch { return { text }; }
}
function createLocalMcpClient({ serverPath, name, env = process.env }) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], cwd: path.dirname(serverPath), env, stderr: "inherit" });
  const client = new Client({ name, version: "0.1.0" });
  return { client, transport };
}

export async function runAgent({ birthYear, birthMonth, mode = process.env.PRINTER_MODE || "simulation", fortuneProvider = getDailyFortune, date = currentDateInChina(), onProgress = () => {}, simulatorPollIntervalMs = 2000 }) {
  validateBirthMonth(birthYear, birthMonth);
  if (mode === "real") {
    const { runRealAgent } = await import("./real-agent.js");
    return runRealAgent({ birthYear, birthMonth, fortuneProvider, date, onProgress });
  }
  onProgress({ stage: "fortune", status: "running", message: "正在分析今日运势" });
  const fortune = await fortuneProvider({ birthYear, birthMonth, date });
  const selection = chooseCharm(fortune);
  onProgress({ stage: "selection", status: "running", message: `今日主题匹配：${selection.charm}`, fortune, selection });

  // This read-only catalog MCP is always local and filters the downloaded project to the seven approved plates.
  const catalogPair = createLocalMcpClient({ serverPath: path.join(root, "simulator-mcp-server.js"), name: "blessing-agent-charm-catalog" });
  let printerPair;
  try {
    await catalogPair.client.connect(catalogPair.transport);
    const catalog = parseToolResult(await catalogPair.client.callTool({ name: "list_simulated_charms", arguments: {} }));
    const charm = catalog.charms.find((item) => item.name === selection.charm);
    if (!charm) throw new Error(`选中的款式不在已审核 3MF 清单中：${selection.charm}`);

    onProgress({ stage: "slicing", status: "running", message: `正在准备「${charm.name}」的仿真打印文件`, selection });
    const sliced = parseToolResult(await catalogPair.client.callTool({ name: "simulate_slice_charm", arguments: { charm: charm.name } }));
    onProgress({ stage: "submitting", status: "running", message: "正在提交到仿真打印任务队列", selection });
    const submitted = parseToolResult(await catalogPair.client.callTool({ name: "submit_simulated_print", arguments: { artifactId: sliced.artifactId } }));
    onProgress({ stage: "printing", status: "running", message: "仿真任务已启动", jobId: submitted.jobId, selection });
    let progress = submitted;
    for (let poll = 0; poll < 24 && progress.status !== "completed"; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, simulatorPollIntervalMs));
      progress = parseToolResult(await catalogPair.client.callTool({ name: "get_simulated_print_status", arguments: { jobId: submitted.jobId } }));
      onProgress({
        stage: progress.status === "completed" ? "completed" : "printing",
        status: progress.status === "completed" ? "completed" : "running",
        message: progress.status === "completed" ? "软件仿真打印完成" : `打印机正在逐层打印 · 第 ${progress.currentLayer}/${progress.totalLayers} 层`,
        jobId: submitted.jobId,
        progress: progress.progress,
        currentLayer: progress.currentLayer,
        totalLayers: progress.totalLayers,
        nozzleTemp: progress.nozzleTemp,
        bedTemp: progress.bedTemp,
        selection,
      });
    }
    if (progress.status !== "completed") throw new Error("模拟打印在限定查询次数内未完成");
    const result = {
      mode: "software-simulator", date,
      fortune: { category: fortune.category ?? selection.category, scores: fortune.scores ?? {}, summary: fortune.summary ?? "", source: fortune.source ?? "configured-model" },
      selection,
      print: { charm: charm.name, plateIndex: charm.plateIndex, estimatedSeconds: charm.timeSeconds, estimatedGrams: charm.grams, filaments: charm.filaments, virtualPath: sliced.virtualPath, jobId: submitted.jobId, status: progress.status, progress: progress.progress },
    };
    onProgress({ stage: "completed", status: "completed", message: "软件仿真打印已完成", result });
    return result;
  } finally {
    if (printerPair) await printerPair.client.close().catch(() => {});
    await catalogPair.client.close().catch(() => {});
  }
}
