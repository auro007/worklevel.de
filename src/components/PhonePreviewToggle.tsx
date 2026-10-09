"use client";

import { useEffect, useState } from "react";

const storageKey = "worklevel:phone-preview";

function applyPhoneMode(preview: boolean) {
  const root = document.documentElement;
  root.classList.toggle("phone-preview", preview);
  root.classList.toggle("is-phone", preview);
}

export default function PhonePreviewToggle({ dock = false }: { dock?: boolean }) {
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) === "1";
    setPreview(saved);
    applyPhoneMode(saved);
  }, []);

  function toggle() {
    const next = !preview;
    setPreview(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
    applyPhoneMode(next);
  }

  return (
    <button type="button" className={dock ? "phonePreviewBtn phonePreviewDock" : "phonePreviewBtn phonePreviewInline"} onClick={toggle}>
      {preview ? "Desktop" : "Smartphone"}
    </button>
  );
}
