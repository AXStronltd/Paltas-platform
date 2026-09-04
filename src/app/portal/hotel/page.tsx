import { HotelDashboard } from "@/components/portal/HotelDashboard";
import { currentActor } from "@/server/actor";
import { requireDashboardRole } from "@/server/dashboard";
export default async function HotelPortalPage() { requireDashboardRole(await currentActor(), "hotel"); return <HotelDashboard />; }
