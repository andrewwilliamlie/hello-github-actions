"use client";
import { createContext, useContext } from "react";
import type { Dictionary } from "./id";

const Ctx = createContext<{ t: Dictionary; locale: "id" | "en" } | null>(null);

export function I18nProvider({ t, locale, children }: { t: Dictionary; locale: "id" | "en"; children: React.ReactNode }) {
  return <Ctx.Provider value={{ t, locale }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
