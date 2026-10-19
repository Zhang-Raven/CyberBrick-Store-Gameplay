export const CHARM_RULES = Object.freeze({
  wealth: { charm: "武曲", reason: "财务主题" },
  career: { charm: "贪狼", reason: "事业与行动主题" },
  relationship: { charm: "廉贞", reason: "人际关系主题" },
  communication: { charm: "巨门", reason: "沟通与判断主题" },
  stability: { charm: "禄存", reason: "稳定与积累主题" },
  resilience: { charm: "破军", reason: "变化与韧性主题" },
  general: { charm: "辅星", reason: "综合主题" },
});

export const CHARM_NAMES = Object.freeze(
  [...new Set(Object.values(CHARM_RULES).map(({ charm }) => charm))],
);

export function chooseCharm(fortune) {
  const scores = fortune?.scores;
  if (scores && typeof scores === "object") {
    const ranked = Object.entries(scores)
      .filter(([category, score]) => category in CHARM_RULES && Number.isFinite(Number(score)))
      .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
    if (ranked.length > 0) {
      const [category] = ranked[0];
      return { category, ...CHARM_RULES[category] };
    }
  }

  const category = String(fortune?.category ?? "general").toLowerCase();
  const normalized = category in CHARM_RULES ? category : "general";
  return { category: normalized, ...CHARM_RULES[normalized] };
}
