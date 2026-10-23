import { adminPage } from "@/server/page-auth";
import { getAllSettings, SETTINGS } from "@/server/settings";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { ActionForm } from "@/components/shared/action-form";
import { updateSettingAction } from "../actions";

export const metadata = { title: "Pengaturan" };

export default async function Settings() {
  await adminPage("settings.manage");
  const { t, locale } = await getDictionary();
  const all = await getAllSettings();
  return (
    <>
      <PageHeader title={t.nav.settings} description="Parameter program yang dapat dikonfigurasi. Setiap perubahan dicatat dalam log audit. Tarif komisi dan referral diatur di Aturan komisi (berversi)." />
      <Card>
        <CardContent className="divide-y p-0">
          {all.map((s) => {
            const v = s.value as unknown;
            const kind = typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : Array.isArray(v) ? "array" : "string";
            const def = SETTINGS[s.key].default as unknown;
            return (
              <div key={s.key} className="grid gap-3 p-4 lg:grid-cols-[1fr_420px] lg:items-center">
                <div>
                  <div className="font-mono text-sm font-semibold">{s.key} {s.isDefault && <Badge variant="muted">bawaan</Badge>}</div>
                  <div className="text-sm text-muted-foreground">{s.description}</div>
                  <div className="text-xs text-muted-foreground">Bawaan: <span className="font-mono">{JSON.stringify(def)}</span>{s.updatedAt && ` · diubah ${formatDateTime(s.updatedAt, locale)}`}</div>
                </div>
                <ActionForm action={updateSettingAction} hidden={{ key: s.key, kind }} submitLabel="Simpan" resetOnSuccess={false} className="grid-cols-[1fr_auto] items-end" variant="outline">
                  {kind === "boolean" ? (
                    <NativeSelect name="value" defaultValue={String(v)} aria-label={s.key}><option value="true">true</option><option value="false">false</option></NativeSelect>
                  ) : (
                    <Input name="value" defaultValue={Array.isArray(v) ? v.join(", ") : String(v)} aria-label={s.key} inputMode={kind === "number" ? "numeric" : undefined} />
                  )}
                </ActionForm>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
