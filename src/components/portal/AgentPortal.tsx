"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLeads, getViewings, createLead, updateLead, scheduleViewing, updateViewing,
  money, dateTime, shortDate, STAGES, STAGE_LABEL,
  type Lead, type Viewing, type LeadStage,
} from "@/lib/services/pipelineService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { useToast } from "@/components/ui/Toast";

/**
 * The agent's desk, on real data.
 *
 * Leads and viewings are scoped server-side like everything else, so an agent
 * responsible for one property sees their own pipeline and a sales director
 * sees the lot — same screen, no branching here.
 *
 * The pipeline value deliberately excludes closed and lost deals. A forecast
 * that counts money already banked and money already gone is not a forecast.
 */
export function AgentPortal() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [viewings, setViewings] = useState<Viewing[] | null>(null);
  const [pipelineValue, setPipelineValue] = useState(0);
  const [refused, setRefused] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { canAt } = useSession();
  const toast = useToast();

  const load = useCallback(async () => {
    const [l, v] = await Promise.all([getLeads(), getViewings()]);
    const denied: string[] = [];
    if (l.error) { denied.push(`Leads: ${l.error.message}`); setLeads([]); }
    else { setLeads(l.data.leads); setPipelineValue(l.data.pipelineValue); }
    if (v.error) { denied.push(`Viewings: ${v.error.message}`); setViewings([]); }
    else setViewings(v.data.viewings);
    setRefused(denied);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currency = leads?.[0]?.currency ?? "KES";
  const open = (leads ?? []).filter((l) => l.stage !== "CLOSED" && l.stage !== "LOST");
  const won = (leads ?? []).filter((l) => l.stage === "CLOSED");
  const upcoming = (viewings ?? []).filter((v) => v.status === "SCHEDULED" && new Date(v.scheduledAt) > new Date());

  /** The next rung up. Terminal stages have none. */
  const nextStage = (s: LeadStage): LeadStage | null => {
    const i = STAGES.indexOf(s);
    return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
  };

  async function advance(lead: Lead) {
    const next = nextStage(lead.stage);
    if (!next) return;
    setBusy(lead.id);
    const res = await updateLead(lead.id, { stage: next });
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    toast.success(`${lead.name} → ${STAGE_LABEL[next]}`);
    void load();
  }

  async function markLost(lead: Lead) {
    // The server requires a reason; asking here means the refusal never happens.
    const reason = prompt(`Why was ${lead.name} lost? This is what you read back at review time.`);
    if (!reason?.trim()) return;
    setBusy(lead.id);
    const res = await updateLead(lead.id, { stage: "LOST", lostReason: reason.trim() });
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    toast.success(`${lead.name} marked lost.`);
    void load();
  }

  async function newLead() {
    const name = prompt("Client name:");
    if (!name?.trim()) return;
    const phone = prompt("Phone or email — they need one, or you cannot follow up:");
    if (!phone?.trim()) return toast.error("A lead needs a phone number or an email address.");
    const interestedIn = prompt("What are they after?") ?? undefined;
    const budgetRaw = prompt(`Budget in ${currency} (optional):`);
    const budget = budgetRaw ? Number(budgetRaw.replace(/[^\d]/g, "")) : undefined;
    const isEmail = phone.includes("@");
    const res = await createLead({
      name: name.trim(),
      ...(isEmail ? { email: phone.trim() } : { phone: phone.trim() }),
      interestedIn, budget, currency,
    });
    if (res.error) return toast.error(res.error.message);
    toast.success(`Logged ${name.trim()}.`);
    void load();
  }

  async function book(lead: Lead) {
    const when = prompt("When? (YYYY-MM-DD HH:MM)", new Date(Date.now() + 864e5).toISOString().slice(0, 16).replace("T", " "));
    if (!when) return;
    const iso = new Date(when.replace(" ", "T")).toISOString();
    const res = await scheduleViewing({ leadId: lead.id, scheduledAt: iso, propertyId: lead.propertyId ?? undefined });
    if (res.error) return toast.error(res.error.message);
    toast.success(`Viewing booked for ${lead.name}.`);
    void load();
  }

  async function closeViewing(v: Viewing, status: "COMPLETED" | "CANCELLED" | "NO_SHOW") {
    const outcome = status === "COMPLETED" ? prompt("How did it go?") ?? undefined : undefined;
    setBusy(v.id);
    const res = await updateViewing(v.id, { status, outcome });
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    void load();
  }

  const Refusals = () => refused.length === 0 ? null : (
    <div className="portal-note bad">{refused.map((r) => <div key={r}>{r}</div>)}</div>
  );

  return (
    <PortalShell
      title="Agent portal"
      subtitle="Your leads, viewings and pipeline"
      badge={leads ? `${open.length} open` : "Loading…"}
      tabs={[
        {
          key: "overview", label: "Overview", render: () => leads === null ? <Loading /> : (
            <>
              <Refusals />
              <div className="kpis">
                <Kpi value={String(open.length)} label="Open leads" />
                <Kpi value={money(pipelineValue, currency)} label="Pipeline value" />
                <Kpi value={String(upcoming.length)} label="Viewings booked" />
                <Kpi value={String(won.length)} label="Closed" />
              </div>
              <div className="portal-note">
                Pipeline value counts open leads only — closed and lost deals are excluded.
              </div>
              <h3 className="portal-h3">Needs a call</h3>
              {open.length === 0
                ? <Empty icon="📋" title="Nothing open" hint="New enquiries appear here." />
                : open
                    .slice()
                    .sort((a, b) => (a.lastContactAt ?? "").localeCompare(b.lastContactAt ?? ""))
                    .slice(0, 6)
                    .map((l) => (
                      <div key={l.id} className="lrow">
                        <div style={{ flex: 1 }}>
                          <b>{l.name}</b>
                          <span>
                            {l.interestedIn ?? "No preference stated"}
                            {l.lastContactAt ? ` · last contact ${shortDate(l.lastContactAt)}` : " · never contacted"}
                          </span>
                        </div>
                        <StagePill s={l.stage} />
                      </div>
                    ))}
            </>
          ),
        },
        {
          key: "pipeline", label: "Pipeline", render: () => leads === null ? <Loading /> : (
            <>
              <Refusals />
              <div className="portal-h3 row-between">
                <span>Leads</span>
                {canAt(PERMISSIONS.LEAD_CREATE, null) && (
                  <button className="btn-mini" onClick={newLead}>+ Add lead</button>
                )}
              </div>
              {leads.length === 0 ? <Empty icon="👤" title="No leads yet" /> : leads.map((l) => (
                <div key={l.id} className="lrow">
                  <div className="lrow-av">{l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}>
                    <b>{l.name}</b>
                    <span>
                      {l.interestedIn ?? "—"}
                      {l.budget ? ` · ${money(l.budget, l.currency)}` : ""}
                      {l.phone ? ` · ${l.phone}` : l.email ? ` · ${l.email}` : ""}
                    </span>
                    {l.lostReason && <span className="bad">{l.lostReason}</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <StagePill s={l.stage} />
                    <div className="room-acts">
                      {nextStage(l.stage) && canAt(PERMISSIONS.LEAD_ADVANCE, l.propertyId) && (
                        <button disabled={busy === l.id} onClick={() => advance(l)}>
                          → {STAGE_LABEL[nextStage(l.stage)!]}
                        </button>
                      )}
                      {l.stage !== "CLOSED" && l.stage !== "LOST" && canAt(PERMISSIONS.VIEWING_SCHEDULE, l.propertyId) && (
                        <button disabled={busy === l.id} onClick={() => book(l)}>Book viewing</button>
                      )}
                      {l.stage !== "CLOSED" && l.stage !== "LOST" && canAt(PERMISSIONS.LEAD_ADVANCE, l.propertyId) && (
                        <button disabled={busy === l.id} onClick={() => markLost(l)}>Lost</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "viewings", label: "Viewings", render: () => viewings === null ? <Loading /> : (
            <>
              <Refusals />
              {viewings.length === 0 ? <Empty icon="🗓️" title="No viewings booked" /> : viewings.map((v) => (
                <div key={v.id} className="lrow">
                  <div style={{ flex: 1 }}>
                    <b>{v.clientName}</b>
                    <span>
                      {dateTime(v.scheduledAt)} · {v.durationMins} min
                      {v.property ? ` · ${v.property.name}` : v.listing ? ` · ${v.listing.title}` : ""}
                    </span>
                    {v.outcome && <span>{v.outcome}</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <ViewingPill s={v.status} />
                    {v.status === "SCHEDULED" && canAt(PERMISSIONS.VIEWING_UPDATE, v.propertyId) && (
                      <div className="room-acts">
                        <button disabled={busy === v.id} onClick={() => closeViewing(v, "COMPLETED")}>Done</button>
                        <button disabled={busy === v.id} onClick={() => closeViewing(v, "NO_SHOW")}>No show</button>
                        <button disabled={busy === v.id} onClick={() => closeViewing(v, "CANCELLED")}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}

function StagePill({ s }: { s: LeadStage }) {
  const tone = {
    NEW: "amber", CONTACTED: "blue", VIEWING: "blue",
    OFFER: "amber", RESERVED: "green", CLOSED: "green", LOST: "red",
  } as const;
  return <Pill tone={tone[s]}>{STAGE_LABEL[s]}</Pill>;
}

function ViewingPill({ s }: { s: Viewing["status"] }) {
  const m = {
    SCHEDULED: ["blue", "Scheduled"], COMPLETED: ["green", "Completed"],
    CANCELLED: ["grey", "Cancelled"], NO_SHOW: ["red", "No show"],
  } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
