import { getDictionary } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { PublicFooter, PublicHeader } from "./public-header";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getDictionary();
  return (
    <I18nProvider t={t} locale={locale}>
      <PublicHeader t={t} locale={locale} />
      {children}
      <PublicFooter t={t} />
    </I18nProvider>
  );
}
