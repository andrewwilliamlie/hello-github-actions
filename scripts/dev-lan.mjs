/*
 * Start the Next.js dev server reachable from phones on the same Wi-Fi (for the Expo Go app or a
 * phone browser). Binds to 0.0.0.0, prints the LAN URL(s) and sets APP_URL so referral links and
 * origin checks use the address the phone actually sees. Usage: npm run dev:lan [-- --port 3000]
 */
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const portArg = process.argv.indexOf("--port");
const port = portArg > -1 ? process.argv[portArg + 1] : process.env.PORT ?? "3000";
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);
const preferred = ips.find((ip) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(ip)) ?? ips[0];
const appUrl = process.env.APP_URL_OVERRIDE ?? (preferred ? `http://${preferred}:${port}` : `http://localhost:${port}`);

console.log("\n  HAUSJO dev server for phones on the same Wi-Fi:");
for (const ip of ips) console.log(`    http://${ip}:${port}`);
console.log(`  APP_URL=${appUrl}  (enter this in the Expo app's server settings)\n`);

const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, APP_URL: appUrl, ALLOWED_DEV_ORIGINS: [process.env.ALLOWED_DEV_ORIGINS, ...ips].filter(Boolean).join(",") },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
