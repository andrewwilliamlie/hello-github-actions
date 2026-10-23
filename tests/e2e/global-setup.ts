import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_DB, E2E_ENV } from "./env";

/** Recreate and seed the isolated E2E database. */
export default async function globalSetup() {
  const url = new URL(E2E_DB);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+e2e[a-z0-9_]*$/.test(dbName)) throw new Error(`Refusing to reset non-e2e database "${dbName}"`);
  url.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: url.toString() });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();
  const env = { ...process.env, ...E2E_ENV, NODE_ENV: "development" } as NodeJS.ProcessEnv;
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
