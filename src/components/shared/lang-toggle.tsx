"use client";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LangToggle({ locale, className }: { locale: "id" | "en"; className?: string }) {
  const router = useRouter();
  const next = locale === "id" ? "en" : "id";
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      aria-label={next === "en" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
      onClick={() => {
        document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <Languages />
      {locale.toUpperCase()}
    </Button>
  );
}
