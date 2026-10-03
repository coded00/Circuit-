"use client";

import { useEffect } from "react";
import { feedback } from "@/lib/feedback";

const PRESSABLE = ".btn-primary, .btn-secondary, .btn-danger, .btn-danger-solid, .btn-golive, .btn-icon";

/** A light tap of haptics on every real button press, on phones that can vibrate. Sounds are reserved for moments that matter. */
export function FeedbackProvider() {
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      const el = (e.target as HTMLElement | null)?.closest?.(PRESSABLE);
      if (el && !(el as HTMLButtonElement).disabled) feedback("tap");
    }
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
