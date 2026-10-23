import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionForm } from "@/components/shared/action-form";
import { ActionButton } from "@/components/shared/action-button";
import { createAdminUserAction, resetMfaAction, setUserRolesAction, toggleUserAction } from "../actions";

export const metadata = { title: "Pengguna admin" };

export default async function Users() {
  const { actor } = await adminPage("user.manage");
  const { t, locale } = await getDictionary();
  const users = await prisma.user.findMany({ where: { roles: { some: { role: { key: { in: ["SUPER_ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN"] } } } } }, include: { roles: { include: { role: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title={t.nav.users} description="Pengguna internal. MFA wajib untuk semua peran admin." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="divide-y p-0">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <div className="font-semibold">{u.name} <StatusBadge status={u.status} label={t.status[u.status as keyof typeof t.status]} /></div>
                  <div className="text-muted-foreground">{u.email} · {u.roles.map((r) => r.role.key).join(", ")} · MFA {u.mfaEnabledAt ? "aktif" : "belum"} · login {formatDateTime(u.lastLoginAt, locale)}</div>
                </div>
                {u.id !== actor.userId && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={setUserRolesAction} args={{ userId: u.id }} label="Ubah peran" variant="outline" input={{ label: "Peran (pisahkan koma): SUPER_ADMIN, FINANCE_ADMIN, OPERATIONS_ADMIN", defaultValue: u.roles.map((r) => r.role.key).join(", ") }} />
                    <ActionButton action={resetMfaAction} args={{ userId: u.id }} label="Reset MFA" variant="outline" confirmTitle="Reset MFA pengguna ini?" confirmBody="Pengguna harus mendaftarkan autentikator lagi saat login berikutnya." />
                    <ActionButton action={toggleUserAction} args={{ userId: u.id, disabled: u.status === "ACTIVE" ? "true" : "false" }} label={u.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"} variant={u.status === "ACTIVE" ? "destructive" : "success"} confirmTitle="Ubah status pengguna?" />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader><CardTitle>Tambah pengguna admin</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createAdminUserAction} submitLabel="Buat pengguna">
              <Field label="Nama" htmlFor="name"><Input id="name" name="name" required /></Field>
              <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
              <Field label="Kata sandi awal" htmlFor="password" hint="Min. 10 karakter, huruf & angka. Bagikan melalui kanal aman."><Input id="password" name="password" type="password" minLength={10} required /></Field>
              <fieldset className="grid gap-2 text-sm"><legend className="mb-1 font-semibold">Peran</legend>
                {["SUPER_ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN"].map((r) => <label key={r} className="flex items-center gap-2"><input type="checkbox" name="roles" value={r} className="size-4" />{r}</label>)}
              </fieldset>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
