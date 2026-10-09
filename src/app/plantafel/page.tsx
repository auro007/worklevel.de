"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState, LoadingState, Modal, PageHeader } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import type { Job } from "@/lib/types";

const HOUR_START = 8;
const HOUR_END = 17; // inclusive display through 17:xx

function iso(d: Date) {
  return d.toLocaleDateString("en-CA");
}

function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function parseHour(time: string): number {
  const h = Number(String(time || "08:00").slice(0, 2));
  return Number.isFinite(h) ? h : HOUR_START;
}

function clampHour(h: number) {
  if (h < HOUR_START) return HOUR_START;
  if (h > HOUR_END) return HOUR_END;
  return h;
}

function shortTitle(title: string, max = 28) {
  const t = (title || "Auftrag").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function priorityTone(p: Job["priority"]) {
  return p === "Notfall" ? "red" : p === "Hoch" ? "yellow" : "blue";
}

/** Badge: hours + optional XP/€ from Wartung template (V14.5). */
function JobMetaBadge({ job }: { job: Job }) {
  const hours = job.estimatedHours > 0 ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(job.estimatedHours)} h` : null;
  const price = job.suggestedPrice != null && Number(job.suggestedPrice) > 0
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(job.suggestedPrice))
    : null;
  return (
    <span className="hourJobMeta">
      {hours && <span className="hourJobHours">{hours}</span>}
      {price && <span className="priceBadge tiny">{price}</span>}
      {(job.priority === "Hoch" || job.priority === "Notfall") && (
        <Badge tone={priorityTone(job.priority)}>{job.priority}</Badge>
      )}
    </span>
  );
}

export default function PlannerPage() {
  const { jobs, customers, employees, updateJob, cloudError, cloudLoading } = useAppData();
  const [dayOffset, setDayOffset] = useState(0);
  const [assignJobId, setAssignJobId] = useState<string | null>(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const selected = useMemo(() => addDays(new Date(), dayOffset), [dayOffset]);
  const selectedIso = iso(selected);
  const weekdayLong = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(selected);
  const dateLong = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(selected);
  const isToday = selectedIso === iso(new Date());

  const activeWorkers = useMemo(
    () => employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, "de")),
    [employees]
  );

  const dayJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.date === selectedIso && j.status !== "Storniert")
        .sort((a, b) => String(a.time).localeCompare(String(b.time))),
    [jobs, selectedIso]
  );

  const unassigned = useMemo(
    () => dayJobs.filter((j) => !j.employeeId),
    [dayJobs]
  );

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i),
    []
  );

  const jobsByWorkerHour = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of dayJobs) {
      if (!j.employeeId) continue;
      const h = clampHour(parseHour(j.time));
      const key = `${j.employeeId}|${h}`;
      const list = map.get(key) ?? [];
      list.push(j);
      map.set(key, list);
    }
    return map;
  }, [dayJobs]);

  const assignTarget = assignJobId ? dayJobs.find((j) => j.id === assignJobId) ?? jobs.find((j) => j.id === assignJobId) : undefined;

  async function confirmAssign() {
    if (!assignJobId || !assignEmployeeId) return;
    setAssignBusy(true);
    const ok = await updateJob(assignJobId, { employeeId: assignEmployeeId });
    setAssignBusy(false);
    if (ok) {
      setAssignJobId(null);
      setAssignEmployeeId("");
    }
  }

  function openAssign(job: Job, prefillEmployee?: string) {
    setAssignJobId(job.id);
    setAssignEmployeeId(prefillEmployee || job.employeeId || "");
  }

  const deepLinked = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || deepLinked.current || cloudLoading) return;
    const id = new URLSearchParams(window.location.search).get("job");
    if (!id) return;
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    deepLinked.current = true;
    // Jump planner day to the job date
    try {
      const picked = new Date(job.date + "T12:00:00");
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const diff = Math.round((picked.getTime() - today.getTime()) / 86400000);
      if (Number.isFinite(diff)) setDayOffset(diff);
    } catch {
      /* ignore bad date */
    }
    setPanelOpen(true);
    openAssign(job);
  }, [jobs, cloudLoading]);

  return (
    <main className="page plannerPage hourPlannerPage">
      <PageHeader
        title="Plantafel"
        subtitle="Tagesplanung · Spalten = Mitarbeiter · Zeilen = Stunden"
        action={
          <div className="toolbarRight">
            <button className="ghostBtn" type="button" onClick={() => setDayOffset((x) => x - 1)}>
              ← Tag
            </button>
            <button className="secondaryBtn" type="button" onClick={() => setDayOffset(0)}>
              Heute
            </button>
            <button className="ghostBtn" type="button" onClick={() => setDayOffset((x) => x + 1)}>
              Tag →
            </button>
            <input
              className="input plannerDateInput"
              type="date"
              value={selectedIso}
              onChange={(e) => {
                if (!e.target.value) return;
                const picked = new Date(e.target.value + "T12:00:00");
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                const diff = Math.round((picked.getTime() - today.getTime()) / 86400000);
                setDayOffset(diff);
              }}
              aria-label="Datum wählen"
            />
          </div>
        }
      />

      {cloudError && <div className="loginError pageError">{cloudError}</div>}

      <div className="hourPlannerHeader">
        <div className="hourPlannerDateBlock">
          <strong className="hourPlannerWeekday">
            {weekdayLong}
            {isToday ? " · Heute" : ""}
          </strong>
          <span className="hourPlannerDate">{dateLong}</span>
        </div>
        <button
          type="button"
          className={`hourUnassignedCounter ${unassigned.length > 0 ? "hasUnassigned" : ""}`}
          onClick={() => setPanelOpen((o) => !o)}
          title="Nicht vergebene Aufträge anzeigen"
        >
          Aufträge nicht vergeben: <strong>{unassigned.length}</strong>
        </button>
      </div>

      <div className="mobileHint">
        Horizontal wischen für alle Mitarbeiter · Klick auf Auftrag zum Zuweisen oder Öffnen.
      </div>

      {cloudLoading ? (
        <LoadingState label="Plantafel wird geladen…" />
      ) : activeWorkers.length === 0 ? (
        <EmptyState
          title="Keine aktiven Mitarbeiter"
          hint="Lege unter Mitarbeiter aktive Techniker an, damit die Stunden-Spalten erscheinen."
        >
          <Link href="/mitarbeiter" className="primaryBtn" style={{ marginTop: 8, display: "inline-flex" }}>
            Zu den Mitarbeitern
          </Link>
        </EmptyState>
      ) : (
        <div className="hourPlannerLayout">
          <div className="hourGridWrap">
            {dayJobs.length === 0 && (
              <EmptyState
                title="Keine Aufträge an diesem Tag"
                hint="Lege Aufträge mit Datum an oder wechsle den Tag. Nicht vergebene Aufträge erscheinen rechts."
              >
                <Link href="/auftraege" className="primaryBtn" style={{ marginTop: 8, display: "inline-flex" }}>
                  Zu den Aufträgen
                </Link>
              </EmptyState>
            )}
            <div
              className="hourGrid"
              style={{
                gridTemplateColumns: `64px repeat(${activeWorkers.length}, minmax(140px, 1fr))`,
              }}
            >
              <div className="hourCorner">Uhr</div>
              {activeWorkers.map((w) => (
                <div className="hourColHead" key={w.id} title={`${w.name} · ${w.role}`}>
                  <strong>{w.name}</strong>
                  <span className="hourColSub">
                    {w.status}
                  </span>
                </div>
              ))}

              {hours.map((h) => (
                <div className="hourRow" key={h} style={{ display: "contents" }}>
                  <div className="hourLabel">{String(h).padStart(2, "0")}:00</div>
                  {activeWorkers.map((w) => {
                    const cellJobs = jobsByWorkerHour.get(`${w.id}|${h}`) ?? [];
                    return (
                      <div
                        className={`hourCell ${cellJobs.length === 0 ? "hourCellEmpty" : ""}`}
                        key={`${w.id}-${h}`}
                      >
                        {cellJobs.map((j) => {
                          const c = customers.find((x) => x.id === j.customerId);
                          return (
                            <button
                              type="button"
                              className={`hourJobCard prio-${j.priority}`}
                              key={j.id}
                              onClick={() => openAssign(j, w.id)}
                              title={`${j.title} · ${j.time} · ${c?.name ?? ""}`}
                            >
                              <span className="hourJobTime">{j.time}</span>
                              <span className="hourJobTitle">{shortTitle(j.title)}</span>
                              <span className="hourJobCustomer">{c?.name ?? "—"}</span>
                              <JobMetaBadge job={j} />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {panelOpen && (
            <aside className="hourUnassignedPanel">
              <div className="hourUnassignedHead">
                <strong>Nicht vergeben</strong>
                <span>{unassigned.length}</span>
              </div>
              {unassigned.length === 0 ? (
                <p className="hourUnassignedEmpty">Alle Aufträge dieses Tages sind zugewiesen.</p>
              ) : (
                <ul className="hourUnassignedList">
                  {unassigned.map((j) => {
                    const c = customers.find((x) => x.id === j.customerId);
                    return (
                      <li key={j.id}>
                        <button type="button" className="hourUnassignedItem" onClick={() => openAssign(j)}>
                          <span className="hourJobTime">{j.time}</span>
                          <strong>{shortTitle(j.title, 36)}</strong>
                          <span className="cellSub">{c?.name ?? "—"}</span>
                          <JobMetaBadge job={j} />
                        </button>
                        <div className="hourUnassignedActions">
                          <button type="button" className="secondaryBtn" onClick={() => openAssign(j)}>
                            Zuweisen
                          </button>
                          <Link href={`/auftraege?akte=${encodeURIComponent(j.id)}`} className="ghostBtn">
                            Öffnen
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          )}
        </div>
      )}

      {assignTarget && (
        <Modal
          title="Auftrag zuweisen"
          subtitle={`${assignTarget.time} · ${shortTitle(assignTarget.title, 48)}`}
          onClose={() => {
            if (!assignBusy) {
              setAssignJobId(null);
              setAssignEmployeeId("");
            }
          }}
        >
          <div className="formGrid">
            <div className="formField wide">
              <label>Mitarbeiter</label>
              <select
                className="select"
                value={assignEmployeeId}
                onChange={(e) => setAssignEmployeeId(e.target.value)}
              >
                <option value="">Nicht zugewiesen</option>
                {activeWorkers.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="formField wide">
              <p className="cellSub" style={{ margin: 0 }}>
                Kunde: {customers.find((c) => c.id === assignTarget.customerId)?.name ?? "—"} ·{" "}
                {assignTarget.estimatedHours || 0} h · {assignTarget.priority} · {assignTarget.status}
              </p>
            </div>
          </div>
          <div className="formActions">
            <Link href="/auftraege" className="ghostBtn" style={{ marginRight: "auto" }}>
              Zu Aufträgen
            </Link>
            <button
              type="button"
              className="ghostBtn"
              disabled={assignBusy}
              onClick={() => {
                setAssignJobId(null);
                setAssignEmployeeId("");
              }}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="primaryBtn"
              disabled={assignBusy}
              onClick={() => void confirmAssign()}
            >
              {assignBusy ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
