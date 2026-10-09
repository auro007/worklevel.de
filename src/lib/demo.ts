import type { AppData } from "./types";

/** Empty cloud-first defaults — no fake dashboard/invoice figures. */
export const emptyAppData: AppData = {
  customers: [],
  customerSites: [],
  employees: [],
  jobs: [],
  recurringTemplates: [],
  leads: [],
  invoices: [],
  orders: [],
  deliveryNotes: [],
  materials: [],
  settings: {
    companyName: "",
    owner: "",
    street: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "",
    taxNumber: "",
    vatId: "",
    hourlyRate: 0,
  },
};

/** @deprecated alias — kept so older imports keep building */
export const demoData = emptyAppData;
