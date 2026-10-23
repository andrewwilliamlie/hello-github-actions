import "server-only";
import { z } from "zod";
import type { ProductCategory } from "@prisma/client";
import { prisma, withTx, isUniqueViolation, type Db } from "../db";
import { audit } from "../audit";
import { requirePermission, type Actor } from "../rbac";
import { duplicate, invalid, notFound } from "../errors";

export async function currentPrice(db: Db, productId: string, at: Date): Promise<bigint | null> {
  const p = await db.productPrice.findFirst({
    where: { productId, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
    orderBy: { effectiveFrom: "desc" },
  });
  return p?.priceIdr ?? null;
}

export const productSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,40}$/, "SKU: huruf besar, angka, tanda hubung"),
  name: z.string().trim().min(2).max(100),
  category: z.enum(["EDC_ANDROID", "EDC_MOBILE", "SOUNDBOX"]),
  description: z.string().trim().min(10).max(2000),
  specs: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) })).max(30),
  imageUrl: z.string().trim().regex(/^\/[\w\-./]+$/, "Path gambar lokal, mis. /products/a920.svg").optional().or(z.literal("").transform(() => undefined)),
  isActive: z.boolean(),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function upsertProduct(actor: Actor, id: string | null, raw: z.input<typeof productSchema>) {
  requirePermission(actor, "product.manage");
  const input = productSchema.parse(raw);
  try {
    return await withTx(async (tx) => {
      const before = id ? await tx.product.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound("Produk");
      const data = { ...input, category: input.category as ProductCategory, slug: slugify(input.name) };
      const p = id ? await tx.product.update({ where: { id }, data }) : await tx.product.create({ data });
      await audit(tx, actor, { action: id ? "product.update" : "product.create", entityType: "Product", entityId: p.id, before, after: p });
      return p;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate("SKU atau nama produk sudah digunakan.");
    throw e;
  }
}

/** New price version. Closes the previous open price at `effectiveFrom`. History is never edited. */
export async function setProductPrice(actor: Actor, productId: string, priceIdr: bigint, effectiveFrom: Date) {
  requirePermission(actor, "product.manage");
  if (priceIdr < 0n) throw invalid("Harga tidak boleh negatif.");
  return withTx(async (tx) => {
    const open = await tx.productPrice.findFirst({ where: { productId, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } });
    if (open && open.effectiveFrom >= effectiveFrom) throw invalid("Tanggal berlaku harus setelah harga aktif saat ini.");
    if (open) await tx.productPrice.update({ where: { id: open.id }, data: { effectiveTo: effectiveFrom } });
    const p = await tx.productPrice.create({ data: { productId, priceIdr, effectiveFrom, createdById: actor.userId } });
    await audit(tx, actor, { action: "product.price", entityType: "Product", entityId: productId, before: open ? { price: open.priceIdr } : null, after: { price: priceIdr, effectiveFrom } });
    return p;
  });
}

export async function listCatalog(opts: { activeOnly?: boolean } = {}) {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...(opts.activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
    include: { _count: { select: { devices: { where: { status: "IN_STOCK" } } } } },
  });
  const now = new Date();
  return Promise.all(
    products.map(async (p) => {
      const rule = await prisma.commissionRule.findFirst({
        where: { type: "SALES", status: "ACTIVE", productId: p.id, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }, { version: "desc" }],
      });
      return { ...p, stock: p._count.devices, price: await currentPrice(prisma, p.id, now), commission: rule?.fixedAmount ?? null, commissionRule: rule ? { code: rule.code, version: rule.version, isDemo: rule.isDemo } : null };
    }),
  );
}
