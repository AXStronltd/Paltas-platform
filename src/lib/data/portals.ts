import type {
  HotelRoom, HotelBooking, Unit, Tenant, MaintenanceTicket,
  AgentListing, Lead, Viewing, Project, ProjectUnit, DeveloperLead,
} from "@/lib/models";

/** Mock seed data for the role portals. Shapes conform to the domain models. */

export const HOTEL_ROOMS: HotelRoom[] = [
  { id: "hr1", name: "Standard Double", rate: 8500, currency: "KES", total: 40, available: 12, beds: "1 Queen", status: "active" },
  { id: "hr2", name: "Deluxe King", rate: 12000, currency: "KES", total: 25, available: 6, beds: "1 King", status: "active" },
  { id: "hr3", name: "Executive Suite", rate: 18500, currency: "KES", total: 12, available: 3, beds: "1 King + sofa", status: "active" },
  { id: "hr4", name: "Family Room", rate: 15000, currency: "KES", total: 15, available: 8, beds: "2 Queen", status: "active" },
  { id: "hr5", name: "Presidential Suite", rate: 45000, currency: "KES", total: 2, available: 1, beds: "2 King", status: "active" },
];

export const HOTEL_BOOKINGS: HotelBooking[] = [
  { id: "hb1", guest: "Sarah Mwangi", room: "Deluxe King", checkIn: "26 Aug", checkOut: "29 Aug", amount: 36000, currency: "KES", status: "confirmed" },
  { id: "hb2", guest: "John K. (UK)", room: "Executive Suite", checkIn: "28 Aug", checkOut: "2 Sep", amount: 92500, currency: "KES", status: "confirmed" },
  { id: "hb3", guest: "Aisha Noor", room: "Standard Double", checkIn: "30 Aug", checkOut: "31 Aug", amount: 8500, currency: "KES", status: "checked_in" },
  { id: "hb4", guest: "Peter O.", room: "Family Room", checkIn: "1 Sep", checkOut: "4 Sep", amount: 45000, currency: "KES", status: "confirmed" },
  { id: "hb5", guest: "Grace W.", room: "Standard Double", checkIn: "24 Aug", checkOut: "26 Aug", amount: 17000, currency: "KES", status: "checked_out" },
];

export const UNITS: Unit[] = [
  { id: "u1", name: "Apt 4B — Kilimani", location: "Kilimani, Nairobi", rent: 45000, currency: "KES", status: "occupied", tenantId: "t1" },
  { id: "u2", name: "Apt 2A — Kilimani", location: "Kilimani, Nairobi", rent: 38000, currency: "KES", status: "occupied", tenantId: "t2" },
  { id: "u3", name: "Studio 1C — Westlands", location: "Westlands, Nairobi", rent: 30000, currency: "KES", status: "vacant" },
  { id: "u4", name: "Apt 7D — Kilimani", location: "Kilimani, Nairobi", rent: 52000, currency: "KES", status: "notice", tenantId: "t3" },
];

export const TENANTS: Tenant[] = [
  { id: "t1", name: "Daniel Mwangi", unitId: "u1", unitName: "Apt 4B", rent: 45000, currency: "KES", rentStatus: "paid", leaseEnd: "Dec 2025" },
  { id: "t2", name: "Faith Achieng", unitId: "u2", unitName: "Apt 2A", rent: 38000, currency: "KES", rentStatus: "due", leaseEnd: "Mar 2026" },
  { id: "t3", name: "Brian Otieno", unitId: "u4", unitName: "Apt 7D", rent: 52000, currency: "KES", rentStatus: "overdue", leaseEnd: "Sep 2025" },
];

export const MAINTENANCE: MaintenanceTicket[] = [
  { id: "m1", unitName: "Apt 2A", issue: "Leaking kitchen tap", raisedBy: "Faith Achieng", priority: "medium", status: "open", createdAt: Date.now() - 86400000 },
  { id: "m2", unitName: "Apt 4B", issue: "Water heater not working", raisedBy: "Daniel Mwangi", priority: "high", status: "in_progress", createdAt: Date.now() - 172800000 },
  { id: "m3", unitName: "Studio 1C", issue: "Repaint before new tenant", raisedBy: "Landlord", priority: "low", status: "open", createdAt: Date.now() - 259200000 },
];

export const AGENT_LISTINGS: AgentListing[] = [
  { id: "al1", name: "3BR Apartment — Nyali", location: "Nyali, Mombasa", price: 8500000, currency: "KES", kind: "sale", status: "live", views: 342 },
  { id: "al2", name: "Beach Villa — Diani", location: "Diani Beach", price: 25000000, currency: "KES", kind: "sale", status: "under_offer", views: 891 },
  { id: "al3", name: "2BR — Kilimani (rent)", location: "Kilimani, Nairobi", price: 65000, currency: "KES", kind: "rent", status: "live", views: 210 },
  { id: "al4", name: "Penthouse — Westlands", location: "Westlands, Nairobi", price: 18000000, currency: "KES", kind: "sale", status: "draft", views: 0 },
];

export const LEADS: Lead[] = [
  { id: "ld1", name: "James Odhiambo", interestedIn: "3BR Apartment — Nyali", stage: "viewing", budget: 9000000, currency: "KES", lastContact: "2h ago" },
  { id: "ld2", name: "Mary W.", interestedIn: "2BR — Kilimani (rent)", stage: "contacted", budget: 70000, currency: "KES", lastContact: "1d ago" },
  { id: "ld3", name: "Ahmed H.", interestedIn: "Beach Villa — Diani", stage: "offer", budget: 24000000, currency: "KES", lastContact: "3h ago" },
  { id: "ld4", name: "Lucy N.", interestedIn: "Penthouse — Westlands", stage: "new", budget: 20000000, currency: "KES", lastContact: "just now" },
];

export const VIEWINGS: Viewing[] = [
  { id: "v1", listing: "3BR Apartment — Nyali", client: "James Odhiambo", when: "Today 2:00 PM", status: "scheduled" },
  { id: "v2", listing: "Beach Villa — Diani", client: "Ahmed H.", when: "Tomorrow 10:00 AM", status: "scheduled" },
  { id: "v3", listing: "2BR — Kilimani (rent)", client: "Mary W.", when: "Yesterday", status: "completed" },
];

export const PROJECTS: Project[] = [
  { id: "p1", name: "Golden Park Residences", location: "Kileleshwa, Nairobi", totalUnits: 120, sold: 78, available: 42, revenue: 546000000, currency: "KES", completion: 65, status: "selling" },
  { id: "p2", name: "Westgate Towers", location: "Westlands, Nairobi", totalUnits: 80, sold: 80, available: 0, revenue: 720000000, currency: "KES", completion: 100, status: "completed" },
  { id: "p3", name: "Coastal Breeze Estate", location: "Nyali, Mombasa", totalUnits: 60, sold: 12, available: 48, revenue: 96000000, currency: "KES", completion: 20, status: "selling" },
];

export const PROJECT_UNITS: ProjectUnit[] = [
  { id: "pu1", projectId: "p1", unitNo: "A-101", type: "2 Bedroom", price: 7000000, currency: "KES", status: "sold" },
  { id: "pu2", projectId: "p1", unitNo: "A-102", type: "2 Bedroom", price: 7000000, currency: "KES", status: "available" },
  { id: "pu3", projectId: "p1", unitNo: "B-201", type: "3 Bedroom", price: 9500000, currency: "KES", status: "reserved" },
  { id: "pu4", projectId: "p1", unitNo: "B-202", type: "3 Bedroom", price: 9500000, currency: "KES", status: "available" },
];

export const DEVELOPER_LEADS: DeveloperLead[] = [
  { id: "dl1", name: "Kevin M.", project: "Golden Park Residences", stage: "deposit", value: 9500000, currency: "KES" },
  { id: "dl2", name: "Susan A.", project: "Coastal Breeze Estate", stage: "enquiry", value: 1600000, currency: "KES" },
  { id: "dl3", name: "Omar F.", project: "Golden Park Residences", stage: "reserved", value: 7000000, currency: "KES" },
];
