"use client";

import { createContext, useContext, useRef, useState } from "react";
import { Modal } from "@/components/UI";

type Ask = (message: string, confirmLabel?: string, cancelLabel?: string) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmLabel, setConfirmLabel] = useState("Bestätigen");
  const [cancelLabel, setCancelLabel] = useState("Abbrechen");
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  function ask(nextMessage: string, nextConfirm = "Bestätigen", nextCancel = "Abbrechen") {
    setMessage(nextMessage);
    setConfirmLabel(nextConfirm);
    setCancelLabel(nextCancel);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }

  function close(value: boolean) {
    setOpen(false);
    resolveRef.current(value);
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && (
        <Modal title="Bitte bestätigen" onClose={() => close(false)}>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{message}</p>
          <div className="formActions">
            <button className="ghostBtn" type="button" onClick={() => close(false)}>{cancelLabel}</button>
            <button className="primaryBtn" type="button" onClick={() => close(true)}>{confirmLabel}</button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
