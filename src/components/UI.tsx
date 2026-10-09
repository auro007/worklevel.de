"use client";

import { useEffect } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="pageHeader"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="statCard"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

export function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "orange" | "green" | "blue" | "red" | "gray" | "yellow" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modalBackdrop" onMouseDown={onClose}>
    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modalHead"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="iconBtn" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}

/** Consistent German empty state for list pages. */
export function EmptyState({
  title,
  children,
  hint,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`emptyState emptyStateRich${className ? ` ${className}` : ""}`}>
      {title && <strong className="emptyStateTitle">{title}</strong>}
      {children && <div className="emptyStateBody">{children}</div>}
      {hint && <p className="emptyStateHint">{hint}</p>}
    </div>
  );
}

/** Consistent German loading state. */
export function LoadingState({ label = "Daten werden geladen…" }: { label?: string }) {
  return (
    <div className="emptyState loadingState">
      <span className="inlineSpinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
