import "server-only";
import { prisma } from "../db";
import { requirePermission, type Actor } from "../rbac";

export interface NetworkNode {
  agentId: string;
  agentCode: string;
  name: string;
  status: string;
  referralStatus: string;
  joinedAt: Date;
  level: number;
  merchants: number;
  txns30d: number;
  earningsForReferrer: bigint; // only meaningful for level 1 (direct)
  children: NetworkNode[];
}

/**
 * Referral network for an agent. Level 1 = direct recruits (the only level that pays referral
 * shares). Deeper levels are informational. Contains no private merchant data of other agents —
 * only aggregate counts.
 */
export async function referralNetwork(actor: Actor, rootAgentId: string, maxDepth = 3): Promise<NetworkNode[]> {
  if (actor.agentId !== rootAgentId) requirePermission(actor, "agent.view");
  const since = new Date(Date.now() - 30 * 86_400_000);
  async function level(parentIds: string[], depth: number): Promise<Map<string, NetworkNode[]>> {
    const out = new Map<string, NetworkNode[]>();
    if (!parentIds.length || depth > maxDepth) return out;
    const links = await prisma.agentReferral.findMany({ where: { referrerAgentId: { in: parentIds }, endedAt: null }, include: { recruit: true }, orderBy: { createdAt: "asc" } });
    const ids = links.map((l) => l.recruitAgentId);
    const [merchantCounts, txCounts, earnings] = await Promise.all([
      prisma.merchantAttribution.groupBy({ by: ["agentId"], where: { agentId: { in: ids }, effectiveTo: null }, _count: true }),
      prisma.$queryRaw<{ agentId: string; n: bigint }[]>`
        SELECT a."agentId", COUNT(t."id")::bigint AS n FROM "MerchantAttribution" a JOIN "Transaction" t ON t."merchantId" = a."merchantId"
        WHERE a."agentId" = ANY(${ids}) AND a."effectiveTo" IS NULL AND t."status" = 'SUCCESS' AND t."occurredAt" >= ${since} GROUP BY 1`,
      depth === 1
        ? prisma.referralCommission.groupBy({ by: ["recruitAgentId"], where: { referrerAgentId: rootAgentId, recruitAgentId: { in: ids }, referralEvent: { status: { not: "REVERSED" } } }, _sum: { amount: true } })
        : Promise.resolve([] as { recruitAgentId: string; _sum: { amount: bigint | null } }[]),
    ]);
    const children = await level(ids, depth + 1);
    for (const l of links) {
      const node: NetworkNode = {
        agentId: l.recruitAgentId, agentCode: l.recruit.agentCode, name: l.recruit.fullName, status: l.recruit.status, referralStatus: l.status, joinedAt: l.recruit.createdAt, level: depth,
        merchants: merchantCounts.find((m) => m.agentId === l.recruitAgentId)?._count ?? 0,
        txns30d: Number(txCounts.find((x) => x.agentId === l.recruitAgentId)?.n ?? 0),
        earningsForReferrer: earnings.find((e) => e.recruitAgentId === l.recruitAgentId)?._sum.amount ?? 0n,
        children: children.get(l.recruitAgentId) ?? [],
      };
      out.set(l.referrerAgentId, [...(out.get(l.referrerAgentId) ?? []), node]);
    }
    return out;
  }
  return (await level([rootAgentId], 1)).get(rootAgentId) ?? [];
}
