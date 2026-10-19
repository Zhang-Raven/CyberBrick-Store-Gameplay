import test from "node:test";
import {fileURLToPath} from "node:url";
process.env.CHARM_PROJECT_3MF = fileURLToPath(new URL("../data/九辰灯符（上传版）.3mf", import.meta.url));
import assert from "node:assert/strict";
import { CHARM_NAMES, CHARM_RULES, chooseCharm } from "../src/catalog.js";
import { getDailyFortune } from "../src/fortune.js";
import { runAgent } from "../src/agent.js";

 test("catalog only contains the seven named prints", () => {
  assert.deepEqual(CHARM_NAMES, ["武曲", "贪狼", "廉贞", "巨门", "禄存", "破军", "辅星"]);
  assert.equal(Object.keys(CHARM_RULES).length, 7);
});

test("highest fortune score selects one of the fixed named charms", () => {
  assert.deepEqual(chooseCharm({ scores: { wealth: 1, stability: 9 } }), {
    category: "stability", charm: "禄存", reason: "稳定与积累主题",
  });
  assert.equal(chooseCharm({ category: "unmapped" }).charm, "辅星");
});

test("model fortune uses compatible chat completions and validates the seven scores", async () => {
  const previous = { key: process.env.OPENAI_COMPAT_API_KEY, model: process.env.OPENAI_COMPAT_MODEL, fetch: globalThis.fetch };
  process.env.OPENAI_COMPAT_API_KEY = "test-key";
  process.env.OPENAI_COMPAT_MODEL = "test-model";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ category: "wealth", scores: { wealth: 90, career: 20 }, summary: "测试" }) } }] }), { status: 200 });
  };
  try {
    const fortune = await getDailyFortune({ birthYear: 1990, birthMonth: 5, date: "2026-09-23" });
    assert.match(request.url, /\/chat\/completions$/);
    assert.equal(JSON.parse(request.options.body).messages[1].content.includes("1990"), true);
    assert.equal(fortune.scores.wealth, 90);
    assert.equal(fortune.scores.stability, 0);
  } finally {
    if (previous.key === undefined) delete process.env.OPENAI_COMPAT_API_KEY; else process.env.OPENAI_COMPAT_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.OPENAI_COMPAT_MODEL; else process.env.OPENAI_COMPAT_MODEL = previous.model;
    globalThis.fetch = previous.fetch;
  }
});

test("end-to-end agent runs through MCP simulator and returns completed print status", async () => {
  const events = [];
  const result = await runAgent({
    birthYear: 1990, birthMonth: 5, mode: "simulation", date: "2026-09-23", simulatorPollIntervalMs: 1, onProgress: (event) => events.push(event),
    fortuneProvider: async () => ({ category: "wealth", summary: "仿真财务主题", source: "test-api" }),
  });
  assert.equal(result.mode, "software-simulator");
  assert.equal(result.selection.charm, "武曲");
  assert.equal(result.print.charm, "武曲");
  assert.equal(result.print.status, "completed");
  assert.equal(result.print.progress, 100);
  assert.equal(result.print.plateIndex, 5);
  assert.ok(events.some((event) => event.stage === "printing" && event.progress > 0 && event.progress < 100));
});

test("birth month validation rejects invalid input before contacting the API", async () => {
  await assert.rejects(runAgent({ birthYear: 1990, birthMonth: 13, fortuneProvider: async () => assert.fail("API should not run") }), /1 至 12/);
});
