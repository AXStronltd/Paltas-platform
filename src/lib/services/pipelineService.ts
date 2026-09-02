import { api } from "./managementApi";

/**
 * Leads, viewings and developments — the agent and developer portals.
 *
 * Same client as the other portals, so a 403 arrives as an ordinary answer
 * carrying its reason rather than as an exception. That matters here: an agent
 * scoped to one property and a sales director with the whole portfolio use the
 * same screens, and the screens have to say which parts are closed to them
 * instead of failing.
 */

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

export type LeadStage = "NEW" | "CONTACTED" | "VIEWING" | "OFFER" | "RESERVED" | "CLOSED" | "LOST";
export type ViewingStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type ProjectStatus = "PLANNING" | "SELLING" | "COMPLETED" | "ON_HOLD";
export type UnitStatus = "AVAILABLE" | "RESERVED" | "SOLD";

/** The pipeline in order. CLOSED and LOST are terminal and not in the ladder. */
export const STAGES: LeadStage[] = ["NEW", "CONTACTED", "VIEWING", "OFFER", "RESERVED", "CLOSED"];

export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "New", CONTACTED: "Contacted", VIEWING: "Viewing",
  OFFER: "Offer", RESERVED: "Reserved", CLOSED: "Closed", LOST: "Lost",
};

export interface Lead {
  id: string; name: string; email: string | null; phone: string | null;
  interestedIn: string | null; budget: number | null; currency: string;
  stage: LeadStage; source: string | null; notes: string | null;
  assignedToId: string | null; lastContactAt: string | null;
  createdAt: string; closedAt: string | null; lostReason: string | null;
  propertyId: string | null;
  property?: { id: string; name: string } | null;
  listing?: { id: string; title: string } | null;
  project?: { id: string; name: string } | null;
  _count?: { viewings: number };
}

export interface Viewing {
  id: string; clientName: string; scheduledAt: string; durationMins: number;
  status: ViewingStatus; notes: string | null; outcome: string | null;
  propertyId: string | null;
  lead?: { id: string; name: string; stage: LeadStage } | null;
  property?: { id: string; name: string } | null;
  listing?: { id: string; title: string } | null;
}

export interface Project {
  id: string; name: string; location: string | null; city: string | null;
  description: string | null; currency: string; status: ProjectStatus;
  completion: number; expectedCompletionAt: string | null; propertyId: string | null;
  totalUnits: number; sold: number; reserved: number; available: number;
  revenue: number; remainingValue: number;
  _count?: { leads: number };
}

export interface ProjectUnit {
  id: string; projectId: string; unitNo: string; type: string | null;
  floor: number | null; bedrooms: number | null; bathrooms: number | null;
  areaSqm: number | null; price: number; status: UnitStatus;
  buyerName: string | null; agreedPrice: number | null;
  reservedAt: string | null; soldAt: string | null;
}

/* --------------------------------- Leads -------------------------------- */

export const getLeads = (input: { stage?: LeadStage; mine?: boolean } = {}) =>
  api.get<{ leads: Lead[]; byStage: Partial<Record<LeadStage, number>>; pipelineValue: number }>(
    `/leads${qs(input)}`,
  );

export const getLead = (id: string) =>
  api.get<{ lead: Lead & { viewings: Viewing[] } }>(`/leads/${id}`);

export const createLead = (input: {
  name: string; email?: string; phone?: string; interestedIn?: string;
  budget?: number; currency?: string; propertyId?: string; listingId?: string;
  projectId?: string; source?: string; notes?: string;
}) => api.post<{ lead: Lead }>("/leads", input);

/**
 * Move a lead along. The server enforces the order and refuses to reopen a
 * closed or lost one, so this is a request rather than a command. Marking a
 * lead lost additionally requires a reason.
 */
export const updateLead = (id: string, input: {
  stage?: LeadStage; lostReason?: string; assignedToId?: string | null;
  name?: string; email?: string; phone?: string; budget?: number;
  interestedIn?: string; notes?: string;
}) => api.patch<{ lead: Lead }>(`/leads/${id}`, input);

export const deleteLead = (id: string) => api.del<{ deleted: boolean }>(`/leads/${id}`);

/* -------------------------------- Viewings ------------------------------ */

export const getViewings = (input: { status?: ViewingStatus; from?: string; to?: string } = {}) =>
  api.get<{ viewings: Viewing[]; upcoming: number }>(`/viewings${qs(input)}`);

export const scheduleViewing = (input: {
  leadId?: string; clientName?: string; scheduledAt: string; durationMins?: number;
  propertyId?: string; listingId?: string; notes?: string;
}) => api.post<{ viewing: Viewing }>("/viewings", input);

export const updateViewing = (id: string, input: {
  status?: ViewingStatus; outcome?: string; notes?: string; scheduledAt?: string;
}) => api.patch<{ viewing: Viewing }>(`/viewings/${id}`, input);

/* ------------------------------ Developments ---------------------------- */

export const getProjects = (input: { status?: ProjectStatus } = {}) =>
  api.get<{ projects: Project[] }>(`/projects${qs(input)}`);

export const createProject = (input: {
  name: string; location?: string; city?: string; description?: string;
  currency?: string; status?: ProjectStatus; completion?: number;
  expectedCompletionAt?: string; propertyId?: string;
}) => api.post<{ project: Project }>("/projects", input);

export const getProjectUnits = (projectId: string) =>
  api.get<{ project: { id: string; name: string; currency: string }; units: ProjectUnit[] }>(
    `/projects/${projectId}/units`,
  );

export const addProjectUnits = (projectId: string, units: {
  unitNo: string; type?: string; floor?: number; bedrooms?: number;
  bathrooms?: number; areaSqm?: number; price: number;
}[]) => api.post<{ added: number; skipped: number }>(`/projects/${projectId}/units`, { units });

/** reserve · sell · release — the server enforces which are legal from where. */
export const moveUnit = (id: string, action: "reserve" | "sell" | "release", input: {
  buyerName?: string; agreedPrice?: number;
} = {}) => api.patch<{ unit: ProjectUnit }>(`/project-units/${id}`, { action, ...input });

export const updateUnit = (id: string, input: { price?: number; type?: string; bedrooms?: number }) =>
  api.patch<{ unit: ProjectUnit }>(`/project-units/${id}`, input);

/* -------------------------------- Display ------------------------------- */

export function money(amount: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export const shortDate = (iso: string, locale = "en") =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));

export const dateTime = (iso: string, locale = "en") =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
