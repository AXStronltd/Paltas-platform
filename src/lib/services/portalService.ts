import { isMock } from "@/lib/config";
import type {
  HotelRoom, HotelBooking, Unit, Tenant, MaintenanceTicket,
  AgentListing, Lead, Viewing, Project, ProjectUnit, DeveloperLead, Result,
} from "@/lib/models";
import {
  HOTEL_ROOMS, HOTEL_BOOKINGS, UNITS, TENANTS, MAINTENANCE,
  AGENT_LISTINGS, LEADS, VIEWINGS, PROJECTS, PROJECT_UNITS, DEVELOPER_LEADS,
} from "@/lib/data/portals";
import { apiGet, mockDelay } from "./apiClient";

/**
 * Portal service — one service backing all four role portals (hotel, landlord,
 * agent, developer). Same mock⇄API pattern as the rest of the app: pages call
 * these functions; when the backend is ready, implement the `// API:` branches
 * and the portal UIs don't change.
 *
 * Mock state is mutable so actions (edit rate, resolve ticket, advance a lead,
 * mark a unit sold) actually change the data and the UI reflects it — real
 * states, not static screens.
 */

// working copies so mutations persist in-session
const rooms = HOTEL_ROOMS.map((r) => ({ ...r }));
const hotelBookings = HOTEL_BOOKINGS.map((b) => ({ ...b }));
const units = UNITS.map((u) => ({ ...u }));
const tenants = TENANTS.map((t) => ({ ...t }));
const maintenance = MAINTENANCE.map((m) => ({ ...m }));
const agentListings = AGENT_LISTINGS.map((l) => ({ ...l }));
const leads = LEADS.map((l) => ({ ...l }));
const viewings = VIEWINGS.map((v) => ({ ...v }));
const projects = PROJECTS.map((p) => ({ ...p }));
const projectUnits = PROJECT_UNITS.map((u) => ({ ...u }));
const developerLeads = DEVELOPER_LEADS.map((l) => ({ ...l }));

const wrap = <T>(v: T): Promise<Result<T>> => mockDelay({ data: v, error: null });

// ---------------- HOTEL ----------------
export async function getHotelRooms(): Promise<Result<HotelRoom[]>> {
  if (isMock()) return wrap(rooms.map((r) => ({ ...r })));
  return apiGet<HotelRoom[]>("/portal/hotel/rooms");
}
export async function getHotelBookings(): Promise<Result<HotelBooking[]>> {
  if (isMock()) return wrap(hotelBookings.map((b) => ({ ...b })));
  return apiGet<HotelBooking[]>("/portal/hotel/bookings");
}
export async function updateRoomRate(id: string, rate: number): Promise<Result<HotelRoom | null>> {
  const r = rooms.find((x) => x.id === id);
  if (r) r.rate = rate;
  return wrap(r ? { ...r } : null);
}
export async function updateRoomAvailability(id: string, available: number): Promise<Result<HotelRoom | null>> {
  const r = rooms.find((x) => x.id === id);
  if (r) r.available = Math.max(0, Math.min(r.total, available));
  return wrap(r ? { ...r } : null);
}
export async function addRoomType(input: { name: string; rate: number; total: number; beds: string }): Promise<Result<HotelRoom>> {
  const room: HotelRoom = { id: "hr_" + Date.now(), currency: "KES", available: input.total, status: "active", ...input };
  rooms.push(room);
  return wrap({ ...room });
}

// ---------------- LANDLORD ----------------
export async function getUnits(): Promise<Result<Unit[]>> {
  if (isMock()) return wrap(units.map((u) => ({ ...u })));
  return apiGet<Unit[]>("/portal/landlord/units");
}
export async function getTenants(): Promise<Result<Tenant[]>> {
  if (isMock()) return wrap(tenants.map((t) => ({ ...t })));
  return apiGet<Tenant[]>("/portal/landlord/tenants");
}
export async function getMaintenance(): Promise<Result<MaintenanceTicket[]>> {
  if (isMock()) return wrap(maintenance.map((m) => ({ ...m })));
  return apiGet<MaintenanceTicket[]>("/portal/landlord/maintenance");
}
export async function sendRentReminder(tenantId: string): Promise<Result<{ sent: true }>> {
  return wrap({ sent: true as const });
}
export async function addTenant(input: { name: string; unitName: string; rent: number }): Promise<Result<Tenant>> {
  const t: Tenant = { id: "t_" + Date.now(), unitId: "u_new", currency: "KES", rentStatus: "due", leaseEnd: "12 months", ...input };
  tenants.push(t);
  return wrap({ ...t });
}
export async function resolveMaintenance(id: string): Promise<Result<MaintenanceTicket | null>> {
  const m = maintenance.find((x) => x.id === id);
  if (m) m.status = "resolved";
  return wrap(m ? { ...m } : null);
}

// ---------------- AGENT ----------------
export async function getAgentListings(): Promise<Result<AgentListing[]>> {
  if (isMock()) return wrap(agentListings.map((l) => ({ ...l })));
  return apiGet<AgentListing[]>("/portal/agent/listings");
}
export async function getLeads(): Promise<Result<Lead[]>> {
  if (isMock()) return wrap(leads.map((l) => ({ ...l })));
  return apiGet<Lead[]>("/portal/agent/leads");
}
export async function getViewings(): Promise<Result<Viewing[]>> {
  if (isMock()) return wrap(viewings.map((v) => ({ ...v })));
  return apiGet<Viewing[]>("/portal/agent/viewings");
}
const LEAD_STAGES: Lead["stage"][] = ["new", "contacted", "viewing", "offer", "closed"];
export async function advanceLead(id: string): Promise<Result<Lead | null>> {
  const l = leads.find((x) => x.id === id);
  if (l) {
    const i = LEAD_STAGES.indexOf(l.stage);
    l.stage = LEAD_STAGES[Math.min(LEAD_STAGES.length - 1, i + 1)];
    l.lastContact = "just now";
  }
  return wrap(l ? { ...l } : null);
}

// ---------------- DEVELOPER ----------------
export async function getProjects(): Promise<Result<Project[]>> {
  if (isMock()) return wrap(projects.map((p) => ({ ...p })));
  return apiGet<Project[]>("/portal/developer/projects");
}
export async function getProjectUnits(projectId: string): Promise<Result<ProjectUnit[]>> {
  if (isMock()) return wrap(projectUnits.filter((u) => u.projectId === projectId).map((u) => ({ ...u })));
  return apiGet<ProjectUnit[]>(`/portal/developer/projects/${projectId}/units`);
}
export async function getDeveloperLeads(): Promise<Result<DeveloperLead[]>> {
  if (isMock()) return wrap(developerLeads.map((l) => ({ ...l })));
  return apiGet<DeveloperLead[]>("/portal/developer/leads");
}
export async function markUnitSold(id: string): Promise<Result<ProjectUnit | null>> {
  const u = projectUnits.find((x) => x.id === id);
  if (u) {
    u.status = "sold";
    const proj = projects.find((p) => p.id === u.projectId);
    if (proj) { proj.sold += 1; proj.available = Math.max(0, proj.available - 1); }
  }
  return wrap(u ? { ...u } : null);
}
