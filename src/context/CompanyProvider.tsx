"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/context/AuthProvider";

export type CompanyRole = "owner" | "admin" | "worker";
export type Company = {
  id: string;
  name: string;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  owner_name?: string | null;
  tax_number?: string | null;
  vat_id?: string | null;
  hourly_rate?: number | null;
  iban?: string | null;
  bic?: string | null;
  bank_name?: string | null;
  default_vat_rate?: number | null;
  taxation_mode?: "standard" | "small_business" | null;
  payment_terms_days?: number | null;
  invoice_prefix?: string | null;
  offer_prefix?: string | null;
  delivery_prefix?: string | null;
  document_footer?: string | null;
  logo_url?: string | null;
};

type CompanyContextValue = {
  company: Company | null;
  role: CompanyRole | null;
  loading: boolean;
  error: string;
  refreshCompany: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [role, setRole] = useState<CompanyRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refreshCompany() {
    const supabase = getSupabaseClient();
    if (!supabase || !user) {
      setCompany(null);
      setRole(null);
      setLoading(true);
      return;
    }
    setLoading(true); setError("");
    const { data, error: e } = await supabase
      .from("company_members")
      .select("company_id, role, companies(id,name,street,postal_code,city,phone,email,owner_name,tax_number,vat_id,hourly_rate,iban,bic,bank_name,default_vat_rate,taxation_mode,payment_terms_days,invoice_prefix,offer_prefix,delivery_prefix,document_footer,logo_url)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (e) {
      setError(e.message);
      setCompany(null);
      setRole(null);
      setLoadedFor(user.id);
      setLoading(false);
      return;
    }

    if (!data) {
      setCompany(null);
      setRole(null);
      setLoadedFor(user.id);
      setLoading(false);
      return;
    }

    const joined = Array.isArray((data as any).companies) ? (data as any).companies[0] : (data as any).companies;
    setCompany(joined ?? null);
    setRole((data as any).role as CompanyRole);
    setLoadedFor(user.id);
    setLoading(false);
  }

  useEffect(() => { refreshCompany(); }, [user?.id]);

  const effectiveLoading = loading || authLoading || (!!user && loadedFor !== user.id);
  const value = useMemo(() => ({ company, role, loading: effectiveLoading, error, refreshCompany }), [company, role, effectiveLoading, error]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const value = useContext(CompanyContext);
  if (!value) throw new Error("useCompany must be used inside CompanyProvider");
  return value;
}
