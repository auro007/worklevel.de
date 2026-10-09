"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  recovery: boolean;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    if (window.location.hash.includes("type=recovery") || sessionStorage.getItem("worklevel:recovery") === "1") {
      sessionStorage.setItem("worklevel:recovery", "1");
      setRecovery(true);
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setLoading(false);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("worklevel:recovery", "1");
        setRecovery(true);
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    recovery,
    clearRecovery: () => {
      sessionStorage.removeItem("worklevel:recovery");
      setRecovery(false);
    },
    signOut: async () => {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) { window.alert("Abmelden fehlgeschlagen. Bitte erneut versuchen."); return; }
      }
      setSession(null);
      window.location.replace("/login");
    },
  }), [session, loading, recovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
