import { api } from "./managementApi";
import type {
  AccessCardRow, AccessEventRow, AlertRow, CardVerdict, GateRow, GuardRow,
  IncidentRow, Invitation, PassVerdict, SecurityCounts, ShiftRow, VehicleRow,
  Visit, VisitorRecord, VisitorType,
} from "@/lib/models/security";

/**
 * Paltas Security Management — the client half.
 *
 * Every function here is a thin call to a route handler that re-checks the
 * permission. Nothing is decided in this file; it exists so components have one
 * obvious place to look for "how do I check a visitor in" and one shape of
 * answer when it fails.
 */

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

/* ------------------------------- Dashboard ------------------------------ */

export const getSecurityDashboard = (propertyId?: string | null) =>
  api.get<{ counts: SecurityCounts; recentEvents: AccessEventRow[] }>(`/security/dashboard${qs({ propertyId })}`);

export const getSecurityReports = (params: { propertyId?: string | null; from?: string; to?: string } = {}) =>
  api.get<{
    window: { from: string; to: string };
    totals: { visits: number; averageStayMinutes: number | null; guardsOnRoster: number };
    visitsByType: { type: VisitorType; count: number }[];
    incidentsBySeverity: { severity: string; count: number }[];
    incidentsByCategory: { category: string; count: number }[];
    accessByResult: { result: string; method: string; count: number }[];
    cardsByStatus: { status: string; count: number }[];
  }>(`/security/reports${qs(params)}`);

/* -------------------------------- Visitors ------------------------------ */

export const getVisitors = (params: { q?: string; propertyId?: string | null; type?: VisitorType } = {}) =>
  api.get<{ visitors: VisitorRecord[] }>(`/security/visitors${qs(params)}`);

export const registerVisitor = (input: {
  propertyId: string; fullName: string; phone?: string;
  type?: VisitorType; company?: string; idType?: string; idNumber?: string;
}) => api.post<{ visitor: VisitorRecord }>("/security/visitors", input);

export const getInvitations = (params: { status?: string; propertyId?: string | null; unitId?: string; active?: boolean } = {}) =>
  api.get<{ invitations: Invitation[] }>(`/security/invitations${qs(params)}`);

export const createInvitation = (input: {
  unitId: string; visitorName: string; visitorPhone?: string;
  visitorType?: VisitorType; purpose?: string;
  validFrom?: string; validTo?: string;
  recurring?: boolean; maxUses?: number; vehiclePlate?: string; residentId?: string;
}) => api.post<{ invitation: Invitation }>("/security/invitations", input);

export const approveInvitation = (id: string, approve: boolean, reason?: string) =>
  api.post<{ invitation: Invitation }>(`/security/invitations/${id}/approve`, { approve, reason });

export const cancelInvitation = (id: string) =>
  api.post<{ cancelled: boolean }>(`/security/invitations/${id}/cancel`);

/** The QR pass image lives at its own URL so an <img> can point straight at it. */
export const invitationQrUrl = (id: string) => `/api/security/invitations/${id}/qr`;

/* --------------------------------- Gate --------------------------------- */

export const verifyPass = (code: string, gateId?: string) =>
  api.post<PassVerdict>("/security/passes/verify", { code, gateId });

export const verifyCard = (cardNumber: string, gateId?: string, direction?: "IN" | "OUT") =>
  api.post<CardVerdict>("/security/cards/verify", { cardNumber, gateId, direction });

export const getVisits = (params: { status?: string; propertyId?: string | null; limit?: number } = {}) =>
  api.get<{ visits: Visit[] }>(`/security/visits${qs(params)}`);

export const checkIn = (input: {
  invitationId?: string;
  propertyId?: string; unitId?: string;
  visitorId?: string; visitorName?: string; visitorPhone?: string; visitorType?: VisitorType;
  gateId?: string; badgeNo?: string; vehiclePlate?: string; notes?: string;
}) => api.post<{ visit: Visit }>("/security/visits/checkin", input);

export const checkOut = (id: string, gateId?: string, notes?: string) =>
  api.post<{ visit: Visit }>(`/security/visits/${id}/checkout`, { gateId, notes });

/* ------------------------------ Access control -------------------------- */

export const getCards = (params: { status?: string; unitId?: string; propertyId?: string | null } = {}) =>
  api.get<{ cards: AccessCardRow[] }>(`/security/cards${qs(params)}`);

export const issueCard = (input: {
  propertyId?: string; unitId?: string; residentId?: string;
  holderName: string; type?: string; expiresAt?: string; accessZones?: string[];
}) => api.post<{ card: AccessCardRow }>("/security/cards", input);

export const suspendCard = (id: string, reason: string, revoke = false) =>
  api.post<{ card: AccessCardRow }>(`/security/cards/${id}/suspend`, { reason, revoke });

export const reinstateCard = (id: string) =>
  api.post<{ card: AccessCardRow }>(`/security/cards/${id}/reinstate`);

export const getVehicles = (params: { plate?: string; propertyId?: string | null } = {}) =>
  api.get<{ vehicles: VehicleRow[] }>(`/security/vehicles${qs(params)}`);

export const registerVehicle = (input: {
  propertyId?: string; unitId?: string; residentId?: string; visitorId?: string;
  plate: string; make?: string; model?: string; colour?: string;
  type?: string; permitNo?: string; parkingBay?: string;
}) => api.post<{ vehicle: VehicleRow }>("/security/vehicles", input);

export const getGates = (propertyId?: string | null) =>
  api.get<{ gates: GateRow[] }>(`/security/gates${qs({ propertyId })}`);

export const createGate = (input: { propertyId: string; name: string; kind?: string }) =>
  api.post<{ gate: GateRow }>("/security/gates", input);

/* ------------------------------- Guards --------------------------------- */

export const getGuards = (propertyId?: string | null) =>
  api.get<{ guards: GuardRow[] }>(`/security/guards${qs({ propertyId })}`);

export const addGuard = (input: {
  propertyId: string; name: string; email: string;
  phone?: string; badgeNumber: string; temporaryPassword: string;
}) => api.post<{ guard: { id: string; name: string; email: string; badgeNumber: string } }>("/security/guards", input);

export const getShifts = (params: { propertyId?: string | null; from?: string; to?: string } = {}) =>
  api.get<{ shifts: ShiftRow[] }>(`/security/shifts${qs(params)}`);

export const scheduleShift = (input: { propertyId: string; guardId: string; gateId?: string; startsAt: string; endsAt: string }) =>
  api.post<{ shift: ShiftRow }>("/security/shifts", input);

/* ------------------------- Incidents & emergencies ---------------------- */

export const getIncidents = (params: { status?: string; severity?: string; propertyId?: string | null } = {}) =>
  api.get<{ incidents: IncidentRow[] }>(`/security/incidents${qs(params)}`);

export const reportIncident = (input: {
  propertyId?: string; buildingId?: string; unitId?: string;
  category?: string; severity?: string; title: string;
  description: string; location?: string; occurredAt?: string;
}) => api.post<{ incident: IncidentRow }>("/security/incidents", input);

export const updateIncident = (id: string, input: {
  status?: string; severity?: string; description?: string; resolutionNotes?: string; category?: string;
}) => api.patch<{ incident: IncidentRow }>(`/security/incidents/${id}`, input);

export const getAlerts = (all = false) =>
  api.get<{ alerts: AlertRow[] }>(`/security/emergency${qs({ all })}`);

export const raiseAlert = (input: { propertyId: string; type: string; message?: string; location?: string }) =>
  api.post<{ alert: AlertRow }>("/security/emergency", input);

export const acknowledgeAlert = (id: string, resolve = false) =>
  api.post<{ alert: AlertRow }>(`/security/emergency/${id}/acknowledge`, { resolve });

/* ------------------------------ Access history -------------------------- */

export const getAccessEvents = (params: { propertyId?: string | null; result?: string; since?: string; limit?: number } = {}) =>
  api.get<{ events: AccessEventRow[] }>(`/security/access-events${qs(params)}`);
