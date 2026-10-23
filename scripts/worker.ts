/* Background worker: job queue consumer + scheduler. Run with `npm run worker`. */
import "./load-env";
import { hostname } from "node:os";
import { claimJobs, completeJob, enqueueJob, failJob, recoverStuckJobs } from "../src/server/jobs/queue";
import { runJob } from "../src/server/jobs/handlers";
import { prisma } from "../src/server/db";
import { addDays, businessDateString } from "../src/lib/time";

const workerId = `${hostname()}:${process.pid}`;
let stopping = false;

async function schedule() {
  const now = new Date();
  // Commission release every 15 minutes.
  const slot = Math.floor(now.getTime() / (15 * 60_000));
  await enqueueJob(prisma, "commission.release", {}, { dedupeKey: `release:${slot}`, maxAttempts: 3 });
  // Daily reconciliation for the previous Jakarta day, from 02:00 WIB.
  const jakartaHour = (now.getUTCHours() + 7) % 24;
  if (jakartaHour >= 2) {
    const yesterday = businessDateString(addDays(now, -1));
    await enqueueJob(prisma, "reconciliation.daily", { date: yesterday }, { dedupeKey: `recon:${yesterday}`, maxAttempts: 3 });
  }
  await enqueueJob(prisma, "maintenance.prune", {}, { dedupeKey: `prune:${businessDateString(now)}`, maxAttempts: 1 });
}

async function loop() {
  console.log(`[worker] ${workerId} started`);
  let lastSchedule = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastSchedule > 60_000) {
        await recoverStuckJobs();
        await schedule();
        lastSchedule = Date.now();
      }
      const jobs = await claimJobs(workerId, 10);
      for (const job of jobs) {
        try {
          await runJob(job);
          await completeJob(job.id);
        } catch (e) {
          console.error(`[worker] job ${job.type} ${job.id} failed (attempt ${job.attempts}):`, (e as Error).message);
          await failJob(job, e);
        }
      }
      if (!jobs.length) await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error("[worker] loop error", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await prisma.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; });
loop();
