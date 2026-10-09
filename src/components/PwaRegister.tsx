"use client";

import { useEffect } from "react";

/** Registers the lightweight shell service worker in production only (avoids Turbopack/dev conflicts). */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Pick up V15.5 shell cache when a new SW is waiting
          if (reg.waiting) reg.waiting.postMessage?.({ type: "SKIP_WAITING" });
          reg.update().catch(() => undefined);
        })
        .catch(() => {
          /* ignore — PWA is optional */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
