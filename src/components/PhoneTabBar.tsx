"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCompany } from "@/context/CompanyProvider";

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" /></svg>;
}
function JobsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>;
}
function PeopleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="9" cy="8" r="3" /><path d="M20 20v-1.2a3 3 0 0 0-2.2-2.9M16 5.2a3 3 0 0 1 0 5.6" /></svg>;
}
function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>;
}
function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M5 19a7 7 0 0 1 14 0" /></svg>;
}

export default function PhoneTabBar() {
  const pathname = usePathname();
  const { role } = useCompany();
  const worker = role === "worker";
  const start = pathname === "/";
  const jobs = pathname.startsWith("/auftraege") || pathname.startsWith("/techniker");
  const customers = pathname.startsWith("/kunden") || pathname.startsWith("/lieferanten") || pathname.startsWith("/leads");
  const profile = pathname.startsWith("/profil");
  const more = !start && !jobs && !customers && !(worker && profile);

  const item = (href: string, label: string, active: boolean, icon: ReactNode) => (
    <Link href={href} className={active ? "phoneTab active" : "phoneTab"} aria-current={active ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="phoneTabBar" aria-label="App">
      {item("/", "Start", start, <HomeIcon />)}
      {item(worker ? "/techniker" : "/auftraege", "Aufträge", jobs, <JobsIcon />)}
      {worker
        ? item("/profil", "Profil", profile, <UserIcon />)
        : item("/kunden", "Kunden", customers, <PeopleIcon />)}
      {!worker && item("/mehr", "Mehr", more, <MoreIcon />)}
    </nav>
  );
}
