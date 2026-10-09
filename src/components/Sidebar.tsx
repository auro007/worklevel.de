"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";
import { useCompany } from "@/context/CompanyProvider";

type NavLink = {
  icon: string;
  label: string;
  href: string;
  roles: readonly string[];
  to?: string;
};

type NavBlock =
  | { type: "item"; item: NavLink }
  | { type: "group"; label: string; items: NavLink[] };

const navigation: NavBlock[] = [
  { type: "item", item: { icon: "dashboard", label: "Dashboard", href: "/", roles: ["owner", "admin"] } },
  { type: "item", item: { icon: "sun", label: "Heute", href: "/heute", roles: ["owner", "admin"] } },
  { type: "item", item: { icon: "sun", label: "Heute", href: "/", roles: ["worker"] } },
  {
    type: "group",
    label: "Kunden",
    items: [
      { icon: "people", label: "Kunden", href: "/kunden", to: "/kunden?tab=kunden", roles: ["owner", "admin"] },
      { icon: "factory", label: "Lieferanten", href: "/lieferanten", roles: ["owner", "admin"] },
      { icon: "target", label: "Leads", href: "/leads", roles: ["owner", "admin"] },
    ],
  },
  {
    type: "group",
    label: "Aufträge",
    items: [
      { icon: "file", label: "Angebote", href: "/angebote", roles: ["owner", "admin"] },
      { icon: "wrench", label: "Aufträge", href: "/auftraege", roles: ["owner", "admin"] },
      { icon: "box", label: "Lieferscheine", href: "/lieferscheine", roles: ["owner", "admin"] },
      { icon: "phone", label: "Techniker", href: "/techniker", roles: ["owner", "admin"] },
      { icon: "wrench", label: "Meine Aufträge", href: "/techniker", roles: ["worker"] },
      { icon: "calendar", label: "Plantafel", href: "/plantafel", roles: ["owner", "admin"] },
      { icon: "refresh", label: "Wiederkehrend", href: "/wiederkehrend", roles: ["owner", "admin"] },
      { icon: "hash", label: "Fehlercodes", href: "/fehlercodes", roles: ["owner", "admin"] },
      { icon: "plug", label: "Geräte", href: "/geraete", roles: ["owner", "admin"] },
      { icon: "copy", label: "Vorlagen", href: "/vorlagen", roles: ["owner", "admin"] },
      { icon: "package", label: "Material & Lager", href: "/material", roles: ["owner", "admin"] },
      { icon: "cart", label: "Bestellungen", href: "/bestellungen", roles: ["owner", "admin"] },
    ],
  },
  {
    type: "group",
    label: "Finanzen",
    items: [
      { icon: "euro", label: "Rechnungen", href: "/rechnungen", roles: ["owner", "admin"] },
      { icon: "coins", label: "Zahlungen", href: "/zahlungen", roles: ["owner", "admin"] },
      { icon: "alert", label: "Mahnungen", href: "/mahnungen", roles: ["owner", "admin"] },
      { icon: "chart", label: "Nachkalkulation", href: "/nachkalkulation", roles: ["owner", "admin"] },
      { icon: "mail", label: "Versand", href: "/versand", roles: ["owner", "admin"] },
    ],
  },
  {
    type: "group",
    label: "Einstellungen",
    items: [
      { icon: "contrast", label: "Darstellung", href: "/darstellung", roles: ["owner", "admin", "worker"] },
      { icon: "user", label: "Mitarbeiter", href: "/mitarbeiter", roles: ["owner", "admin"] },
      { icon: "shield", label: "Team & Zugänge", href: "/team", roles: ["owner", "admin"] },
      { icon: "settings", label: "Firmendaten", href: "/firmendaten", roles: ["owner"] },
      { icon: "user", label: "Mein Profil", href: "/profil", roles: ["owner", "admin", "worker"] },
      { icon: "help", label: "Hilfe", href: "/hilfe", roles: ["owner", "admin", "worker"] },
    ],
  },
];

function NavGlyph({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "sun":
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case "people":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "hash":
      return <svg {...common}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></svg>;
    case "plug":
      return <svg {...common}><path d="M9 7v4M15 7v4M8 11h8v2a4 4 0 0 1-8 0v-2zM12 17v4" /></svg>;
    case "wrench":
      return <svg {...common}><path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a4.5 4.5 0 0 0 6.4-6.4L15 12l-3-3 2.7-2.7z" /></svg>;
    case "phone":
      return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3 5 6v6c0 5 3.2 7.6 7 9 3.8-1.4 7-4 7-9V6l-7-3z" /></svg>;
    case "target":
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></svg>;
    case "file":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>;
    case "euro":
      return <svg {...common}><path d="M17 6.5A6 6 0 0 0 8 8.2V16a6 6 0 0 0 9 1.5M6 10h8M6 14h8" /></svg>;
    case "coins":
      return <svg {...common}><ellipse cx="9" cy="8" rx="6" ry="3" /><path d="M3 8v4c0 1.7 2.7 3 6 3s6-1.3 6-3V8" /><path d="M15 11.2c1.8.5 3 1.4 3 2.3 0 1.7-2.7 3-6 3-1.2 0-2.3-.2-3.2-.4" /><path d="M9 15v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" /></svg>;
    case "copy":
      return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>;
    case "alert":
      return <svg {...common}><path d="M12 3 2 20h20L12 3z" /><path d="M12 9v5M12 17h.01" /></svg>;
    case "mail":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case "factory":
      return <svg {...common}><path d="M3 21V10l6 4V10l6 4V8l6 4v9H3z" /><path d="M7 21v-3M12 21v-3M17 21v-3" /></svg>;
    case "cart":
      return <svg {...common}><circle cx="8" cy="20" r="1" /><circle cx="17" cy="20" r="1" /><path d="M3 4h2l2.2 11h11.3l2-7H7" /></svg>;
    case "box":
      return <svg {...common}><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></svg>;
    case "package":
      return <svg {...common}><path d="M16.5 9.4 7.5 4.2" /><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5M12 22V12" /></svg>;
    case "chart":
      return <svg {...common}><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 3 5-6" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case "contrast":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></svg>;
    case "help":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.8-1.2 1.6V14" /><path d="M12 17h.01" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
  }
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavEntry({ item, pathname, nested }: { item: NavLink; pathname: string; nested?: boolean }) {
  const active = isActive(pathname, item.href);
  return (
    <Link href={item.to ?? item.href} aria-label={item.label} title={item.label} className={`navItem${nested ? " navChild" : ""} ${active ? "active" : ""}`}>
      <span className="navIcon"><NavGlyph name={item.icon} /></span>
      <span className="navText">{item.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { company, role } = useCompany();
  const email = user?.email ?? "Benutzer";
  const initials = email.slice(0, 2).toUpperCase();
  const allowed = (item: NavLink) => Boolean(role && item.roles.includes(role));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const roleLabel = role === "owner" ? "Chef / Inhaber" : role === "admin" ? "Büro / Admin" : "Mitarbeiter";

  return (
    <aside className="sidebar">
      <div className="brandRow">
        <Link href="/" className="brand">WORK<span>LEVEL</span></Link>
      </div>
      <div className="companyMini">
        <span className="companyAvatar" aria-label="WorkLevel" title="WorkLevel">
          <img src="/worklevel-mark.svg" alt="" />
        </span>
        <span className="companyMeta">
          <strong>{company?.name ?? "Firma"}</strong>
          <span>{roleLabel}</span>
        </span>
      </div>
      <nav className="navList">
        {navigation.map((block) => {
          if (block.type === "item") {
            if (!allowed(block.item)) return null;
            return <NavEntry key={`${block.item.href}-${block.item.label}`} item={block.item} pathname={pathname} />;
          }
          const items = block.items.filter(allowed);
          if (items.length === 0) return null;
          const isCollapsed = Boolean(collapsed[block.label]);
          return (
            <div className={`navGroup${isCollapsed ? " isCollapsed" : ""}`} key={block.label}>
              <button
                type="button"
                className="navGroupLabel navGroupToggle"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((current) => ({ ...current, [block.label]: !current[block.label] }))}
              >
                <span>{block.label}</span>
                <svg className="navGroupChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div className="navGroupItems">
                {items.map((item) => (
                  <NavEntry key={`${item.href}-${item.label}`} item={item} pathname={pathname} nested />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="sidebarFoot sidebarFootStack">
        <div className="sidebarAccount">
          <div className="avatar">{initials}</div>
          <div className="sidebarUser"><strong>{email}</strong><span>{roleLabel}</span></div>
        </div>
        <div className="sidebarFootActions">
          <button className="logoutBtn" onClick={() => signOut()} title="Abmelden">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /><path d="M15 16l4-4-4-4M19 12H9" /></svg>
            Abmelden
          </button>
        </div>
      </div>
    </aside>
  );
}
