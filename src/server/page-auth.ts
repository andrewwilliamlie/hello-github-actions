import "server-only";
import { redirect } from "next/navigation";
import { actorFromSession, clientIp, getSession, type SessionInfo } from "./auth/session";
import { ADMIN_ROLES, can, type Actor, type Permission } from "./rbac";
import { env } from "./env";

export interface PageContext { actor: Actor; session: SessionInfo }

/** Resolve the signed-in user for a page, redirecting to login / MFA when needed. */
export async function pageContext(portal: "admin" | "agent" | "merchant"): Promise<PageContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  const isAdmin = session.roles.some((r) => ADMIN_ROLES.includes(r));
  if (isAdmin && env().ADMIN_MFA_REQUIRED && !session.mfaVerified) redirect(session.user.mfaEnabled ? "/login/mfa" : "/login/mfa/setup");
  const actor = actorFromSession(session, await clientIp());
  const ok = portal === "admin" ? isAdmin : portal === "agent" ? session.roles.includes("AGENT") && !!session.agentId : session.roles.includes("MERCHANT") && !!session.merchantId;
  if (!ok) redirect("/login?denied=1");
  return { actor, session };
}

/** Admin page guard for a specific permission. */
export async function adminPage(permission: Permission): Promise<PageContext> {
  const ctx = await pageContext("admin");
  if (!can(ctx.actor, permission)) redirect("/admin?forbidden=1");
  return ctx;
}
