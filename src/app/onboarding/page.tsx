"use client";

import { FormEvent, useState } from "react";
import { useCompany } from "@/context/CompanyProvider";
import { useAuth } from "@/context/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase";

export default function OnboardingPage(){
  const {user}=useAuth(); const {refreshCompany}=useCompany();
  const [mode,setMode]=useState<"create"|"join">("create"); const [name,setName]=useState(""); const [code,setCode]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");
  async function submit(e:FormEvent){e.preventDefault();const s=getSupabaseClient();if(!s||!user)return;setBusy(true);setError("");setMessage("");
    if(mode==="create"){
      const {error:e1}=await s.rpc("create_worklevel_company",{p_name:name.trim()}); if(e1)setError(e1.message); else {setMessage("Firma erstellt. WORKLEVEL wird geöffnet..."); await refreshCompany();}
    }else{
      const {error:e1}=await s.rpc("accept_company_invite",{p_code:code.trim().toUpperCase()}); if(e1)setError(e1.message); else {setMessage("Einladung angenommen. WORKLEVEL wird geöffnet..."); await refreshCompany();}
    }
    setBusy(false);
  }
  return <main className="loginPage"><section className="loginCard onboardingCard"><div className="loginBrand">WORK<span>LEVEL</span></div><h1>{mode==="create"?"Firma einrichten":"Firma beitreten"}</h1><p className="loginSub">Jede Firma hat ihren eigenen geschützten Bereich. Chef, Büro und Mitarbeiter verwenden eigene Logins.</p>
    <div className="onboardingTabs"><button className={mode==="create"?"active":""} onClick={()=>setMode("create")}>Neue Firma</button><button className={mode==="join"?"active":""} onClick={()=>setMode("join")}>Einladungscode</button></div>
    <form className="loginForm" onSubmit={submit}>{mode==="create"?<label>Firmenname<input className="input" required value={name} onChange={e=>setName(e.target.value)} placeholder="z.B. Muster Haustechnik GmbH" /></label>:<label>Einladungscode<input className="input inviteCodeInput" required value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="z.B. WL-A1B2C3D4" /></label>}
      {error&&<div className="loginError">{error}</div>}{message&&<div className="loginMessage">{message}</div>}<button className="primaryBtn loginSubmit" disabled={busy}>{busy?"Bitte warten...":mode==="create"?"Firma erstellen":"Firma beitreten"}</button>
    </form><p className="onboardingEmail">Angemeldet als <strong>{user?.email}</strong></p></section></main>;
}
