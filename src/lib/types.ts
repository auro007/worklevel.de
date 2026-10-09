export type RecurringCadence = "weekly" | "biweekly" | "monthly";

export type RecurringJobTemplate = {
  id: string;
  customerId: string;
  title: string;
  description: string;
  cadence: RecurringCadence;
  intervalDays?: number | null;
  nextRunDate: string;
  active: boolean;
  defaultAssignee: string;
  defaultTime: string;
  defaultPriority: "Normal" | "Hoch" | "Notfall";
  estimatedHours: number;
  /** V14.5 — XP on complete (Plantafel Wartung sketch) */
  defaultXp: number;
  /** V14.5 — suggested flat EUR price for offer/invoice */
  defaultPrice: number;
  notes?: string;
};


export type JobChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type JobStatus = "Geplant" | "In Arbeit" | "Erledigt" | "Storniert";
export type InvoiceStatus = "Entwurf" | "Offen" | "Bezahlt" | "Überfällig";
export type LeadStatus = "Neu" | "Kontaktiert" | "Angebot" | "Gewonnen" | "Verloren";

export type Customer = {
  id: string;
  number: string;
  name: string;
  contact: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  notes?: string;
  archived?: boolean;
};


export type CustomerSite = {
  id: string;
  customerId: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  notes?: string;
  active: boolean;
};
export type AbsenceType = "urlaub" | "krankheit";

export type EmployeeAbsence = {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  days: number;
  note?: string;
  createdAt?: string;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: "Im Einsatz" | "Verfügbar" | "Urlaub";
  active: boolean;
  xp: number;
  authUserId?: string;
  /** Optional personal hourly rate; null/undefined → company rate */
  hourlyRate?: number | null;
  /** Annual vacation entitlement (days) */
  vacationDaysTotal: number;
  /** Soft sick-day allowance / year hint (usage from absences) */
  sickDaysYear: number;
};

export type Job = {
  id: string;
  number: string;
  title: string;
  customerId: string;
  customerSiteId?: string;
  errorCodeId?: string;
  siteDeviceId?: string;
  employeeId: string;
  date: string;
  time: string;
  status: JobStatus;
  priority: "Normal" | "Hoch" | "Notfall";
  address: string;
  description: string;
  estimatedHours: number;
  materialCost: number;
  checklist?: JobChecklistItem[];
  /** V14.5 — XP awarded on Erledigt; from template or null → fallback 50 */
  xpReward?: number | null;
  /** V14.5 — flat EUR suggestion for invoice/offer line */
  suggestedPrice?: number | null;
};

export type Lead = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  source: string;
  status: LeadStatus;
  value: number;
  notes?: string;
  convertedCustomerId?: string;
};

export type Invoice = {
  id: string;
  number: string;
  customerId: string;
  date: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplier: string;
  date: string;
  amount: number;
  status: "Bestellt" | "Teilgeliefert" | "Geliefert";
};

export type DeliveryNote = {
  id: string;
  number: string;
  customerId: string;
  jobId: string;
  date: string;
  status: "Offen" | "Unterzeichnet";
};

export type TradeCategory = "Heizung" | "Sanitär" | "Lüftung" | "Klima" | "Sonstiges";

export type MaterialItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  purchasePrice: number;
  salesPrice: number;
  stock: number;
  minStock: number;
  tradeCategory?: TradeCategory;
  keywords?: string[];
  imagePath?: string | null;
  supplierId?: string | null;
};

export type CompanySettings = {
  companyName: string;
  owner: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  taxNumber: string;
  vatId: string;
  hourlyRate: number;
};

export type AppData = {
  customers: Customer[];
  customerSites: CustomerSite[];
  employees: Employee[];
  jobs: Job[];
  recurringTemplates: RecurringJobTemplate[];
  leads: Lead[];
  invoices: Invoice[];
  orders: PurchaseOrder[];
  deliveryNotes: DeliveryNote[];
  materials: MaterialItem[];
  settings: CompanySettings;
};
