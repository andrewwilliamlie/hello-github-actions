"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CopyButton({ text, label = "Salin", copiedLabel = "Disalin" }: { text: string; label?: string; copiedLabel?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Tidak dapat menyalin otomatis. Salin teks secara manual.");
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? copiedLabel : label}
    </Button>
  );
}
