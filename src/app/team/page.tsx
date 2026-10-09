"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader, Badge } from "@/components/UI";
import { useCompany, type CompanyRole } from "@/context/CompanyProvider";
import { useAuth } from "@/context/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase";

type Member={user_id:string;role:CompanyRole;status:string;email:string|null};
type Invite={id:string;email:string;role:CompanyRole;code:string;expires_at:string;accepted_at:string|null};

export default function TeamPage(){
 const {company,role}=useCompany();
 const {user}=useAuth();
 const [members,setMembers]=useState<Member[]>([]);
 const [invites,setInvites]=useState<Invite[]>([]);
 const [email,setEmail]=useState("");
 const [inviteRole,setInviteRole]=useState<CompanyRole>("worker");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 function roleLabel(value:CompanyRole){return value==="owner"?"Chef / Inhaber":value==="admin"?"Büro / Admin":"Mitarbeiter / Techniker";}
 function statusLabel(value:string){return value==="active"?"Aktiv":value==="disabled"?"Deaktiviert":value;}

 async function load(){
   const s=getSupabaseClient(); if(!s||!company)return;
   const [m,i]=await Promise.all([
     s.rpc("get_company_members",{p_company:company.id}),
     s.from("company_invites").select("*").eq("company_id",company.id).order("created_at",{ascending:false})
   ]);
   if(m.error||i.error){setError((m.error||i.error)?.message??"");return;}
   setMembers((m.data??[]) as Member[]); setInvites((i.data??[]) as Invite[]);
 }
 useEffect(()=>{load();},[company?.id]);

 async function deliverInvite(address:string, code:string, invitedRole:CompanyRole){
   const s=getSupabaseClient(); if(!s||!company) return "Supabase ist nicht verfügbar.";
   const {data:sessionData}=await s.auth.getSession();
   const token=sessionData.session?.access_token;
   const subject=`Einladung zu ${company.name} bei WORKLEVEL`;
   const text=`Guten Tag,\n\nSie sind eingeladen, bei ${company.name} in WORKLEVEL mitzuarbeiten.\nRolle: ${roleLabel(invitedRole)}\nEinladungscode: ${code}\n\nErstellen Sie einen eigenen WORKLEVEL-Login und geben Sie den Code beim Beitritt ein.\n\nMit freundlichen Grüßen\n${company.name}`;
   if(!token) return "Sitzung fehlt. Der Code wurde kopiert, eine E-Mail wurde nicht gesendet.";
   const res=await fetch("/api/send-invite",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({companyId:company.id,to:address,subject,text})});
   const result=await res.json().catch(()=>({}));
   if(!res.ok) return String(result?.error||"Die E-Mail wurde nicht gesendet.");
   const logged=await s.from("company_messages").insert({company_id:company.id,kind:"invite",to_email:address,subject,body:text,provider:result.provider||null,provider_id:result.id||null});
   if(logged.error) return `Die E-Mail an ${address} wurde gesendet. Das Versandprotokoll konnte den Eintrag nicht speichern.`;
   return "";
 }
 async function createInvite(e:FormEvent){
   e.preventDefault(); const s=getSupabaseClient(); if(!s||!company||!user)return;
   setBusy(true); setError(""); setNotice("");
   const address=email.trim().toLowerCase();
   const {data:code,error:e1}=await s.rpc("create_company_invite",{p_company:company.id,p_email:address,p_role:inviteRole});
   if(e1)setError(e1.message);
   else {
     setEmail("");
     await load();
     if(code)try{await navigator.clipboard.writeText(String(code));}catch{}
     const mailError=code?await deliverInvite(address,String(code),inviteRole):"Kein Code erhalten.";
     setNotice(mailError?`Einladungscode für ${address} erstellt und kopiert. ${mailError}`:`Einladung an ${address} gesendet. Der Code wurde kopiert und steht im Versandprotokoll.`);
   }
   setBusy(false);
 }
 async function copy(code:string){await navigator.clipboard.writeText(code);setNotice("Einladungscode kopiert.");}
 async function revokeInvite(invite:Invite){
   if(!confirm(`Einladung an ${invite.email} widerrufen? Der Code gilt danach nicht mehr.`))return;
   const s=getSupabaseClient(); if(!s||!company)return;
   setBusy(true); setError(""); setNotice("");
   const {error:e}=await s.from("company_invites").delete().eq("id",invite.id).eq("company_id",company.id);
   if(e)setError(e.message); else {setNotice(`Einladung an ${invite.email} widerrufen.`);await load();}
   setBusy(false);
 }
 async function resendInvite(invite:Invite){
   const s=getSupabaseClient(); if(!s||!company)return;
   setBusy(true); setError(""); setNotice("");
   const {data:code,error:e}=await s.rpc("create_company_invite",{p_company:company.id,p_email:invite.email,p_role:invite.role});
   if(e)setError(e.message);
   else {
     if(code)try{await navigator.clipboard.writeText(String(code));}catch{}
     const mailError=code?await deliverInvite(invite.email,String(code),invite.role):"Kein Code erhalten.";
     setNotice(mailError?`Neuer Code für ${invite.email} erstellt und kopiert. ${mailError}`:`Neue Einladung an ${invite.email} gesendet. Der Code wurde kopiert.`);
     await load();
   }
   setBusy(false);
 }
 async function updateMember(member:Member, nextRole:CompanyRole, nextStatus:string){
   if(role!=="owner"||!company)return;
   const s=getSupabaseClient(); if(!s)return;
   setBusy(true); setError("");
   const {error:e}=await s.rpc("owner_update_company_member",{p_company:company.id,p_user:member.user_id,p_role:nextRole,p_status:nextStatus});
   if(e)setError(e.message); else await load();
   setBusy(false);
 }

 if(role==="worker")return <main className="page"><PageHeader title="Team" subtitle="Kein Zugriff"/><div className="notice">Diese Seite ist nur für Chef und Büro/Admin verfügbar.</div></main>;

 return <main className="page">
   <PageHeader title="Team & Zugänge" subtitle={`${company?.name??"Firma"} · Jeder Mitarbeiter bekommt einen eigenen Login`} />
   {error&&<div className="loginError pageError">{error}</div>}
   {notice&&<div className="sendSuccess">{notice}</div>}
   <section className="teamGrid">
     <div className="techCard">
       <div className="techCardHead"><h3>Neue Einladung</h3><span>Admin oder Mitarbeiter hinzufügen</span></div>
       <form onSubmit={createInvite} className="teamInviteForm">
         <label>E-Mail<input required type="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="mitarbeiter@firma.de"/></label>
         <label>Rolle<select className="select" value={inviteRole} onChange={e=>setInviteRole(e.target.value as CompanyRole)}><option value="worker">Mitarbeiter / Techniker</option><option value="admin">Büro / Admin</option>{role==="owner"&&<option value="owner">Chef / Inhaber</option>}</select></label>
         <button className="primaryBtn" disabled={busy}>{busy?"Erstellt...":"Einladung erstellen"}</button>
       </form>
       <p className="techMuted">Der eingeladene Benutzer erstellt einen eigenen WORKLEVEL-Login und tritt mit dem Einladungscode der Firma bei.</p>
     </div>
     <div className="techCard">
       <div className="techCardHead"><h3>Firmenmitglieder</h3><span>{members.length} Konten</span></div>
       <div className="techList">
         {members.map(m=><div className="memberManageRow" key={m.user_id}>
           <div className="memberIdentity"><strong>{m.email??m.user_id}</strong><span>{m.user_id===user?.id?"Ihr Konto":statusLabel(m.status)}</span></div>
           {role==="owner" && m.user_id!==user?.id ? <>
             <select className="select memberRoleSelect" value={m.role} disabled={busy} onChange={e=>updateMember(m,e.target.value as CompanyRole,m.status)}><option value="owner">Chef</option><option value="admin">Admin</option><option value="worker">Mitarbeiter</option></select>
             <button className="ghostBtn" disabled={busy} onClick={()=>updateMember(m,m.role,m.status==="active"?"disabled":"active")}>{m.status==="active"?"Deaktivieren":"Aktivieren"}</button>
           </> : <Badge tone={m.role==="owner"?"orange":m.role==="admin"?"blue":"gray"}>{roleLabel(m.role)}{m.user_id===user?.id?" · gesperrt":""}</Badge>}
         </div>)}
       </div>
     </div>
   </section>
   <section className="techCard" style={{marginTop:14}}>
     <div className="techCardHead"><h3>Einladungen</h3><span>{invites.filter(i=>!i.accepted_at&&new Date(i.expires_at).getTime()>Date.now()).length} offen</span></div>
     <div className="techList">{invites.length===0?<p className="techMuted">Noch keine Einladungen.</p>:invites.map(i=>{const expired=!i.accepted_at&&new Date(i.expires_at).getTime()<=Date.now();const openInvite=!i.accepted_at&&!expired;return <div className="techListRow" key={i.id}><div><strong>{i.email}</strong><span>{roleLabel(i.role)} · {i.accepted_at?"angenommen":expired?"abgelaufen am":"gültig bis"} {new Date(i.accepted_at||i.expires_at).toLocaleDateString("de-DE")}</span></div><div className="formActions">{i.accepted_at?<Badge tone="green">Angenommen</Badge>:expired?<Badge tone="yellow">Abgelaufen</Badge>:<Badge tone="blue">Offen</Badge>}{openInvite&&<button className="ghostBtn" disabled={busy} onClick={()=>copy(i.code)}>Code kopieren</button>}{!i.accepted_at&&<button className="ghostBtn" disabled={busy} onClick={()=>void resendInvite(i)}>Erneut erstellen</button>}{openInvite&&<button className="ghostBtn" disabled={busy} onClick={()=>void revokeInvite(i)}>Widerrufen</button>}</div></div>;})}</div>
   </section>
 </main>;
}
