const DIMENSIONS = [
  ['E', 'I', '你更常从哪里获得能量？', '和人一起行动', '独处后恢复能量'],
  ['S', 'N', '你更相信哪种线索？', '眼前事实与细节', '直觉与可能性'],
  ['T', 'F', '你做决定时更看重？', '逻辑与原则', '感受与关系'],
  ['J', 'P', '你更喜欢怎样的节奏？', '计划后推进', '边走边发现'],
];

export const PERSONALITY_DIMENSIONS = Object.freeze(DIMENSIONS.map(([left, right, prompt, leftLabel, rightLabel]) => ({ left, right, prompt, leftLabel, rightLabel })));
export const PERSONALITY_TYPES = Object.freeze(DIMENSIONS.reduce((types, [left, right]) => types.flatMap(type => [type + left, type + right]), ['']));

export function validatePersonality(value) {
  const personality = String(value || '').trim().toUpperCase();
  if (!PERSONALITY_TYPES.includes(personality)) throw new Error('请选择四个九辰人格选项，组成完整的四位结果');
  return personality;
}

export function personalityScores(personality) {
  const value = validatePersonality(personality);
  const category = {
    E: 'communication', I: 'stability', S: 'wealth', N: 'career',
    T: 'resilience', F: 'relationship', J: 'stability', P: 'general',
  };
  const scores = { wealth: 28, career: 28, relationship: 28, communication: 28, stability: 28, resilience: 28, general: 28 };
  for (const letter of value) scores[category[letter]] += 18;
  return { scores, category: Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] };
}
