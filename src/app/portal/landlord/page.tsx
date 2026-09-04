import { LandlordPortal } from "@/components/portal/LandlordPortal";
import { currentActor } from "@/server/actor";
import { requireDashboardRole } from "@/server/dashboard";
export default async function LandlordPage() { requireDashboardRole(await currentActor(), "landlord"); return <LandlordPortal />; }
