import { CHARM_RULES } from "./catalog.js";

const CATEGORIES = Object.keys(CHARM_RULES);
const MODEL_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";
const SCORE_KEYS = CATEGORIES;

function offlineFortune(birthYear, birthMonth, date) {
  const seed = [...`${birthYear}-${birthMonth}-${date}`].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const category = CATEGORIES[seed % CATEGORIES.length];
  return {
    category,
    scores: { [category]: 100 },
    summary: `离线演示数据：今日主题为${({love:'情感',health:'身心',career:'事业',wealth:'财务',study:'学业',protection:'平安',general:'综合'})[category] || '综合'}。`,
    source: "offline-simulator",
  };
}

function normalizeModelFortune(payload, source) {
  const scores = payload?.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new Error("兼容模型必须返回 JSON 对象，且包含 scores 字段");
  }
  const normalizedScores = Object.fromEntries(
    SCORE_KEYS.map((key) => [key, Number.isFinite(Number(scores[key])) ? Math.max(0, Math.min(100, Number(scores[key]))) : 0]),
  );
  const category = SCORE_KEYS.includes(payload.category) ? payload.category : undefined;
  if (!category && Object.values(normalizedScores).every((score) => score === 0)) {
    throw new Error("模型未返回七个可用运势类别的评分");
  }
  return {
    category,
    scores: normalizedScores,
    summary: String(payload.summary ?? "").slice(0, 500),
    source,
  };
}

export async function getDailyFortune({ birthYear, birthMonth, date }) {
  const apiKey = process.env.OPENAI_COMPAT_API_KEY;
  if (!apiKey) return offlineFortune(birthYear, birthMonth, date);

  const baseUrl = (process.env.OPENAI_COMPAT_BASE_URL || MODEL_BASE_URL).replace(/\/+$/, "");
  const model = process.env.OPENAI_COMPAT_MODEL;
  if (!model) throw new Error("已配置 OPENAI_COMPAT_API_KEY，请同时配置 OPENAI_COMPAT_MODEL");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 450,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一个提供娱乐性传统文化运势解读的助手，不声称预测事实或提供医疗、财务、法律建议。只输出 JSON：category 必须是 ${SCORE_KEYS.join(", ")} 之一；scores 必须包含这七类且分值为0到100整数；summary 用中文写不超过80字。`,
        },
        {
          role: "user",
          content: `请按出生年月生成${date}的娱乐性每日运势。出生年份：${birthYear}；出生月份：${birthMonth}；日期：${date}。不要推断或要求具体生日、出生时间、姓名或地点。`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenAI Compatible API 返回 HTTP ${response.status}`);
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("兼容模型没有返回文本结果");
  let fortune;
  try {
    fortune = JSON.parse(content);
  } catch {
    throw new Error("兼容模型未按 JSON 格式返回运势结果");
  }
  return normalizeModelFortune(fortune, `${baseUrl} (${model})`);
}

export function currentDateInChina() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIME_ZONE || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
