"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAuth } from "@/context/AuthProvider";
import { useCompany } from "@/context/CompanyProvider";
import { useAppData } from "@/context/AppDataProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { hoursWithin } from "@/lib/profileMetrics";
import { useConfirm } from "@/components/ConfirmProvider";

type Time = { started_at: string; ended_at: string | null };
type Absence = { absence_type: string; start_date: string; end_date: string; days: number };

export default function ProfilePage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { employees, cloudLoading, updateEmployee } = useAppData();
  const ask = useConfirm();
  const linked = employees.find(e => e.authUserId === user?.id);
  const emailMatches = employees.filter(e => user?.email && e.email.trim().toLowerCase() === user.email.toLowerCase());
  const employee = linked || (emailMatches.length === 1 ? emailMatches[0] : undefined);
  const [linkBusy, setLinkBusy] = useState("");
  const [linkError, setLinkError] = useState("");
  const emailLinkStarted = useRef(false);
  const [times, setTimes] = useState<Time[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  const emailMatchId = emailMatches.length === 1 ? emailMatches[0].id : "";
  const emailMatchAuth = emailMatches.length === 1 ? emailMatches[0].authUserId ?? "" : "";
  useEffect(() => {
    if (emailLinkStarted.current || !user || linked || !emailMatchId || emailMatchAuth) return;
    emailLinkStarted.current = true;
    void updateEmployee(emailMatchId, { authUserId: user.id });
  }, [user, linked, emailMatchId, emailMatchAuth, updateEmployee]);
  useEffect(() => {
    let cancelled = false;
    const db = getSupabaseClient();
    setTimes([]); setAbsences([]); setError("");
    if (!db || !company || !employee) { setLoading(false); return; }
    setLoading(true);
    const companyId = company.id, employeeId = employee.id;
    async function allTimes() {
      const data: Time[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db!.from("job_time_entries").select("started_at,ended_at").eq("company_id", companyId).eq("employee_id", employeeId).order("id").range(offset, offset + 999);
        if (result.error) return { data: null, error: result.error };
        data.push(...result.data);
        if (result.data.length < 1000 || cancelled) return { data, error: null };
      }
    }
    Promise.all([
      allTimes(),
      db.from("employee_absences").select("absence_type,start_date,end_date,days").eq("company_id", company.id).eq("employee_id", employee.id).gte("start_date", `${new Date().getFullYear()}-01-01`).lte("start_date", `${new Date().getFullYear()}-12-31`),
    ]).then(([t, a]) => {
      if (cancelled) return;
      if (t.error || a.error) setError(t.error?.message || a.error?.message || "Daten konnten nicht geladen werden.");
      else { setTimes(t.data || []); setAbsences(a.data || []); }
    }).catch(() => { if (!cancelled) setError("Daten konnten nicht geladen werden. Bitte erneut versuchen."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company?.id, employee?.id]);
  const week = new Date(now); week.setHours(0, 0, 0, 0); week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const hours = (start: Date) => hoursWithin(times, start, now).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " h";
  const year = String(now.getFullYear());
  const annual = absences.filter(a => a.start_date.slice(0, 4) === year);
  const vacation = annual.filter(a => a.absence_type === "urlaub").reduce((n, a) => n + Number(a.days), 0);
  const sick = annual.filter(a => a.absence_type === "krankheit").reduce((n, a) => n + Number(a.days), 0);
  async function linkAccount(employeeId: string) {
    if (!user) return;
    const target = employees.find(e => e.id === employeeId);
    if (!target) return;
    if (!(await ask(`Dieses Konto der Karte „${target.name}“ (${target.role}) zuordnen?`, "Zuordnen"))) return;
    setLinkBusy(employeeId);
    setLinkError("");
    for (const other of employees) {
      if (other.id !== employeeId && other.authUserId === user.id) {
        const cleared = await updateEmployee(other.id, { authUserId: "" });
        if (!cleared) { setLinkError("Die bisherige Zuordnung konnte nicht gelöst werden."); setLinkBusy(""); return; }
      }
    }
    const ok = await updateEmployee(employeeId, {
      authUserId: user.id,
      ...(target && !target.email && user.email ? { email: user.email } : {}),
    });
    if (!ok) setLinkError("Das Konto konnte dieser Mitarbeiterkarte nicht zugeordnet werden.");
    setLinkBusy("");
  }
  async function unlinkAccount() {
    if (!user || !linked) return;
    if (!(await ask(`Die Zuordnung zu „${linked.name}“ aufheben? Die Mitarbeiterkarte bleibt erhalten.`, "Zuordnung aufheben"))) return;
    setLinkBusy(linked.id);
    setLinkError("");
    const ok = await updateEmployee(linked.id, { authUserId: "" });
    if (!ok) setLinkError("Die Zuordnung konnte nicht aufgehoben werden.");
    setLinkBusy("");
  }
  return <main className="page">
    <PageHeader title="Mein Profil" subtitle={employee ? `${employee.name} · ${employee.role}` : "Ihre Arbeitszeit und Abwesenheiten"} action={linked ? <button className="ghostBtn" type="button" disabled={linkBusy !== ""} onClick={() => void unlinkAccount()}>{linkBusy === linked.id ? "…" : "Zuordnung aufheben"}</button> : undefined} />
    {cloudLoading || loading ? <LoadingState /> : !employee ? <>
      <EmptyState title="Mitarbeiterprofil noch nicht verknüpft" hint={employees.length ? "Wählen Sie die Mitarbeiterkarte, die zu diesem Konto gehört." : "Legen Sie zuerst unter Mitarbeiter eine Karte an."} />
      {linkError ? <div className="errorBox" role="alert">{linkError}</div> : null}
      {employees.length > 0 && <div className="profileLinkList">
        {employees.map(e => <button className="profileLinkRow" type="button" key={e.id} disabled={linkBusy !== ""} onClick={() => void linkAccount(e.id)}>
          <span><strong>{e.name}</strong><span>{e.role}{e.email ? ` · ${e.email}` : ""}</span></span>
          <span>{linkBusy === e.id ? "…" : "Dieses Konto zuordnen"}</span>
        </button>)}
      </div>}
    </> : error ? <div className="errorBox" role="alert">{error}</div> : <>
      {linkError ? <div className="errorBox" role="alert">{linkError}</div> : null}
      <div className="profileStats">
        <StatCard label="Arbeitszeit diese Woche" value={hours(week)} hint="Seit Montag, inklusive laufender Arbeitszeit" />
        <StatCard label="Arbeitszeit diesen Monat" value={hours(month)} hint="Tatsächlich erfasste Arbeitszeit" />
        <StatCard label="Urlaub verfügbar" value={`${Math.max(0, employee.vacationDaysTotal - vacation)} Tage`} hint={`${vacation} von ${employee.vacationDaysTotal} Tagen für ${year} eingetragen`} />
        <StatCard label="Krankheitstage" value={`${sick} Tage`} hint={`Eingetragene Abwesenheiten ${year}`} />
      </div>
      <p>Urlaub und Krankheit werden nach dem Beginn der eingetragenen Abwesenheit dem Kalenderjahr zugeordnet. Geplanter Urlaub ist bereits abgezogen.</p>
    </>}
  </main>;
}
