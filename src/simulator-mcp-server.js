import { readCharmPlates as readSourcePlates } from "./source-catalog.js";
const readCharmPlates = () => readSourcePlates(projectPath);
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CHARM_NAMES } from "./catalog.js";

const DEFAULT_PROJECT_PATH = "F:/chrome downloads/九辰灯符（上传版）.3mf";
const projectPath = process.env.CHARM_PROJECT_3MF || DEFAULT_PROJECT_PATH;
const server = new McpServer({ name: "blessing-printer-simulator", version: "0.1.0" });
const artifacts = new Map();
const jobs = new Map();

function jsonResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}


server.registerTool(
  "list_simulated_charms",
  {
    title: "列出已审核符箓",
    description: "读取本地九辰灯符 3MF，只返回七款指定名称，排除草稿和重复板。",
    inputSchema: {},
  },
  async () => jsonResult({ mode: "simulation", projectPath, charms: await readCharmPlates() }),
);

server.registerTool(
  "simulate_slice_charm",
  {
    title: "模拟切片",
    description: "模拟将指定 3MF 打印板切成可打印文件，不启动外部切片器。",
    inputSchema: { charm: z.enum(CHARM_NAMES) },
  },
  async ({ charm }) => {
    const plate = (await readCharmPlates()).find((item) => item.name === charm);
    if (!plate) throw new Error(`未找到款式：${charm}`);
    const artifactId = `sim-${charm}-${Date.now()}`;
    const artifact = {
      artifactId,
      virtualPath: `sim://sliced/${encodeURIComponent(charm)}.gcode.3mf`,
      charm,
      plateIndex: plate.plateIndex,
      simulated: true,
    };
    artifacts.set(artifactId, artifact);
    return jsonResult(artifact);
  },
);

server.registerTool(
  "submit_simulated_print",
  {
    title: "提交模拟打印",
    description: "只向本地模拟器创建虚拟任务；没有真实打印机网络、凭据或设备控制。",
    inputSchema: { artifactId: z.string().min(1) },
  },
  async ({ artifactId }) => {
    const artifact = artifacts.get(artifactId);
    if (!artifact) throw new Error("切片产物不存在或不是本次模拟会话生成的产物");
    const jobId = `SIM-${Date.now()}`;
    jobs.set(jobId, { artifact, pollCount: 0 });
    return jsonResult({ jobId, charm: artifact.charm, status: "queued", simulated: true });
  },
);

server.registerTool(
  "get_simulated_print_status",
  {
    title: "查询模拟进度",
    description: "推进并返回虚拟打印任务状态，不访问真实打印机。",
    inputSchema: { jobId: z.string().min(1) },
  },
  async ({ jobId }) => {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`模拟任务不存在：${jobId}`);
    job.pollCount += 1;
    const progress = Math.min(100, job.pollCount * 5);
    const totalLayers = 40;
    const currentLayer = Math.round((progress / 100) * totalLayers);
    const complete = progress >= 100;
    return jsonResult({
      jobId,
      charm: job.artifact.charm,
      status: complete ? "completed" : "printing",
      progress,
      currentLayer,
      totalLayers,
      nozzleTemp: Math.min(220, 25 + job.pollCount * 24),
      bedTemp: Math.min(60, 25 + job.pollCount * 5),
      simulated: true,
    });
  },
);

await server.connect(new StdioServerTransport());
