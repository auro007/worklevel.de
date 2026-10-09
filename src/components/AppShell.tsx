"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import PhonePreviewToggle from "./PhonePreviewToggle";
import PhoneTabBar from "./PhoneTabBar";
import GlobalSearch from "./GlobalSearch";
import { useAuth } from "@/context/AuthProvider";
import { useCompany } from "@/context/CompanyProvider";

const workerAllowed = ["/", "/techniker", "/profil", "/darstellung"];
const adminBlocked = ["/firmendaten"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, recovery } = useAuth();
  const { company, role, loading: companyLoading } = useCompany();
  const pathname = usePathname();
  const router = useRouter();
  const isPasswordReset = pathname === "/login/neues-passwort";
  const isLogin = pathname === "/login" || isPasswordReset;
  const isOnboarding = pathname === "/onboarding";
  const isPublicOffer = pathname.startsWith("/angebot/");
  const showSearch = role === "owner" || role === "admin";
  const routeRestoreChecked = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!routeRestoreChecked.current) {
      routeRestoreChecked.current = true;
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const saved = sessionStorage.getItem("worklevel:last-route");
      const recovering = window.location.hash.includes("type=recovery") || sessionStorage.getItem("worklevel:recovery") === "1";
      if (!recovering && nav?.type === "reload" && pathname === "/" && saved && saved !== "/" && !saved.startsWith("/login") && !saved.startsWith("/angebot/")) {
        router.replace(saved);
        return;
      }
    }
    sessionStorage.setItem("worklevel:last-route", pathname);
  }, [pathname, router]);

  useEffect(() => {
    if (isPublicOffer) return;
    if (authLoading) return;
    // Wait for both auth and company hydration before redirect decisions.
    if (recovery && !isPasswordReset) { router.replace("/login/neues-passwort"); return; }
    if (!user && !isLogin) { router.replace("/login"); return; }
    if (user && pathname === "/login") { router.replace("/"); return; }
    if (!user || companyLoading) return;
    // Only enter onboarding when the company lookup has completed and no membership exists.
    if (!company && !isOnboarding) { router.replace("/onboarding"); return; }
    if (company && isOnboarding) { router.replace("/"); return; }

    if (company && role === "worker") {
      const allowed = workerAllowed.some((route) => route === "/" ? pathname === "/" : pathname.startsWith(route));
      if (!allowed) { router.replace("/techniker"); return; }
    }
    if (company && role === "admin" && adminBlocked.some((route) => pathname.startsWith(route))) {
      router.replace("/");
    }
  }, [user, authLoading, recovery, company, role, companyLoading, isLogin, isPasswordReset, isOnboarding, isPublicOffer, pathname, router]);

  if (isPublicOffer) {
    return <>{children}</>;
  }

  if (authLoading || (user && companyLoading)) {
    return <div className="authLoading"><div className="authSpinner" /><span>WORKLEVEL wird geladen...</span></div>;
  }
  if (isPasswordReset) return <>{children}</>;
  if (!user) return isLogin ? <>{children}</> : <div className="authLoading">Weiterleitung...</div>;
  if (pathname === "/login") return <div className="authLoading">Weiterleitung...</div>;
  if (!company) return isOnboarding ? <>{children}</> : <div className="authLoading">Firma wird vorbereitet...</div>;
  if (isOnboarding) return <div className="authLoading">Weiterleitung...</div>;

  return (
    <div className="appShell">
      <Sidebar />
      <div className="mainArea">
        {showSearch && (
          <header className="topBar">
            <GlobalSearch />
            <div className="topBarActions">
              <PhonePreviewToggle />
              <Link className="topIconBtn" href="/mahnungen" aria-label="Mahnungen" title="Mahnungen">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" /><path d="M9 17a3 3 0 0 0 6 0" /></svg>
              </Link>
              <Link className="topAvatar" href="/profil" aria-label="Mein Profil" title="Mein Profil">{(user.email ?? "W").slice(0, 1).toUpperCase()}</Link>
            </div>
          </header>
        )}
        {children}
      </div>
      <PhoneTabBar />
    </div>
  );
}
