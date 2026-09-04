import { AgentPortal } from "@/components/portal/AgentPortal";
import { currentActor } from "@/server/actor";
import { requireDashboardRole } from "@/server/dashboard";
export default async function AgentPage() { requireDashboardRole(await currentActor(), "agent"); return <AgentPortal />; }
