import { DeveloperPortal } from "@/components/portal/DeveloperPortal";
import { currentActor } from "@/server/actor";
import { requireDashboardRole } from "@/server/dashboard";
export default async function DeveloperPage() { requireDashboardRole(await currentActor(), "developer"); return <DeveloperPortal />; }
