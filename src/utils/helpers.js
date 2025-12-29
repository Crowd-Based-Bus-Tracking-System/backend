export function parseMembersWithScores(zrangeResult) {
  const out = [];
  for (let i = 0; i < zrangeResult.length; i += 2) {
    const member = zrangeResult[i];
    const score = Number(zrangeResult[i + 1]);
    out.push({ userId: member, ts: score });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}