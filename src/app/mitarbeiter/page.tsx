"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, Modal, PageHeader } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import type { AbsenceType, Employee, EmployeeAbsence } from "@/lib/types";
import { absenceEndDate, todayIso, usedAbsenceDays } from "@/lib/absenceDays";
import { euro, formatCloudError, formatDate, initials } from "@/lib/utils";

function minutesBetween(start: string, end: string) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}
function fmtHours(minutes: number) {
  const h = minutes / 60;
  if (h < 0.05) return "0 h";
  return `${h.toFixed(1).replace(".", ",")} h`;
}
function inclusiveDays(start: string, end: string) {
  const a = new Date(start + "T12:00:00");
  const b = new Date(end + "T12:00:00");
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}
function yearStartIso() {
  return `${new Date().getFullYear()}-01-01`;
}

type ProfileHours = { totalMinutes: number; weekMinutes: number; estimatedHours: number };

export default function EmployeesPage() {
  const { employees, jobs, addEmployee, updateEmployee, removeEmployee, cloudLoading, cloudError, reloadCloud } = useAppData();
  const { company } = useCompany();
  const companyRate = Number(company?.hourly_rate ?? 0);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", role: "Anlagenmechaniker", phone: "", email: "", status: "Verfügbar", active: true });

  const [profileId, setProfileId] = useState<string | null>(null);
  const profile = employees.find((e) => e.id === profileId) ?? null;

  const [hours, setHours] = useState<ProfileHours>({ totalMinutes: 0, weekMinutes: 0, estimatedHours: 0 });
  const [absences, setAbsences] = useState<EmployeeAbsence[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [editXp, setEditXp] = useState("0");
  const [editRate, setEditRate] = useState("");
  const [editVac, setEditVac] = useState("30");
  const [editSick, setEditSick] = useState("0");

  const [absForm, setAbsForm] = useState({ type: "urlaub" as AbsenceType, start: "", end: "", days: "", note: "" });
  const [teamAbsences, setTeamAbsences] = useState<EmployeeAbsence[]>([]);
  const [cardBusy, setCardBusy] = useState<string | null>(null);
  const [cardError, setCardError] = useState<Record<string, string>>({});
  const [vacDays, setVacDays] = useState<Record<string, string>>({});

  async function loadTeamAbsences() {
    const supabase = getSupabaseClient();
    if (!supabase || !company) return;
    const { data, error } = await supabase
      .from("employee_absences")
      .select("id,employee_id,absence_type,start_date,end_date,days,note,created_at")
      .eq("company_id", company.id)
      .gte("start_date", yearStartIso())
      .order("start_date", { ascending: false });
    if (error) return;
    setTeamAbsences(
      (data ?? []).map((row: any) => ({
        id: String(row.id),
        employeeId: String(row.employee_id),
        type: row.absence_type as AbsenceType,
        startDate: row.start_date,
        endDate: row.end_date,
        days: Number(row.days ?? 1),
        note: row.note ?? "",
        createdAt: row.created_at,
      }))
    );
  }

  useEffect(() => {
    void loadTeamAbsences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const ok = await addEmployee({
      ...form,
      status: form.status as Employee["status"],
      xp: 0,
      vacationDaysTotal: 30,
      sickDaysYear: 0,
      hourlyRate: null,
    });
    if (ok) {
      setOpen(false);
      setForm({ name: "", role: "Anlagenmechaniker", phone: "", email: "", status: "Verfügbar", active: true });
    }
    setSaving(false);
  }

  async function loadProfile(emp: Employee) {
    setProfileLoading(true);
    setProfileError("");
    setEditXp(String(emp.xp ?? 0));
    setEditRate(emp.hourlyRate != null ? String(emp.hourlyRate) : "");
    setEditVac(String(emp.vacationDaysTotal ?? 30));
    setEditSick(String(emp.sickDaysYear ?? 0));
    setAbsForm({ type: "urlaub", start: "", end: "", days: "", note: "" });

    const estimatedHours = jobs
      .filter((j) => j.employeeId === emp.id && j.status !== "Storniert")
      .reduce((s, j) => s + Number(j.estimatedHours || 0), 0);

    const supabase = getSupabaseClient();
    if (!supabase || !company) {
      setHours({ totalMinutes: 0, weekMinutes: 0, estimatedHours });
      setAbsences([]);
      setProfileLoading(false);
      return;
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

    const [timeRes, absRes] = await Promise.all([
      supabase
        .from("job_time_entries")
        .select("started_at,ended_at")
        .eq("company_id", company.id)
        .eq("employee_id", emp.id),
      supabase
        .from("employee_absences")
        .select("*")
        .eq("company_id", company.id)
        .eq("employee_id", emp.id)
        .order("start_date", { ascending: false }),
    ]);

    if (timeRes.error) setProfileError(formatCloudError(timeRes.error.message));
    if (absRes.error) setProfileError((prev) => prev || formatCloudError(absRes.error!.message));

    const nowIso = now.toISOString();
    let totalMinutes = 0;
    let weekMinutes = 0;
    for (const row of timeRes.data ?? []) {
      const start = String((row as { started_at: string }).started_at);
      const end = (row as { ended_at: string | null }).ended_at ?? nowIso;
      const mins = minutesBetween(start, end);
      totalMinutes += mins;
      if (start >= weekAgo) weekMinutes += mins;
    }
    setHours({ totalMinutes, weekMinutes, estimatedHours });

    const mapped: EmployeeAbsence[] = (absRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      employeeId: String(r.employee_id),
      type: r.absence_type as AbsenceType,
      startDate: r.start_date,
      endDate: r.end_date,
      days: Number(r.days ?? 1),
      note: r.note ?? "",
      createdAt: r.created_at,
    }));
    setAbsences(mapped);
    setProfileLoading(false);
  }

  useEffect(() => {
    if (profile) void loadProfile(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, company?.id]);

  const vacationUsed = useMemo(
    () => absences.filter((a) => a.type === "urlaub" && a.startDate >= yearStartIso()).reduce((s, a) => s + a.days, 0),
    [absences]
  );
  const sickUsed = useMemo(
    () => absences.filter((a) => a.type === "krankheit" && a.startDate >= yearStartIso()).reduce((s, a) => s + a.days, 0),
    [absences]
  );

  const effectiveRate = profile?.hourlyRate != null && profile.hourlyRate > 0 ? profile.hourlyRate : companyRate;
  const hoursForMoney = hours.totalMinutes > 0 ? hours.totalMinutes / 60 : hours.estimatedHours;
  const moneyHint = effectiveRate > 0 ? effectiveRate * hoursForMoney : 0;

  async function saveProfileFields() {
    if (!profile) return;
    setProfileBusy(true);
    setProfileError("");
    const ok = await updateEmployee(profile.id, {
      xp: Math.max(0, Math.round(Number(editXp) || 0)),
      hourlyRate: editRate.trim() === "" ? null : Math.max(0, Number(editRate) || 0),
      vacationDaysTotal: Math.max(0, Math.round(Number(editVac) || 0)),
      sickDaysYear: Math.max(0, Math.round(Number(editSick) || 0)),
    });
    if (!ok) setProfileError("Profil konnte nicht gespeichert werden.");
    setProfileBusy(false);
  }

  async function addAbsence(e: FormEvent) {
    e.preventDefault();
    if (!profile || !company || !absForm.start || !absForm.end) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setProfileBusy(true);
    setProfileError("");
    const days =
      absForm.days.trim() !== ""
        ? Math.max(0.5, Number(absForm.days) || inclusiveDays(absForm.start, absForm.end))
        : inclusiveDays(absForm.start, absForm.end);
    const { error } = await supabase.from("employee_absences").insert({
      company_id: company.id,
      employee_id: profile.id,
      absence_type: absForm.type,
      start_date: absForm.start,
      end_date: absForm.end,
      days,
      note: absForm.note.trim() || null,
    });
    if (error) {
      setProfileError(formatCloudError(error.message));
      setProfileBusy(false);
      return;
    }
    if (absForm.type === "urlaub") {
      await updateEmployee(profile.id, { status: "Urlaub" });
    }
    setAbsForm({ type: "urlaub", start: "", end: "", days: "", note: "" });
    await loadProfile(profile);
    await loadTeamAbsences();
    await reloadCloud();
    setProfileBusy(false);
  }

  async function removeAbsence(id: string) {
    if (!profile || !company) return;
    if (!confirm("Abwesenheitseintrag löschen?")) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setProfileBusy(true);
    const { error } = await supabase.from("employee_absences").delete().eq("id", id).eq("company_id", company.id);
    if (error) setProfileError(formatCloudError(error.message));
    else {
      await loadProfile(profile);
      await loadTeamAbsences();
    }
    setProfileBusy(false);
  }

  function yearRows(employeeId: string) {
    return teamAbsences.filter((row) => row.employeeId === employeeId);
  }

  async function insertCardAbsence(emp: Employee, type: AbsenceType, days: number) {
    if (!company) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const start = todayIso();
    const rows = yearRows(emp.id);
    if (type === "krankheit" && rows.some((row) => row.type === "krankheit" && row.startDate <= start && row.endDate >= start)) {
      setCardError((current) => ({ ...current, [emp.id]: "Für heute ist schon ein Kranktag eingetragen." }));
      return;
    }
    if (type === "urlaub") {
      const remaining = Math.max(0, (emp.vacationDaysTotal ?? 30) - usedAbsenceDays(rows, "urlaub", yearStartIso()));
      if (days > remaining) {
        setCardError((current) => ({
          ...current,
          [emp.id]: remaining > 0 ? `Nur noch ${String(remaining).replace(".", ",")} Urlaubstage frei.` : "Kein Urlaub mehr frei.",
        }));
        return;
      }
    }
    setCardBusy(emp.id);
    setCardError((current) => ({ ...current, [emp.id]: "" }));
    const { error } = await supabase.from("employee_absences").insert({
      company_id: company.id,
      employee_id: emp.id,
      absence_type: type,
      start_date: start,
      end_date: absenceEndDate(start, days),
      days,
      note: null,
    });
    if (error) {
      setCardError((current) => ({ ...current, [emp.id]: formatCloudError(error.message) }));
      setCardBusy(null);
      return;
    }
    if (type === "urlaub") await updateEmployee(emp.id, { status: "Urlaub" });
    await loadTeamAbsences();
    if (profile?.id === emp.id) await loadProfile(emp);
    setCardBusy(null);
  }

  function openProfile(emp: Employee) {
    setProfileId(emp.id);
  }

  return (
    <main className="page">
      <PageHeader
        title="Mitarbeiter"
        subtitle="Profil: Stunden, Urlaub, Geld-Hinweis und Krankheitstage"
        action={
          <button className="primaryBtn" onClick={() => setOpen(true)}>
            + Mitarbeiter
          </button>
        }
      />
      
      {cloudError && <div className="loginError pageError">{cloudError}</div>}

      {cloudLoading ? (
        <LoadingState label="Mitarbeiter werden geladen…" />
      ) : employees.length === 0 ? (
        <EmptyState
          title="Noch keine Mitarbeiter"
          hint="Lege zuerst dein Team an — danach siehst du Stunden und Urlaub im Profil."
        />
      ) : (
        <div className="employeeGrid">
          {employees.map((e) => {
            const est = jobs
              .filter((j) => j.employeeId === e.id && j.status !== "Storniert")
              .reduce((s, j) => s + Number(j.estimatedHours || 0), 0);
            return (
              <article className="employeeCard" key={e.id}>
                <div className="employeeTop">
                  <div className="bigAvatar">{initials(e.name)}</div>
                  <div style={{ flex: 1 }}>
                    <h3>{e.name}</h3>
                    <p>{e.role}</p>
                  </div>
                  <Badge tone={!e.active ? "gray" : e.status === "Im Einsatz" ? "orange" : e.status === "Verfügbar" ? "green" : "gray"}>
                    {!e.active ? "Inaktiv" : e.status}
                  </Badge>
                </div>
                <div className="kv">
                  <span>Telefon</span>
                  <span>{e.phone || "—"}</span>
                  <span>E-Mail</span>
                  <span>{e.email || "—"}</span>
                  <span>Urlaub</span>
                  <span>
                    {String(Math.max(0, e.vacationDaysTotal - usedAbsenceDays(yearRows(e.id), "urlaub", yearStartIso()))).replace(".", ",")} / {e.vacationDaysTotal} Tage
                  </span>
                  <span>Kranktage</span>
                  <span>{String(usedAbsenceDays(yearRows(e.id), "krankheit", yearStartIso())).replace(".", ",")} Tage</span>
                  <span>Plan-Std.</span>
                  <span>{est > 0 ? `${est.toFixed(1).replace(".", ",")} h` : "—"}</span>
                </div>
                {cardError[e.id] ? <p className="loginError pageError">{cardError[e.id]}</p> : null}
                <div className="absenceActions">
                  <label>
                    Urlaubstage
                    <input
                      className="input"
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={vacDays[e.id] ?? "1"}
                      onChange={(event) => setVacDays((current) => ({ ...current, [e.id]: event.target.value }))}
                    />
                  </label>
                  <button
                    className="ghostBtn smallBtn"
                    type="button"
                    disabled={cardBusy === e.id}
                    onClick={() => void insertCardAbsence(e, "urlaub", Math.max(0.5, Number(vacDays[e.id] || "1") || 1))}
                  >
                    Urlaub buchen
                  </button>
                  <button className="ghostBtn smallBtn" type="button" disabled={cardBusy === e.id} onClick={() => void insertCardAbsence(e, "krankheit", 1)}>
                    + Kranktag
                  </button>
                </div>
                <div className="employeeActions">
                  <button className="primaryBtn" type="button" onClick={() => openProfile(e)}>
                    Profil
                  </button>
                  <select
                    className="select"
                    value={e.status}
                    disabled={!e.active}
                    onChange={(x) => updateEmployee(e.id, { status: x.target.value as Employee["status"] })}
                  >
                    <option>Verfügbar</option>
                    <option>Im Einsatz</option>
                    <option>Urlaub</option>
                  </select>
                  <button className="ghostBtn" type="button" onClick={() => updateEmployee(e.id, { active: !e.active })}>
                    {e.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                  <button
                    className="dangerLink"
                    type="button"
                    onClick={() => confirm(`Mitarbeiter „${e.name}“ löschen?`) && removeEmployee(e.id)}
                  >
                    Löschen
                  </button>
                </div>
                <div className="xpBar">
                  <div className="xpFill" style={{ width: `${Math.min(100, (e.xp % 2000) / 20)}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <Modal title="Mitarbeiter anlegen" subtitle="Neues Teammitglied in der Cloud speichern" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            <div className="formGrid">
              <div className="formField wide">
                <label>Name *</label>
                <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="formField">
                <label>Rolle</label>
                <input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div className="formField">
                <label>Status</label>
                <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>Verfügbar</option>
                  <option>Im Einsatz</option>
                  <option>Urlaub</option>
                </select>
              </div>
              <div className="formField">
                <label>Telefon</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="formField">
                <label>E-Mail</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button className="primaryBtn" disabled={saving}>
                {saving ? "Speichert..." : "Mitarbeiter speichern"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {profile && (
        <Modal
          title={`Profil · ${profile.name}`}
          subtitle={`${profile.role} · ${!profile.active ? "Inaktiv" : profile.status}`}
          onClose={() => setProfileId(null)}
        >
          {profileError && <div className="loginError pageError">{profileError}</div>}
          {profileLoading ? (
            <LoadingState label="Profil wird geladen…" />
          ) : (
            <>
              <div className="metricStrip profileMetricStrip">
                <div className="metric">
                  <span>Stunden schon</span>
                  <strong>{fmtHours(hours.totalMinutes)}</strong>
                  <small style={{ display: "block", marginTop: 4, color: "#6f7680", fontSize: 10 }}>
                    {hours.totalMinutes > 0
                      ? `Diese Woche ${fmtHours(hours.weekMinutes)}`
                      : hours.estimatedHours > 0
                        ? `Noch keine Zeiterfassung · Plan ${hours.estimatedHours.toFixed(1).replace(".", ",")} h`
                        : "Noch keine gebuchten Stunden"}
                  </small>
                </div>
                <div className="metric">
                  <span>Urlaub</span>
                  <strong>
                    {Math.max(0, (profile.vacationDaysTotal ?? 30) - vacationUsed)} / {profile.vacationDaysTotal ?? 30}
                  </strong>
                  <small style={{ display: "block", marginTop: 4, color: "#6f7680", fontSize: 10 }}>
                    Rest / Anspruch · verbraucht {vacationUsed} Tage ({new Date().getFullYear()})
                  </small>
                </div>
                <div className="metric">
                  <span>Krankheitstage</span>
                  <strong>{sickUsed}</strong>
                  <small style={{ display: "block", marginTop: 4, color: "#6f7680", fontSize: 10 }}>
                    {new Date().getFullYear()}
                    {(profile.sickDaysYear ?? 0) > 0 ? ` · Hinweis Kontingent ${profile.sickDaysYear}` : ""}
                  </small>
                </div>
                <div className="metric">
                  <span>Geld (Hinweis)</span>
                  <strong>{euro(moneyHint)}</strong>
                  <small style={{ display: "block", marginTop: 4, color: "#6f7680", fontSize: 10 }}>
                    {effectiveRate > 0
                      ? `${euro(effectiveRate)}/h × ${hoursForMoney.toFixed(1).replace(".", ",")} h${
                          profile.hourlyRate != null && profile.hourlyRate > 0 ? " (persönlich)" : " (Firma)"
                        }`
                      : "Stundensatz in Firmendaten oder hier setzen"}
                  </small>
                </div>
              </div>

              <section className="profileSection">
                <h3 className="profileSectionTitle">Werte bearbeiten</h3>
                <div className="formGrid">
                  <div className="formField">
                    <label>Stundensatz €/h (leer = Firma)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder={companyRate ? String(companyRate) : "Firmen-Satz"}
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                    />
                  </div>
                  <div className="formField">
                    <label>Urlaub Anspruch (Tage/Jahr)</label>
                    <input className="input" type="number" min={0} step={1} value={editVac} onChange={(e) => setEditVac(e.target.value)} />
                  </div>
                  <div className="formField">
                    <label>Krank-Hinweis (Tage/Jahr)</label>
                    <input className="input" type="number" min={0} step={1} value={editSick} onChange={(e) => setEditSick(e.target.value)} />
                  </div>
                </div>
                <div className="formActions">
                  <button type="button" className="primaryBtn" disabled={profileBusy} onClick={() => void saveProfileFields()}>
                    {profileBusy ? "Speichert…" : "Werte speichern"}
                  </button>
                </div>
              </section>

              <section className="profileSection">
                <h3 className="profileSectionTitle">Urlaub / Krankheit eintragen</h3>
                <form onSubmit={addAbsence}>
                  <div className="formGrid">
                    <div className="formField">
                      <label>Art</label>
                      <select
                        className="select"
                        value={absForm.type}
                        onChange={(e) => setAbsForm({ ...absForm, type: e.target.value as AbsenceType })}
                      >
                        <option value="urlaub">Urlaub</option>
                        <option value="krankheit">Krankheit</option>
                      </select>
                    </div>
                    <div className="formField">
                      <label>Von</label>
                      <input
                        required
                        className="input"
                        type="date"
                        value={absForm.start}
                        onChange={(e) => setAbsForm({ ...absForm, start: e.target.value })}
                      />
                    </div>
                    <div className="formField">
                      <label>Bis</label>
                      <input
                        required
                        className="input"
                        type="date"
                        value={absForm.end}
                        onChange={(e) => setAbsForm({ ...absForm, end: e.target.value })}
                      />
                    </div>
                    <div className="formField">
                      <label>Tage (optional)</label>
                      <input
                        className="input"
                        type="number"
                        min={0.5}
                        step={0.5}
                        placeholder="auto"
                        value={absForm.days}
                        onChange={(e) => setAbsForm({ ...absForm, days: e.target.value })}
                      />
                    </div>
                    <div className="formField wide">
                      <label>Notiz</label>
                      <input className="input" value={absForm.note} onChange={(e) => setAbsForm({ ...absForm, note: e.target.value })} />
                    </div>
                  </div>
                  <div className="formActions">
                    <button className="primaryBtn" disabled={profileBusy}>
                      Eintrag speichern
                    </button>
                  </div>
                </form>

                {absences.length === 0 ? (
                  <EmptyState title="Keine Abwesenheiten" hint="Urlaub und Krankheitstage erscheinen hier, sobald du sie einträgst." />
                ) : (
                  <div className="tableWrap" style={{ marginTop: 12 }}>
                    <table className="dataTable">
                      <thead>
                        <tr>
                          <th>Art</th>
                          <th>Zeitraum</th>
                          <th>Tage</th>
                          <th>Notiz</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {absences.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <Badge tone={a.type === "urlaub" ? "blue" : "orange"}>
                                {a.type === "urlaub" ? "Urlaub" : "Krankheit"}
                              </Badge>
                            </td>
                            <td>
                              {formatDate(a.startDate)}
                              {a.endDate !== a.startDate ? ` – ${formatDate(a.endDate)}` : ""}
                            </td>
                            <td>{String(a.days).replace(".", ",")}</td>
                            <td>{a.note || "—"}</td>
                            <td>
                              <button type="button" className="dangerLink" onClick={() => void removeAbsence(a.id)}>
                                Löschen
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p className="profileFootnote">
                Keine Lohnabrechnung — nur Überblick. Geld = Stundensatz × gebuchte (oder geplante) Stunden.
              </p>
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
