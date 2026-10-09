"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { emptyAppData } from "@/lib/demo";
import { formatCloudError } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/context/AuthProvider";
import { useCompany } from "@/context/CompanyProvider";
import type { AppData, CompanySettings, Customer, CustomerSite, Employee, Invoice, Job, Lead, MaterialItem, RecurringJobTemplate } from "@/lib/types";

type AppDataContextValue = AppData & {
  hydrated:boolean; cloudLoading:boolean; cloudError:string; reloadCloud:()=>Promise<void>;
  addCustomer:(item:Omit<Customer,"id">)=>Promise<string|false>; updateCustomer:(id:string,patch:Partial<Customer>)=>Promise<boolean>; removeCustomer:(id:string)=>Promise<boolean>;
  addCustomerSite:(item:Omit<CustomerSite,"id">)=>Promise<boolean>;
  updateCustomerSite:(id:string,patch:Partial<CustomerSite>)=>Promise<boolean>;
  removeCustomerSite:(id:string)=>Promise<boolean>;
  addJob:(item:Omit<Job,"id">)=>Promise<boolean>; updateJob:(id:string,patch:Partial<Job>)=>Promise<boolean>; removeJob:(id:string)=>Promise<boolean>;
  addEmployee:(item:Omit<Employee,"id">)=>Promise<boolean>; updateEmployee:(id:string,patch:Partial<Employee>)=>Promise<boolean>; removeEmployee:(id:string)=>Promise<boolean>;
  addLead:(item:Omit<Lead,"id">)=>Promise<boolean>; updateLead:(id:string,patch:Partial<Lead>)=>Promise<boolean>; removeLead:(id:string)=>Promise<boolean>;
  addRecurringTemplate:(item:Omit<RecurringJobTemplate,"id">)=>Promise<boolean>;
  updateRecurringTemplate:(id:string,patch:Partial<RecurringJobTemplate>)=>Promise<boolean>;
  removeRecurringTemplate:(id:string)=>Promise<boolean>;
  generateDueRecurringJobs:()=>Promise<{ok:boolean;jobsCreated:number;templatesProcessed:number;message?:string}>;
  addInvoice:(item:Invoice)=>void; addMaterial:(item:MaterialItem)=>void; updateSettings:(settings:CompanySettings)=>void; resetDemo:()=>void;
};
const Ctx=createContext<AppDataContextValue|null>(null);
const emptyCloud={customers:[] as Customer[],customerSites:[] as CustomerSite[],employees:[] as Employee[],jobs:[] as Job[],recurringTemplates:[] as RecurringJobTemplate[],leads:[] as Lead[]};


function mapRecurring(row:any):RecurringJobTemplate{
  return {
    id:String(row.id),
    customerId:String(row.customer_id),
    title:row.title??"",
    description:row.description??"",
    cadence:(row.cadence??"monthly") as RecurringJobTemplate["cadence"],
    intervalDays:row.interval_days!=null?Number(row.interval_days):null,
    nextRunDate:row.next_run_date,
    active:row.active!==false,
    defaultAssignee:row.default_assignee??"",
    defaultTime:String(row.default_time??"08:00").slice(0,5),
    defaultPriority:(row.default_priority??"Normal") as RecurringJobTemplate["defaultPriority"],
    estimatedHours:Number(row.estimated_hours??2),
    defaultXp:Number(row.default_xp??15),
    defaultPrice:Number(row.default_price??0),
    notes:row.notes??"",
  };
}

function recurringDbPatch(patch:Partial<RecurringJobTemplate>):Record<string,unknown>{
  const db:Record<string,unknown>={};
  if(patch.customerId!==undefined)db.customer_id=Number(patch.customerId);
  if(patch.title!==undefined)db.title=patch.title;
  if(patch.description!==undefined)db.description=patch.description||null;
  if(patch.cadence!==undefined)db.cadence=patch.cadence;
  if(patch.intervalDays!==undefined)db.interval_days=patch.intervalDays!=null&&Number(patch.intervalDays)>0?Number(patch.intervalDays):null;
  if(patch.nextRunDate!==undefined)db.next_run_date=patch.nextRunDate;
  if(patch.active!==undefined)db.active=patch.active;
  if(patch.defaultAssignee!==undefined)db.default_assignee=patch.defaultAssignee||null;
  if(patch.defaultTime!==undefined)db.default_time=patch.defaultTime||"08:00";
  if(patch.defaultPriority!==undefined)db.default_priority=patch.defaultPriority;
  if(patch.estimatedHours!==undefined)db.estimated_hours=patch.estimatedHours;
  if(patch.defaultXp!==undefined)db.default_xp=Math.max(0,Number(patch.defaultXp)||0);
  if(patch.defaultPrice!==undefined)db.default_price=Math.max(0,Number(patch.defaultPrice)||0);
  if(patch.notes!==undefined)db.notes=patch.notes||null;
  return db;
}

function mapLead(row:any):Lead{
  return {
    id:String(row.id),
    name:row.name??"",
    company:row.company_name??"",
    phone:row.phone??"",
    email:row.email??"",
    street:row.street??"",
    postalCode:row.postal_code??"",
    city:row.city??"",
    source:row.source??"",
    status:(row.status??"Neu") as Lead["status"],
    value:Number(row.estimated_value??0),
    notes:row.notes??"",
    convertedCustomerId:row.converted_customer_id!=null?String(row.converted_customer_id):undefined,
  };
}

function leadDbPatch(patch:Partial<Lead>):Record<string,unknown>{
  const db:Record<string,unknown>={};
  if(patch.name!==undefined)db.name=patch.name;
  if(patch.company!==undefined)db.company_name=patch.company||null;
  if(patch.phone!==undefined)db.phone=patch.phone||null;
  if(patch.email!==undefined)db.email=patch.email||null;
  if(patch.street!==undefined)db.street=patch.street||null;
  if(patch.postalCode!==undefined)db.postal_code=patch.postalCode||null;
  if(patch.city!==undefined)db.city=patch.city||null;
  if(patch.source!==undefined)db.source=patch.source||null;
  if(patch.status!==undefined)db.status=patch.status;
  if(patch.value!==undefined)db.estimated_value=patch.value;
  if(patch.notes!==undefined)db.notes=patch.notes||null;
  if(patch.convertedCustomerId!==undefined)db.converted_customer_id=patch.convertedCustomerId?Number(patch.convertedCustomerId):null;
  return db;
}


function mapCustomerSite(row:any):CustomerSite{
  return {
    id:String(row.id),
    customerId:String(row.customer_id),
    name:row.name??"",
    street:row.street??"",
    postalCode:row.postal_code??"",
    city:row.city??"",
    tenantName:row.tenant_name??"",
    tenantPhone:row.tenant_phone??"",
    tenantEmail:row.tenant_email??"",
    notes:row.notes??"",
    active:row.active!==false,
  };
}

function siteDbPatch(patch:Partial<CustomerSite>):Record<string,unknown>{
  const db:Record<string,unknown>={};
  if(patch.customerId!==undefined)db.customer_id=Number(patch.customerId);
  if(patch.name!==undefined)db.name=patch.name;
  if(patch.street!==undefined)db.street=patch.street||null;
  if(patch.postalCode!==undefined)db.postal_code=patch.postalCode||null;
  if(patch.city!==undefined)db.city=patch.city||null;
  if(patch.tenantName!==undefined)db.tenant_name=patch.tenantName||null;
  if(patch.tenantPhone!==undefined)db.tenant_phone=patch.tenantPhone||null;
  if(patch.tenantEmail!==undefined)db.tenant_email=patch.tenantEmail||null;
  if(patch.notes!==undefined)db.notes=patch.notes||null;
  if(patch.active!==undefined)db.active=patch.active;
  return db;
}

export function AppDataProvider({children}:{children:React.ReactNode}){
  const {user}=useAuth(); const {company,role}=useCompany();
  const [local,setLocal]=useState(()=>({...emptyAppData,...emptyCloud})); const [hydrated,setHydrated]=useState(false); const [cloudLoading,setCloudLoading]=useState(false); const [cloudError,setCloudError]=useState("");
  useEffect(()=>{
    if(!company){setHydrated(true);return;}
    const key=`worklevel-v6-local-data-${company.id}`;
    try{
      const saved=localStorage.getItem(key);
      // Leads are cloud-backed from V12.5 — do not restore local leads
      if(saved){const p=JSON.parse(saved);setLocal(c=>({...c,leads:[],invoices:[],orders:[],deliveryNotes:[],materials:[],settings:p.settings??c.settings}));}
    }catch{}
    setHydrated(true);
  },[company?.id]);
  useEffect(()=>{
    if(!hydrated||!company)return;
    const {customers:_c,customerSites:_cs,employees:_e,jobs:_j,recurringTemplates:_rt,leads:_l,invoices:_i,orders:_o,deliveryNotes:_d,materials:_m,...persistable}=local;
    localStorage.setItem(`worklevel-v6-local-data-${company.id}`,JSON.stringify({...persistable,leads:[],invoices:[],orders:[],deliveryNotes:[],materials:[]}));
  },[local,hydrated,company?.id]);

  async function reloadCloud(){
    const supabase=getSupabaseClient(); if(!supabase||!user||!company){setLocal(d=>({...d,...emptyCloud}));return;}
    setCloudLoading(true); setCloudError("");
    const [cr,er,jr,lr,rr,sr]=await Promise.all([
      supabase.from("customers").select("*").eq("company_id",company.id).order("created_at",{ascending:false}),
      supabase.from("employees").select("*").eq("company_id",company.id).order("created_at",{ascending:false}),
      supabase.from("jobs").select("*").eq("company_id",company.id).order("job_date",{ascending:true}).order("job_time",{ascending:true}),
      supabase.from("leads").select("*").eq("company_id",company.id).order("created_at",{ascending:false}),
      supabase.from("recurring_job_templates").select("*").eq("company_id",company.id).order("next_run_date",{ascending:true}),
      supabase.from("customer_sites").select("*").eq("company_id",company.id).order("name",{ascending:true}),
    ]);
    const error=cr.error||er.error||jr.error; if(error){setCloudError(formatCloudError(error.message));setCloudLoading(false);return;}
    // Leads / recurring / sites are additive — surface SQL hint without blocking core data
    const soft=lr.error||rr.error||sr.error; if(soft){setCloudError(formatCloudError(soft.message));}
    const customers:Customer[]=(cr.data??[]).map((c:any)=>({id:String(c.id),number:c.customer_number??"",name:c.company_name,contact:c.contact_name??"",street:c.street??"",postalCode:c.postal_code??"",city:c.city??"",phone:c.phone??"",email:c.email??"",notes:c.notes??"",archived:c.archived===true}));
    const employees:Employee[]=(er.data??[]).map((e:any)=>({id:e.id,name:e.name,role:e.role??"Techniker",phone:e.phone??"",email:e.email??"",status:e.status??"Verfügbar",active:e.active??true,xp:Number(e.xp??0),authUserId:e.auth_user_id??undefined,hourlyRate:e.hourly_rate!=null?Number(e.hourly_rate):null,vacationDaysTotal:Number(e.vacation_days_total??30),sickDaysYear:Number(e.sick_days_year??0)}));
    const jobs:Job[]=(jr.data??[]).map((j:any)=>({id:j.id,number:j.job_number??"",title:j.title,customerId:String(j.customer_id),customerSiteId:j.customer_site_id?String(j.customer_site_id):undefined,errorCodeId:j.error_code_id?String(j.error_code_id):undefined,siteDeviceId:j.site_device_id?String(j.site_device_id):undefined,employeeId:j.employee_id??"",date:j.job_date,time:String(j.job_time??"08:00").slice(0,5),status:j.status??"Geplant",priority:j.priority??"Normal",address:j.address??"",description:j.description??"",estimatedHours:Number(j.estimated_hours??0),materialCost:Number(j.material_cost??0),checklist:Array.isArray(j.checklist)?j.checklist.map((c:any)=>({id:String(c.id??""),label:String(c.label??""),done:!!c.done})).filter((c:any)=>c.id&&c.label):[],xpReward:j.xp_reward!=null?Number(j.xp_reward):null,suggestedPrice:j.suggested_price!=null?Number(j.suggested_price):null}));
    const leads:Lead[]=lr.error?[]:(lr.data??[]).map(mapLead);
    const recurringTemplates:RecurringJobTemplate[]=rr.error?[]:(rr.data??[]).map(mapRecurring);
    const customerSites:CustomerSite[]=sr.error?[]:(sr.data??[]).map(mapCustomerSite);
    setLocal(d=>({...d,customers,customerSites,employees,jobs,recurringTemplates,leads,invoices:[],orders:[],materials:[]})); setCloudLoading(false);
  }
  useEffect(()=>{reloadCloud();},[user?.id,company?.id,role]);

  async function addCustomer(item:Omit<Customer,"id">){
    const s=getSupabaseClient(); if(!s||!user||!company)return false; setCloudError("");
    const {data,error}=await s.from("customers").insert({owner_id:user.id,company_id:company.id,customer_number:item.number||null,company_name:item.name,contact_name:item.contact||null,street:item.street||null,postal_code:item.postalCode||null,city:item.city||null,phone:item.phone||null,email:item.email||null,notes:item.notes||null}).select("id").single();
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return String(data.id);
  }
  async function updateCustomer(id:string,patch:Partial<Customer>){const s=getSupabaseClient();if(!s||!company)return false;setCloudError("");const db:Record<string,unknown>={};if(patch.number!==undefined)db.customer_number=patch.number||null;if(patch.name!==undefined)db.company_name=patch.name;if(patch.contact!==undefined)db.contact_name=patch.contact||null;if(patch.street!==undefined)db.street=patch.street||null;if(patch.postalCode!==undefined)db.postal_code=patch.postalCode||null;if(patch.city!==undefined)db.city=patch.city||null;if(patch.phone!==undefined)db.phone=patch.phone||null;if(patch.email!==undefined)db.email=patch.email||null;if(patch.notes!==undefined)db.notes=patch.notes||null;if(patch.archived!==undefined)db.archived=patch.archived;const {error}=await s.from("customers").update(db).eq("id",id).eq("company_id",company.id);if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;}
  async function removeCustomer(id:string){const s=getSupabaseClient(); if(!s||!company)return false; const {error}=await s.from("customers").delete().eq("id",id).eq("company_id",company.id); if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud();return true;}
  async function addEmployee(item:Omit<Employee,"id">){const s=getSupabaseClient(); if(!s||!user||!company)return false; const {error}=await s.from("employees").insert({owner_id:user.id,company_id:company.id,name:item.name,role:item.role||null,phone:item.phone||null,email:item.email||null,status:item.status,active:item.active,xp:item.xp??0,hourly_rate:item.hourlyRate??null,vacation_days_total:item.vacationDaysTotal??30,sick_days_year:item.sickDaysYear??0}); if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud();return true;}
  async function updateEmployee(id:string,patch:Partial<Employee>){const s=getSupabaseClient();if(!s||!company)return false;const db:Record<string,unknown>={}; if(patch.name!==undefined)db.name=patch.name;if(patch.role!==undefined)db.role=patch.role;if(patch.phone!==undefined)db.phone=patch.phone;if(patch.email!==undefined)db.email=patch.email;if(patch.status!==undefined)db.status=patch.status;if(patch.active!==undefined)db.active=patch.active;if(patch.xp!==undefined)db.xp=patch.xp;if(patch.hourlyRate!==undefined)db.hourly_rate=patch.hourlyRate;if(patch.vacationDaysTotal!==undefined)db.vacation_days_total=patch.vacationDaysTotal;if(patch.sickDaysYear!==undefined)db.sick_days_year=patch.sickDaysYear;if(patch.authUserId!==undefined)db.auth_user_id=patch.authUserId||null;const {error}=await s.from("employees").update(db).eq("id",id).eq("company_id",company.id);if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;}
  async function removeEmployee(id:string){const s=getSupabaseClient();if(!s||!company)return false;const {error}=await s.from("employees").delete().eq("id",id).eq("company_id",company.id);if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;}
  async function addJob(item:Omit<Job,"id">){const s=getSupabaseClient();if(!s||!user||!company)return false;const {error}=await s.from("jobs").insert({owner_id:user.id,company_id:company.id,job_number:item.number,title:item.title,customer_id:Number(item.customerId),customer_site_id:item.customerSiteId||null,error_code_id:item.errorCodeId||null,site_device_id:item.siteDeviceId||null,employee_id:item.employeeId||null,job_date:item.date,job_time:item.time,status:item.status,priority:item.priority,address:item.address||null,description:item.description||null,estimated_hours:item.estimatedHours,material_cost:item.materialCost});if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;}
  async function updateJob(id:string,patch:Partial<Job>){
    const s=getSupabaseClient();if(!s||!company)return false;
    if(role==="worker"){
      const keys=Object.keys(patch);
      if(keys.length===1&&keys[0]==="status"&&patch.status){
        const {error}=await s.rpc("set_assigned_job_status",{p_job:id,p_status:patch.status});
        if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;
      }
      if(keys.length===1&&keys[0]==="checklist"&&Array.isArray(patch.checklist)){
        const {error}=await s.rpc("set_assigned_job_checklist",{p_job:id,p_checklist:patch.checklist});
        if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;
      }
      if(keys.length===1&&keys[0]==="errorCodeId"){
        const {error}=await s.rpc("set_assigned_job_error_code",{p_job:id,p_error_code:patch.errorCodeId||null});
        if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;
      }
      setCloudError("Mitarbeiter dürfen nur Status, Checkliste und Fehlercode ihres zugewiesenen Auftrags ändern.");
      return false;
    }
    const db:Record<string,unknown>={};const map:Record<string,string>={number:"job_number",customerId:"customer_id",customerSiteId:"customer_site_id",errorCodeId:"error_code_id",siteDeviceId:"site_device_id",employeeId:"employee_id",date:"job_date",time:"job_time",estimatedHours:"estimated_hours",materialCost:"material_cost"};
    Object.entries(patch).forEach(([k,v])=>{
      if(k==="customerId")db.customer_id=Number(v);
      else if(k==="customerSiteId")db.customer_site_id=v||null;
      else if(k==="errorCodeId")db.error_code_id=v||null;
      else if(k==="siteDeviceId")db.site_device_id=v||null;
      else if(k==="checklist")db.checklist=v??[];
      else db[map[k]??k]=(k==="employeeId"&&!v)?null:v;
    });
    const {error}=await s.from("jobs").update(db).eq("id",id).eq("company_id",company.id);if(error){setCloudError(formatCloudError(error.message));return false;}
    // V14.5: award job.xpReward (from Wartung template) or fallback +50
    if(patch.status==="Erledigt"){
      const prev=local.jobs.find(j=>j.id===id);
      if(prev && prev.status!=="Erledigt" && prev.employeeId){
        const emp=local.employees.find(e=>e.id===prev.employeeId);
        if(emp){
          const gain=prev.xpReward!=null&&Number(prev.xpReward)>0?Number(prev.xpReward):50;
          await s.from("employees").update({xp:Number(emp.xp||0)+gain}).eq("id",emp.id).eq("company_id",company.id);
        }
      }
    }
    await reloadCloud();return true;
  }
  async function removeJob(id:string){const s=getSupabaseClient();if(!s||!company)return false;const {error}=await s.from("jobs").delete().eq("id",id).eq("company_id",company.id);if(error){setCloudError(formatCloudError(error.message));return false;}await reloadCloud();return true;}

  async function addCustomerSite(item:Omit<CustomerSite,"id">){
    const s=getSupabaseClient(); if(!s||!user||!company)return false; setCloudError("");
    const {error}=await s.from("customer_sites").insert({
      company_id:company.id, customer_id:Number(item.customerId), name:item.name,
      street:item.street||null, postal_code:item.postalCode||null, city:item.city||null,
      tenant_name:item.tenantName||null, tenant_phone:item.tenantPhone||null, tenant_email:item.tenantEmail||null,
      notes:item.notes||null, active:item.active!==false,
    });
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function updateCustomerSite(id:string,patch:Partial<CustomerSite>){
    const s=getSupabaseClient(); if(!s||!company)return false; setCloudError("");
    const {error}=await s.from("customer_sites").update(siteDbPatch(patch)).eq("id",id).eq("company_id",company.id);
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function removeCustomerSite(id:string){
    const s=getSupabaseClient(); if(!s||!company)return false; setCloudError("");
    const {error}=await s.from("customer_sites").update({active:false}).eq("id",id).eq("company_id",company.id);
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }

  async function addLead(item:Omit<Lead,"id">){
    const s=getSupabaseClient(); if(!s||!user||!company)return false; setCloudError("");
    const {error}=await s.from("leads").insert({
      owner_id:user.id, company_id:company.id,
      name:item.name, company_name:item.company||null, phone:item.phone||null, email:item.email||null,
      street:item.street||null, postal_code:item.postalCode||null, city:item.city||null,
      source:item.source||null, status:item.status||"Neu", estimated_value:item.value??0, notes:item.notes||null,
    });
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function updateLead(id:string,patch:Partial<Lead>){
    const s=getSupabaseClient(); if(!s||!company)return false; setCloudError("");
    const {error}=await s.from("leads").update(leadDbPatch(patch)).eq("id",id).eq("company_id",company.id);
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function removeLead(id:string){
    const s=getSupabaseClient(); if(!s||!company)return false; setCloudError("");
    const {error}=await s.from("leads").delete().eq("id",id).eq("company_id",company.id);
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }


  async function addRecurringTemplate(item:Omit<RecurringJobTemplate,"id">){
    const s=getSupabaseClient(); if(!s||!user||!company)return false; setCloudError("");
    const {error}=await s.from("recurring_job_templates").insert({
      owner_id:user.id, company_id:company.id,
      customer_id:Number(item.customerId), title:item.title,
      description:item.description||null, cadence:item.cadence||"monthly",
      interval_days:item.intervalDays!=null&&Number(item.intervalDays)>0?Number(item.intervalDays):null,
      next_run_date:item.nextRunDate, active:item.active!==false,
      default_assignee:item.defaultAssignee||null, default_time:item.defaultTime||"08:00",
      default_priority:item.defaultPriority||"Normal", estimated_hours:item.estimatedHours??2,
      default_xp:item.defaultXp!=null?Math.max(0,Number(item.defaultXp)):15,
      default_price:item.defaultPrice!=null?Math.max(0,Number(item.defaultPrice)):0,
      notes:item.notes||null,
    });
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function updateRecurringTemplate(id:string,patch:Partial<RecurringJobTemplate>){
    const s=getSupabaseClient(); if(!s||!company)return false; setCloudError("");
    const {error}=await s.from("recurring_job_templates").update(recurringDbPatch(patch)).eq("id",id).eq("company_id",company.id);
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function removeRecurringTemplate(id:string){
    const s=getSupabaseClient(); if(!s||!company)return false; setCloudError("");
    const {error}=await s.from("recurring_job_templates").delete().eq("id",id).eq("company_id",company.id);
    if(error){setCloudError(formatCloudError(error.message));return false;} await reloadCloud(); return true;
  }
  async function generateDueRecurringJobs(){
    const s=getSupabaseClient(); if(!s||!company)return {ok:false,jobsCreated:0,templatesProcessed:0,message:"Nicht angemeldet"};
    setCloudError("");
    const {data,error}=await s.rpc("generate_due_recurring_jobs",{p_company_id:company.id});
    if(error){
      const msg=formatCloudError(error.message);
      setCloudError(msg);
      return {ok:false,jobsCreated:0,templatesProcessed:0,message:msg};
    }
    const jobsCreated=Number((data as any)?.jobs_created??0);
    const templatesProcessed=Number((data as any)?.templates_processed??0);
    await reloadCloud();
    return {ok:true,jobsCreated,templatesProcessed};
  }

  const value=useMemo<AppDataContextValue>(()=>({
    ...local,hydrated,cloudLoading,cloudError,reloadCloud,
    addCustomer,updateCustomer,removeCustomer,addCustomerSite,updateCustomerSite,removeCustomerSite,addJob,updateJob,removeJob,addEmployee,updateEmployee,removeEmployee,
    addLead,updateLead,removeLead,
    addRecurringTemplate,updateRecurringTemplate,removeRecurringTemplate,generateDueRecurringJobs,
    addInvoice:(item)=>setLocal(d=>({...d,invoices:[item,...d.invoices]})),
    addMaterial:(item)=>setLocal(d=>({...d,materials:[item,...d.materials]})),
    updateSettings:(settings)=>setLocal(d=>({...d,settings})),
    resetDemo:()=>setLocal({...emptyAppData,...emptyCloud}),
  }),[local,hydrated,cloudLoading,cloudError,user?.id,company?.id,role]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAppData(){const v=useContext(Ctx);if(!v)throw new Error("useAppData must be used inside AppDataProvider");return v;}
