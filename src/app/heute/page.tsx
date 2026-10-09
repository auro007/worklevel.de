"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { jobAkteHref, jobPlantafelHref, jobTechnikerHref } from "@/lib/createJobFromOffer";
import type { Job, JobStatus } from "@/lib/types";

type GroupMode = "status" | "assignee";

const STATUS_ORDER: JobStatus[] = ["Geplant", "In Arbeit", "Erledigt", "Storniert"];

function statusTone(status: JobStatus): "orange" | "green" | "blue" | "red" | "gray" {
  if (status === "In Arbeit") return "orange";
  if (status === "Erledigt") return "green";
  if (status === "Storniert") return "gray";
  return "blue";
}

function priorityTone(p: Job["priority"]): "red" | "yellow" | "blue" {
  return p === "Notfall" ? "red" : p === "Hoch" ? "yellow" : "blue";
}

export default function HeutePage() {
  const { role } = useCompany();
  const { jobs, employees, customers, cloudLoading, cloudError } = useAppData();
  const [groupMode, setGroupMode] = useState<GroupMode>("status");

  const today = new Date().toLocaleDateString("en-CA");
  const todayLabel = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const todayJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.date === today && j.status !== "Storniert")
        .sort((a, b) => String(a.time).localeCompare(String(b.time))),
    [jobs, today]
  );

  const unassigned = useMemo(() => todayJobs.filter((j) => !j.employeeId), [todayJobs]);
  const inProgress = useMemo(() => todayJobs.filter((j) => j.status === "In Arbeit"), [todayJobs]);
  const done = useMemo(() => todayJobs.filter((j) => j.status === "Erledigt"), [todayJobs]);
  const planned = useMemo(() => todayJobs.filter((j) => j.status === "Geplant"), [todayJobs]);

  const byStatus = useMemo(() => {
    const map = new Map<JobStatus, Job[]>();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const j of todayJobs) {
      const list = map.get(j.status) ?? [];
      list.push(j);
      map.set(j.status, list);
    }
    return STATUS_ORDER.filter((s) => s !== "Storniert").map((s) => ({
      key: s,
      label: s,
      jobs: map.get(s) ?? [],
    }));
  }, [todayJobs]);

  const byAssignee = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of todayJobs) {
      const key = j.employeeId || "__unassigned__";
      const list = map.get(key) ?? [];
      list.push(j);
      map.set(key, list);
    }
    const groups: { key: string; label: string; jobs: Job[] }[] = [];
    const un = map.get("__unassigned__");
    if (un?.length) {
      groups.push({ key: "__unassigned__", label: "Nicht zugewiesen", jobs: un });
    }
    const named = employees
      .filter((e) => map.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((e) => ({ key: e.id, label: e.name, jobs: map.get(e.id) ?? [] }));
    groups.push(...named);
    // orphan assignee ids (employee deleted)
    for (const [id, list] of map) {
      if (id === "__unassigned__") continue;
      if (employees.some((e) => e.id === id)) continue;
      groups.push({ key: id, label: "Unbekannter Mitarbeiter", jobs: list });
    }
    return groups;
  }, [todayJobs, employees]);

  if (role === "worker") {
    return (
      <main className="page">
        <PageHeader
          title="Heute"
          subtitle="Büro-Übersicht"
          action={
            <Link className="primaryBtn" href="/techniker">
              Meine Aufträge öffnen
            </Link>
          }
        />
        <EmptyState
          title="Nur für Büro"
          hint="Die Heute-Übersicht ist für Inhaber und Admin. Als Techniker nutze „Meine Aufträge“."
        />
      </main>
    );
  }

  const groups = groupMode === "status" ? byStatus : byAssignee;

  return (
    <main className="page heutePage">
      <PageHeader
        title="Heute"
        subtitle={`Tagesübersicht · ${todayLabel}`}
        action={
          <div className="toolbarRight">
            <Link className="secondaryBtn" href="/plantafel">
              Plantafel
            </Link>
            <Link className="primaryBtn" href="/auftraege">
              + Neuer Auftrag
            </Link>
          </div>
        }
      />

      {cloudError && <div className="loginError pageError">{cloudError}</div>}

      <div className="heuteQuickLinks" aria-label="Schnellzugriff">
        <Link className="workflowChip" href="/auftraege">
          Akte
        </Link>
        <Link className="workflowChip" href="/plantafel">
          Plantafel
        </Link>
        <Link className="workflowChip" href="/techniker">
          Techniker
        </Link>
        <span
          className={`heuteUnassignedChip ${unassigned.length > 0 ? "hasUnassigned" : ""}`}
          title="Aufträge ohne Mitarbeiter heute"
        >
          Nicht zugewiesen: <strong>{cloudLoading ? "…" : unassigned.length}</strong>
        </span>
      </div>

      <section className="statsGrid heuteStats">
        <StatCard
          label="Aufträge heute"
          value={cloudLoading ? "…" : String(todayJobs.length)}
          hint={todayLabel}
        />
        <StatCard
          label="Nicht zugewiesen"
          value={cloudLoading ? "…" : String(unassigned.length)}
          hint={unassigned.length ? "Auf Plantafel vergeben" : "Alles vergeben"}
        />
        <StatCard
          label="Geplant / In Arbeit"
          value={cloudLoading ? "…" : String(planned.length + inProgress.length)}
          hint={`${planned.length} geplant · ${inProgress.length} in Arbeit`}
        />
        <StatCard
          label="Erledigt heute"
          value={cloudLoading ? "…" : String(done.length)}
          hint="Status Erledigt"
        />
      </section>

      <div className="heuteGroupToggle" role="tablist" aria-label="Gruppierung">
        <button
          type="button"
          role="tab"
          aria-selected={groupMode === "status"}
          className={`heuteToggleBtn ${groupMode === "status" ? "active" : ""}`}
          onClick={() => setGroupMode("status")}
        >
          Nach Status
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={groupMode === "assignee"}
          className={`heuteToggleBtn ${groupMode === "assignee" ? "active" : ""}`}
          onClick={() => setGroupMode("assignee")}
        >
          Nach Mitarbeiter
        </button>
      </div>

      {cloudLoading ? (
        <LoadingState label="Heutige Aufträge werden geladen…" />
      ) : todayJobs.length === 0 ? (
        <section className="panel">
          <EmptyState
            title="Keine Aufträge heute"
            hint="Für heute ist noch nichts geplant. Lege einen Auftrag an oder öffne die Plantafel."
          >
            <div className="heuteEmptyActions">
              <Link className="primaryBtn" href="/auftraege">
                Auftrag anlegen
              </Link>
              <Link className="secondaryBtn" href="/plantafel">
                Zur Plantafel
              </Link>
            </div>
          </EmptyState>
        </section>
      ) : (
        groups
          .filter((g) => g.jobs.length > 0)
          .map((g) => (
            <section className="panel heuteGroupPanel" key={g.key}>
              <div className="panelHead">
                <div>
                  <h2>{g.label}</h2>
                  <p>
                    {g.jobs.length} {g.jobs.length === 1 ? "Auftrag" : "Aufträge"}
                    {g.key === "__unassigned__" ? " · bitte zuweisen" : ""}
                  </p>
                </div>
                {g.key === "__unassigned__" && (
                  <Link className="textLink" href="/plantafel">
                    Auf Plantafel zuweisen →
                  </Link>
                )}
              </div>
              {g.jobs.map((job) => {
                const customer = customers.find((c) => c.id === job.customerId);
                const employee = employees.find((e) => e.id === job.employeeId);
                return (
                  <div className="jobListRow heuteJobRow" key={job.id}>
                    <div className="jobTime">{job.time || "—"}</div>
                    <div>
                      <h3>{job.title}</h3>
                      <p>
                        {customer?.name ?? "Kunde"}
                        {job.number ? ` · ${job.number}` : ""}
                        {groupMode === "status"
                          ? ` · ${employee?.name ?? "Nicht zugewiesen"}`
                          : ""}
                        {job.address ? ` · ${job.address}` : ""}
                      </p>
                    </div>
                    <div className="heuteJobActions">
                      {(job.priority === "Hoch" || job.priority === "Notfall") && (
                        <Badge tone={priorityTone(job.priority)}>{job.priority}</Badge>
                      )}
                      <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                      <Link className="textLink" href={jobAkteHref(job.id)}>
                        Akte
                      </Link>
                      <Link className="textLink" href={jobPlantafelHref(job.id)}>
                        Plantafel
                      </Link>
                      <Link className="textLink" href={jobTechnikerHref(job.id)}>
                        Techniker
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          ))
      )}
    </main>
  );
}
