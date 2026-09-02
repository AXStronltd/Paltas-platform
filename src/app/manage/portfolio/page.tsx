import { Suspense } from "react";
import { PortfolioDrilldown } from "@/components/owner/PortfolioDrilldown";

export default function PortfolioPage() {
  return (
    // useSearchParams needs a Suspense boundary in the App Router.
    <Suspense fallback={<div className="manage-loading"><div className="spinner" /><span>Loading…</span></div>}>
      <PortfolioDrilldown />
    </Suspense>
  );
}
