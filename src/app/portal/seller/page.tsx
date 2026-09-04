import { currentActor } from "@/server/actor";
import { requireDashboardRole } from "@/server/dashboard";
import { SellForm } from "@/components/marketplace/SellForm";

export default async function SellerPage() {
  requireDashboardRole(await currentActor(), "seller");
  return <SellForm />;
}