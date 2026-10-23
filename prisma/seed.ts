/**
 * DEMO seed. Every record created here is sample data for local development and demos:
 *  - products/devices/commission rules carry isDemo = true where the schema supports it,
 *  - transactions are ingested with channel SEED_DEMO (→ resulting reward events isDemo = true),
 *  - merchant names end with "(Demo)", all emails use *.test domains,
 *  - DEMO_MODE=true shows a banner in every portal.
 * The merchant lifecycle is driven through the real domain services (not raw inserts) so demo data
 * obeys the same rules as production. Only timestamps are shifted back to build a 30-day history.
 *
 * Usage: npm run db:seed        (refuses to run twice — reset the DB first)
 */
import "../scripts/load-env";
import type { RoleKey } from "@prisma/client";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { encryptField, blindIndex } from "../src/server/crypto";
import { SYSTEM_ACTOR, type Actor } from "../src/server/rbac";
import { formatCode } from "../src/lib/utils";
import { addDays, businessDateString } from "../src/lib/time";
import { AGENT_AGREEMENT_VERSION, PRIVACY_VERSION, agreementHash } from "../src/server/modules/agreements";
import { createLead, uploadLeadDocument, agentLeadTransition, reviewLead, submitPayment, verifyPayment, assignDevice, activateDevice, refundOrder } from "../src/server/modules/merchants";
import { ingestSettlements, ingestTransactions, runReconciliation } from "../src/server/modules/transactions";
import { releaseCommissions } from "../src/server/modules/commissions";
import { requestWithdrawal, reviewWithdrawal, createPayoutBatch, approvePayoutBatch, recordPayoutTransfer, confirmPayoutTransfer } from "../src/server/modules/withdrawals";
import { raiseFraudFlag } from "../src/server/modules/fraud";
import { createApiClient } from "../src/server/modules/integrations";

import { DEMO_PASSWORD, DEMO_TOTP } from "./seed-constants";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const DAY = 86_400_000;
const now = new Date();
const daysAgo = (n: number, hour = 10) => {
  const d = addDays(now, -n);
  d.setUTCHours(hour - 7, Math.floor(Math.random() * 59), 0, 0);
  return d;
};

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

async function main() {
  if (await prisma.role.count()) {
    console.log("Database already seeded. Reset it first (npm run db:reset) to re-seed.");
    return;
  }
  console.log("Seeding DEMO data…");
  const roles: Record<RoleKey, string> = {} as never;
  for (const [key, name, description] of [
    ["SUPER_ADMIN", "Super Admin", "Full configuration, financial controls, audit"],
    ["FINANCE_ADMIN", "Finance Admin", "Commissions, reconciliation, payouts, reports"],
    ["OPERATIONS_ADMIN", "Operations Admin", "KYC, merchant onboarding, devices, disputes"],
    ["AGENT", "Agent", "Hausjo field agent"],
    ["MERCHANT", "Merchant", "Merchant portal user"],
  ] as const) {
    roles[key] = (await prisma.role.create({ data: { key, name, description } })).id;
  }
  const pw = await hashPassword(DEMO_PASSWORD);

  // ── Admin users (MFA pre-enrolled with documented demo secrets) ──
  const admin = async (email: string, name: string, keys: RoleKey[]): Promise<Actor> => {
    const u = await prisma.user.create({
      data: { email, name, passwordHash: pw, mfaSecretEnc: encryptField(DEMO_TOTP[email]), mfaEnabledAt: new Date(), roles: { create: keys.map((k) => ({ roleId: roles[k] })) } },
    });
    return { kind: "user", userId: u.id, roles: keys, mfaVerified: true, name };
  };
  const superAdmin = await admin("superadmin@hausjo.test", "Super Admin (Demo)", ["SUPER_ADMIN"]);
  const fin1 = await admin("finance@hausjo.test", "Fina Keuangan (Demo)", ["FINANCE_ADMIN"]);
  const fin2 = await admin("finance2@hausjo.test", "Fajar Checker (Demo)", ["FINANCE_ADMIN"]);
  const ops = await admin("ops@hausjo.test", "Oki Operasional (Demo)", ["OPERATIONS_ADMIN"]);

  // ── Products, prices, devices ──
  const catalog = [
    { sku: "A620", name: "PAX A620", slug: "pax-a620", category: "EDC_ANDROID", img: "/products/a620.svg", price: 2_450_000n, commission: 75_000n,
      description: "Terminal EDC Android ringkas dengan layar sentuh, pembaca kartu chip/kontak/nirkontak, dan printer thermal internal.",
      specs: [["OS", "Android"], ["Layar", "5,5 inci sentuh"], ["Konektivitas", "4G, Wi-Fi, Bluetooth"], ["Printer", "Thermal 58 mm"]] },
    { sku: "A920PRO", name: "PAX A920 Pro", slug: "pax-a920-pro", category: "EDC_ANDROID", img: "/products/a920pro.svg", price: 3_150_000n, commission: 120_000n,
      description: "EDC Android premium untuk ritel ramai: layar besar, baterai tahan lama, kamera untuk QRIS, dan printer cepat.",
      specs: [["OS", "Android"], ["Layar", "5,5 inci HD"], ["Kamera", "Belakang 5 MP"], ["Baterai", "5150 mAh"]] },
    { sku: "D210", name: "PAX D210", slug: "pax-d210", category: "EDC_MOBILE", img: "/products/d210.svg", price: 1_850_000n, commission: 60_000n,
      description: "EDC portabel dengan keypad fisik untuk usaha yang membutuhkan perangkat andal dan sederhana.",
      specs: [["Keypad", "Fisik"], ["Konektivitas", "GPRS/Wi-Fi"], ["Printer", "Thermal"], ["Berat", "± 360 g"]] },
    { sku: "EDC-POCKET", name: "EDC Pocket", slug: "edc-pocket", category: "EDC_MOBILE", img: "/products/edc-pocket.svg", price: 1_250_000n, commission: 50_000n,
      description: "EDC saku ringan untuk pedagang keliling dan UMKM, terhubung ke ponsel melalui Bluetooth.",
      specs: [["Ukuran", "Saku"], ["Konektivitas", "Bluetooth"], ["Kartu", "Chip & nirkontak"], ["Baterai", "Hingga 2 hari"]] },
    { sku: "QRIS-SOUNDBOX", name: "QRIS Soundbox", slug: "qris-soundbox", category: "SOUNDBOX", img: "/products/soundbox.svg", price: 450_000n, commission: 50_000n,
      description: "Speaker notifikasi pembayaran QRIS dengan suara Bahasa Indonesia — pedagang langsung tahu pembayaran masuk.",
      specs: [["Notifikasi", "Suara Bahasa Indonesia"], ["Konektivitas", "4G"], ["Baterai", "± 7 hari"], ["Display", "QR statis"]] },
  ] as const;
  const products: Record<string, string> = {};
  for (const p of catalog) {
    const prod = await prisma.product.create({
      data: { sku: p.sku, name: p.name, slug: p.slug, category: p.category, description: p.description, imageUrl: p.img, isDemo: true, specs: p.specs.map(([label, value]) => ({ label, value })) },
    });
    products[p.sku] = prod.id;
    await prisma.productPrice.create({ data: { productId: prod.id, priceIdr: p.price, effectiveFrom: new Date("2026-01-01T00:00:00+07:00"), createdById: superAdmin.userId } });
    // DEMO commission: placeholder inside the Rp50.000–Rp150.000 business range. Set official values before go-live.
    await prisma.commissionRule.create({
      data: {
        code: `SALES:${p.sku}`, version: 1, type: "SALES", status: "ACTIVE", name: `Komisi penjualan ${p.name} (DEMO)`, productId: prod.id, fixedAmount: p.commission,
        effectiveFrom: new Date("2026-01-01T00:00:00+07:00"), holdDays: 7, isDemo: true, createdById: fin1.userId, approvedById: superAdmin.userId, approvedAt: new Date(),
        description: "Nilai DEMO — bukan keputusan bisnis. Ganti dengan nilai resmi.",
      },
    });
    for (let i = 1; i <= 12; i++) {
      const d = await prisma.device.create({ data: { serialNumber: `DEMO-${p.sku}-${String(i).padStart(4, "0")}`, productId: prod.id, isDemo: true } });
      await prisma.inventoryMovement.create({ data: { deviceId: d.id, type: "RECEIVED", toStatus: "IN_STOCK", actorId: ops.userId, note: "Stok demo" } });
    }
  }
  // Recurring transaction reward Rp500 (business requirement — not a demo value).
  await prisma.commissionRule.create({
    data: { code: "TXN:DEFAULT", version: 1, type: "TRANSACTION_REWARD", status: "ACTIVE", name: "Imbalan transaksi settle", fixedAmount: 500n, effectiveFrom: new Date("2026-01-01T00:00:00+07:00"),
      holdDays: 0, createdById: fin1.userId, approvedById: superAdmin.userId, approvedAt: new Date(), description: "Rp500 per transaksi berhasil & settle dari merchant teratribusi." },
  });
  // Referral shares: percentages not specified by the business → DEMO placeholders.
  for (const [code, type, bps] of [["REF:SALES", "REFERRAL_SALES", 1000], ["REF:TXN", "REFERRAL_TRANSACTION", 1000]] as const) {
    await prisma.commissionRule.create({
      data: { code, version: 1, type, status: "ACTIVE", name: `Bagi hasil referral ${type === "REFERRAL_SALES" ? "penjualan" : "transaksi"} (DEMO)`, rateBps: bps,
        effectiveFrom: new Date("2026-01-01T00:00:00+07:00"), isDemo: true, createdById: fin1.userId, approvedById: superAdmin.userId, approvedAt: new Date(), description: "Persentase DEMO — tetapkan nilai resmi." },
    });
  }

  // ── Agents ──
  type DemoAgent = Actor & { agentId: string; referralCode: string };
  let n = 0;
  const makeAgent = async (o: { name: string; email: string; city: string; province: string; status: "ACTIVE" | "PENDING"; referrer?: DemoAgent; joinedDaysAgo: number; kyc: "VERIFIED" | "SUBMITTED"; bank: "VERIFIED" | "PENDING_VERIFICATION"; account?: string }): Promise<DemoAgent> => {
    n++;
    const phone = `+62812555${String(10000 + n).slice(-5)}`;
    const joined = daysAgo(o.joinedDaysAgo);
    const user = await prisma.user.create({ data: { email: o.email, phone, name: o.name, passwordHash: pw, phoneVerifiedAt: joined, createdAt: joined, roles: { create: { roleId: roles.AGENT } } } });
    const agent = await prisma.agent.create({
      data: { userId: user.id, agentCode: `TMP-${n}`, referralCode: `DEMO${String.fromCharCode(64 + n)}${n}X`.slice(0, 8).padEnd(8, "Z"), status: o.status, fullName: o.name, phone, email: o.email,
        addressLine: `Jl. Contoh No. ${n * 7}`, city: o.city, province: o.province, approvedAt: o.status === "ACTIVE" ? addDays(joined, 1) : null, approvedById: o.status === "ACTIVE" ? ops.userId : null, createdAt: joined },
    });
    await prisma.agent.update({ where: { id: agent.id }, data: { agentCode: formatCode("HJA", agent.agentNumber) } });
    await prisma.wallet.create({ data: { agentId: agent.id } });
    const nik = `3273${String(100000000000 + n * 7919).slice(-12)}`;
    await prisma.agentKYC.create({ data: { agentId: agent.id, idNumberEnc: encryptField(nik), idNumberHash: blindIndex(nik, "nik"), idNumberLast4: nik.slice(-4), status: o.kyc, submittedAt: joined, reviewedAt: o.kyc === "VERIFIED" ? joined : null, reviewedById: o.kyc === "VERIFIED" ? ops.userId : null } });
    const acct = o.account ?? `00${String(77000000 + n * 131)}`;
    await prisma.agentBankAccount.create({ data: { agentId: agent.id, bankCode: "014", bankName: "BCA", accountHolderName: o.name, accountNumberEnc: encryptField(acct), accountNumberHash: blindIndex(acct, "bank:014"), accountNumberLast4: acct.slice(-4), status: o.bank, verifiedAt: o.bank === "VERIFIED" ? joined : null, verifiedById: o.bank === "VERIFIED" ? ops.userId : null } });
    await prisma.agentAgreement.create({ data: { agentId: agent.id, agreementVersion: AGENT_AGREEMENT_VERSION, agreementHash: agreementHash(), acceptedAt: joined } });
    await prisma.consent.createMany({ data: (["TERMS", "PRIVACY", "DATA_PROCESSING"] as const).map((type) => ({ userId: user.id, type, version: type === "TERMS" ? AGENT_AGREEMENT_VERSION : PRIVACY_VERSION, grantedAt: joined })) });
    if (o.referrer) {
      await prisma.agentReferral.create({ data: { referrerAgentId: o.referrer.agentId, recruitAgentId: agent.id, referralCodeUsed: o.referrer.referralCode, status: o.status === "ACTIVE" ? "APPROVED" : "PENDING", approvedAt: o.status === "ACTIVE" ? addDays(joined, 1) : null, createdAt: joined } });
    }
    return { kind: "user", userId: user.id, roles: ["AGENT"], agentId: agent.id, referralCode: (await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).referralCode, name: o.name };
  };
  const budi = await makeAgent({ name: "Budi Santoso", email: "budi@agent.test", city: "Bandung", province: "Jawa Barat", status: "ACTIVE", joinedDaysAgo: 60, kyc: "VERIFIED", bank: "VERIFIED" });
  const siti = await makeAgent({ name: "Siti Rahmawati", email: "siti@agent.test", city: "Bekasi", province: "Jawa Barat", status: "ACTIVE", referrer: budi, joinedDaysAgo: 45, kyc: "VERIFIED", bank: "VERIFIED" });
  const rina = await makeAgent({ name: "Rina Wijaya", email: "rina@agent.test", city: "Surabaya", province: "Jawa Timur", status: "ACTIVE", referrer: budi, joinedDaysAgo: 38, kyc: "VERIFIED", bank: "VERIFIED" });
  const dewi = await makeAgent({ name: "Dewi Lestari", email: "dewi@agent.test", city: "Denpasar", province: "Bali", status: "ACTIVE", referrer: siti, joinedDaysAgo: 30, kyc: "VERIFIED", bank: "VERIFIED" });
  const andi = await makeAgent({ name: "Andi Pratama", email: "andi@agent.test", city: "Makassar", province: "Sulawesi Selatan", status: "PENDING", referrer: siti, joinedDaysAgo: 2, kyc: "SUBMITTED", bank: "PENDING_VERIFICATION", account: "0077000131" });

  // ── Merchants through the real workflow ──
  let leadNo = 0;
  const merchantLead = async (agent: DemoAgent, name: string, city: string, province: string, sku: string) => {
    leadNo++;
    return createLead(agent, {
      businessName: `${name} (Demo)`, ownerName: `Pemilik ${name}`, phone: `0813777${String(10000 + leadNo).slice(-5)}`, businessType: ["Warung", "Apotek", "Kafe", "Toko kelontong", "Bengkel", "Laundry"][leadNo % 6],
      addressLine: `Jl. Pasar No. ${leadNo}`, city, province, productId: products[sku], notes: "Data demo",
    });
  };
  const submit = async (agent: DemoAgent, leadId: string) => {
    await uploadLeadDocument(agent, leadId, "OWNER_ID_CARD", { buffer: PNG, filename: "ktp-demo.png" });
    await uploadLeadDocument(agent, leadId, "STORE_PHOTO", { buffer: PNG, filename: "toko-demo.png" });
    await agentLeadTransition(agent, leadId, "submit");
  };
  type Activated = { merchantId: string; orderId: string; terminalId: string; agent: DemoAgent; activatedAt: Date };
  const activated: Activated[] = [];
  let tid = 0;
  const fullLifecycle = async (agent: DemoAgent, name: string, city: string, province: string, sku: string, activatedDaysAgo: number) => {
    const lead = await merchantLead(agent, name, city, province, sku);
    await submit(agent, lead.id);
    await reviewLead(ops, lead.id, "start_review");
    const approved = await reviewLead(ops, lead.id, "approve");
    const order = await prisma.salesOrder.findFirstOrThrow({ where: { merchantId: approved.merchantId! } });
    const pay = await submitPayment(agent, order.id, { amount: order.totalAmount, method: "BANK_TRANSFER", reference: `DEMO-TRF-${lead.leadNumber}` });
    await verifyPayment(ops, pay.id, "VERIFIED");
    const device = await prisma.device.findFirstOrThrow({ where: { productId: products[sku], status: "IN_STOCK" } });
    await assignDevice(ops, order.id, device.id);
    tid++;
    const terminalId = `DTID${String(tid).padStart(4, "0")}`;
    const activatedAt = daysAgo(activatedDaysAgo, 9);
    await activateDevice(ops, order.id, { terminalId, activatedAt });
    // Demo history shaping: move approval/attribution/lead timestamps before the activation date.
    const approvedAt = addDays(activatedAt, -2);
    await prisma.merchantAttribution.updateMany({ where: { merchantId: approved.merchantId! }, data: { effectiveFrom: approvedAt, createdAt: approvedAt } });
    await prisma.merchant.update({ where: { id: approved.merchantId! }, data: { approvedAt, createdAt: approvedAt } });
    await prisma.merchantLead.update({ where: { id: lead.id }, data: { createdAt: addDays(approvedAt, -3), submittedAt: addDays(approvedAt, -1), reviewedAt: approvedAt } });
    await prisma.salesOrder.update({ where: { id: order.id }, data: { createdAt: approvedAt } });
    activated.push({ merchantId: approved.merchantId!, orderId: order.id, terminalId, agent, activatedAt });
  };
  await fullLifecycle(budi, "Warung Bu Tini", "Bandung", "Jawa Barat", "A920PRO", 28);
  await fullLifecycle(budi, "Apotek Sehat Sentosa", "Cimahi", "Jawa Barat", "A620", 24);
  await fullLifecycle(budi, "Kopi Kenangan Senja", "Bandung", "Jawa Barat", "QRIS-SOUNDBOX", 20);
  await fullLifecycle(siti, "Toko Makmur Jaya", "Bekasi", "Jawa Barat", "A920PRO", 26);
  await fullLifecycle(siti, "Laundry Bersih Kilat", "Bekasi", "Jawa Barat", "EDC-POCKET", 15);
  await fullLifecycle(rina, "Bengkel Motor Rina", "Surabaya", "Jawa Timur", "D210", 22);
  await fullLifecycle(rina, "Kedai Bakso Pak Kumis", "Sidoarjo", "Jawa Timur", "QRIS-SOUNDBOX", 12);
  await fullLifecycle(dewi, "Warung Nasi Bali Dewi", "Denpasar", "Bali", "A620", 9);
  await fullLifecycle(budi, "Minimarket Sumber Rejeki", "Bandung", "Jawa Barat", "A920PRO", 3); // still inside hold window

  // Pipeline examples for the operations queue
  const l1 = await merchantLead(siti, "Toko Roti Harum", "Bekasi", "Jawa Barat", "A620");
  await submit(siti, l1.id);
  const l2 = await merchantLead(rina, "Salon Cantik Ayu", "Surabaya", "Jawa Timur", "EDC-POCKET");
  await submit(rina, l2.id);
  await reviewLead(ops, l2.id, "start_review");
  await reviewLead(ops, l2.id, "request_revision", "Foto tempat usaha kurang jelas, mohon unggah ulang.");
  const l3 = await merchantLead(dewi, "Butik Kain Endek", "Gianyar", "Bali", "A920PRO");
  await agentLeadTransition(dewi, l3.id, "contacted");
  await merchantLead(budi, "Depot Air Isi Ulang Segar", "Bandung", "Jawa Barat", "QRIS-SOUNDBOX");
  // Approved, awaiting payment verification
  const l4 = await merchantLead(siti, "Toko Bangunan Kokoh", "Bekasi", "Jawa Barat", "D210");
  await submit(siti, l4.id);
  const ap4 = await reviewLead(ops, l4.id, "approve");
  const o4 = await prisma.salesOrder.findFirstOrThrow({ where: { merchantId: ap4.merchantId! } });
  await submitPayment(siti, o4.id, { amount: o4.totalAmount, method: "VIRTUAL_ACCOUNT", reference: "DEMO-VA-0004" });

  // ── Transactions (SEED_DEMO), settlements, reconciliation ──
  console.log("Ingesting demo transactions…");
  const SOURCE = "DEMO_PROCESSOR";
  const byDay = new Map<string, { count: number; amount: bigint }>();
  let ext = 0;
  for (const m of activated) {
    const startDay = Math.floor((now.getTime() - m.activatedAt.getTime()) / DAY);
    for (let d = startDay - 1; d >= 1; d--) {
      const perDay = 3 + Math.floor(rand() * 9);
      const items = [];
      for (let k = 0; k < perDay; k++) {
        ext++;
        const at = daysAgo(d, 8 + Math.floor(rand() * 12));
        const failed = rand() < 0.06;
        const amount = Math.round((15_000 + rand() * 485_000) / 500) * 500;
        const day = businessDateString(at);
        const ref = `DEMO-STL-${day.replace(/-/g, "")}`;
        items.push({ externalId: `DEMO-TRX-${String(ext).padStart(6, "0")}`, terminalId: m.terminalId, status: failed ? "FAILED" : "SUCCESS", amount, occurredAt: at.toISOString(), settlementRef: failed ? null : ref, type: rand() < 0.35 ? "QRIS" : "PURCHASE" });
        if (!failed) {
          const agg = byDay.get(day) ?? { count: 0, amount: 0n };
          byDay.set(day, { count: agg.count + 1, amount: agg.amount + BigInt(amount) });
        }
      }
      await ingestTransactions(SYSTEM_ACTOR, SOURCE, items, "SEED_DEMO");
    }
  }
  // A test transaction (never rewarded), an unmatched terminal (exception queue).
  await ingestTransactions(SYSTEM_ACTOR, SOURCE, [
    { externalId: "DEMO-TRX-TEST-1", terminalId: activated[0].terminalId, status: "SUCCESS", amount: 1000, occurredAt: daysAgo(2).toISOString(), isTest: true, type: "TEST" },
    { externalId: "DEMO-TRX-UNMATCHED-1", terminalId: "UNKNOWN99", status: "SUCCESS", amount: 75000, occurredAt: daysAgo(2).toISOString(), settlementRef: "DEMO-STL-UNMATCHED" },
  ], "SEED_DEMO");
  const mismatchDay = businessDateString(daysAgo(4));
  await ingestSettlements(SYSTEM_ACTOR, SOURCE, [...byDay.entries()].map(([day, v]) => ({
    settlementRef: `DEMO-STL-${day.replace(/-/g, "")}`, settlementDate: day, expectedCount: day === mismatchDay ? v.count + 1 : v.count, expectedAmount: (day === mismatchDay ? v.amount + 125_000n : v.amount).toString(),
  })));
  console.log("Running reconciliation and commission release…");
  await runReconciliation(SYSTEM_ACTOR, businessDateString(now));
  await releaseCommissions(SYSTEM_ACTOR);

  // ── Withdrawal + maker-checker payout (paid), and one open request ──
  const w1 = await requestWithdrawal(budi, { amount: 150_000n, idempotencyKey: "demo-wd-budi-0001" });
  await reviewWithdrawal(fin1, w1.id, "APPROVED");
  const batch = await createPayoutBatch(fin1, [w1.id], "Batch demo");
  await approvePayoutBatch(fin2, batch.id);
  const attempt = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w1.id } });
  await recordPayoutTransfer(fin1, attempt.id, { providerReference: "DEMO-BCA-REF-0001" });
  await confirmPayoutTransfer(fin2, attempt.id);
  const sitiWallet = await prisma.wallet.findUniqueOrThrow({ where: { agentId: siti.agentId } });
  if (sitiWallet.payableBalance >= 100_000n) await requestWithdrawal(siti, { amount: 100_000n, idempotencyKey: "demo-wd-siti-0001" });

  // Refund example (sales commission reversed after release → clawback path)
  const refundTarget = activated.find((a) => a.agent.agentId === rina.agentId)!;
  await refundOrder(fin1, refundTarget.orderId, "Demo: merchant mengembalikan perangkat dalam masa garansi");

  // Risk example
  await raiseFraudFlag(prisma, { type: "REFERRAL_VELOCITY", severity: "LOW", agentId: siti.agentId, details: { note: "Contoh tanda risiko (demo)" }, dedupeKey: "demo-flag-1" });

  // Merchant portal user for the first activated merchant
  const m0 = await prisma.merchant.findUniqueOrThrow({ where: { id: activated[0].merchantId } });
  const mu = await prisma.user.create({ data: { email: "merchant@merchant.test", name: m0.ownerName, passwordHash: pw, roles: { create: { roleId: roles.MERCHANT } } } });
  await prisma.merchant.update({ where: { id: m0.id }, data: { userId: mu.id } });

  // Demo API client for webhook/API testing (key printed once)
  const client = await createApiClient(superAdmin, { name: "Demo Processor (Demo)", partnerSource: SOURCE, scopes: ["transactions:write", "settlements:write"] });

  // Backdate agent creation for cohort/recruitment charts already done; mark notifications of seed as read for admins
  await prisma.notification.updateMany({ where: { createdAt: { lt: new Date() } }, data: { readAt: new Date() } });
  void andi;

  console.log("\nDEMO data ready.");
  console.log(`  Password for all demo accounts: ${DEMO_PASSWORD}`);
  console.log("  Admins (TOTP MFA — run `npm run demo:totp` for current codes): superadmin@ / finance@ / finance2@ / ops@hausjo.test");
  console.log("  Agents: budi@agent.test (referrer), siti@agent.test, rina@agent.test, dewi@agent.test, andi@agent.test (pending)");
  console.log("  Merchant: merchant@merchant.test");
  console.log(`  Demo API key (source ${SOURCE}): ${client.apiKey}`);
  console.log(`  Demo webhook secret: ${client.webhookSecret}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
