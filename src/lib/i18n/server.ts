import "server-only";
import { cookies } from "next/headers";
import { id, type Dictionary } from "./id";
import { en } from "./en";

export type Locale = "id" | "en";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return jar.get("lang")?.value === "en" ? "en" : "id";
}

export async function getDictionary(): Promise<{ t: Dictionary; locale: Locale }> {
  const locale = await getLocale();
  return { t: locale === "en" ? en : (id as unknown as Dictionary), locale };
}
