"use client";

import { useEffect, useState } from "react";
import type { AgentListing, Lead, Viewing } from "@/lib/models";
import { getAgentListings, getLeads, getViewings, advanceLead } from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useToast } from "@/components/ui/Toast";

export function AgentPortal() {
  const [listings, setListings] = useState<AgentListing[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [viewings, setViewings] = useState<Viewing[] | null>(null);
  const toast = useToast();

  async function loadLeads() { setLeads((await getLeads()).data); }
  useEffect(() => {
    getAgentListings().then((r) => setListings(r.data));
    loadLeads();
    getViewings().then((r) => setViewings(r.data));
  }, []);

  function flash(m: string) { toast.success(m); }
  async function advance(l: Lead) { await advanceLead(l.id); loadLeads(); flash(`${l.name} moved forward`); }

  const live = listings?.filter((l) => l.status === "live").length ?? 0;
  const openLeads = leads?.filter((l) => l.stage !== "closed").length ?? 0;

  return (
    <>
      <PortalShell
        title="Agent CRM" subtitle="Listings, leads & viewings" badge="Verified agent"
        tabs={[
          {
            key: "overview", label: "Overview", render: () => listings === null || leads === null ? <Loading /> : (
              <>
                <div className="kpis">
                  <Kpi value={String(live)} label="Live listings" />
                  <Kpi value={String(openLeads)} label="Active leads" />
                  <Kpi value={String(viewings?.filter((v) => v.status === "scheduled").length ?? 0)} label="Viewings booked" />
                  <Kpi value={String(listings.filter((l) => l.status === "under_offer").length)} label="Under offer" />
                </div>
                <h3 className="portal-h3">Leads needing action</h3>
                {leads.filter((l) => l.stage !== "closed").map((l) => (
                  <div key={l.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.interestedIn} · {l.lastContact}</span></div>
                    <LeadPill s={l.stage} />
                    <button className="btn-mini" onClick={() => advance(l)}>Advance →</button>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "listings", label: "Listings", render: () => listings === null ? <Loading /> : (
              <>
                {listings.map((l) => (
                  <div key={l.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.location} · {l.views} views · {l.kind === "sale" ? "For sale" : "For rent"}</span></div>
                    <div style={{ textAlign: "right" }}><b>KSh {l.price.toLocaleString()}</b><div><ListingPill s={l.status} /></div></div>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "leads", label: "Leads pipeline", render: () => leads === null ? <Loading /> : leads.length === 0 ? <Empty icon="🎯" title="No leads yet" /> : (
              <>
                {(["new", "contacted", "viewing", "offer", "closed"] as Lead["stage"][]).map((stage) => {
                  const group = leads.filter((l) => l.stage === stage);
                  if (group.length === 0) return null;
                  return (
                    <div key={stage}>
                      <h3 className="portal-h3" style={{ textTransform: "capitalize" }}>{stage} ({group.length})</h3>
                      {group.map((l) => (
                        <div key={l.id} className="lrow">
                          <div className="lrow-av">{l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                          <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.interestedIn} · budget KSh {l.budget.toLocaleString()}</span></div>
                          <button className="btn-mini" onClick={() => advance(l)}>Advance →</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ),
          },
          {
            key: "viewings", label: "Viewings", render: () => viewings === null ? <Loading /> : viewings.length === 0 ? <Empty icon="📅" title="No viewings scheduled" /> : (
              <>
                {viewings.map((v) => (
                  <div key={v.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{v.listing}</b><span>{v.client} · {v.when}</span></div>
                    <Pill tone={v.status === "scheduled" ? "blue" : v.status === "completed" ? "green" : "grey"}>{v.status}</Pill>
                  </div>
                ))}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function LeadPill({ s }: { s: Lead["stage"] }) {
  const m: Record<Lead["stage"], "grey" | "blue" | "amber" | "green"> = { new: "grey", contacted: "blue", viewing: "amber", offer: "amber", closed: "green" };
  return <Pill tone={m[s]}>{s}</Pill>;
}
function ListingPill({ s }: { s: AgentListing["status"] }) {
  const m = { live: ["green", "Live"], under_offer: ["amber", "Under offer"], sold: ["blue", "Sold"], draft: ["grey", "Draft"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
