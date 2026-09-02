"use client";

import { useEffect, useState } from "react";
import type { Project, ProjectUnit, DeveloperLead } from "@/lib/models";
import { getProjects, getProjectUnits, getDeveloperLeads, markUnitSold } from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useToast } from "@/components/ui/Toast";

export function DeveloperPortal() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [leads, setLeads] = useState<DeveloperLead[] | null>(null);
  const [openProject, setOpenProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<ProjectUnit[] | null>(null);
  const toast = useToast();
  const [tab, setTab] = useState("overview");

  async function loadProjects() { setProjects((await getProjects()).data); }
  useEffect(() => { loadProjects(); getDeveloperLeads().then((r) => setLeads(r.data)); }, []);

  function flash(m: string) { toast.success(m); }
  async function openUnits(p: Project) { setOpenProject(p); setUnits(null); setTab("units"); setUnits((await getProjectUnits(p.id)).data); }
  async function sell(u: ProjectUnit) {
    await markUnitSold(u.id);
    if (openProject) setUnits((await getProjectUnits(openProject.id)).data);
    loadProjects();
    flash(`${u.unitNo} marked sold`);
  }

  const totalUnits = projects?.reduce((a, p) => a + p.totalUnits, 0) ?? 0;
  const totalSold = projects?.reduce((a, p) => a + p.sold, 0) ?? 0;
  const revenue = projects?.reduce((a, p) => a + p.revenue, 0) ?? 0;

  return (
    <>
      <PortalShell
        title="Developer portal" subtitle="Projects, units, sales & leads" badge="Verified developer"
        activeKey={tab} onTabChange={setTab}
        tabs={[
          {
            key: "overview", label: "Overview", render: () => projects === null ? <Loading /> : (
              <>
                <div className="kpis">
                  <Kpi value={String(projects.length)} label="Projects" />
                  <Kpi value={`${totalSold}/${totalUnits}`} label="Units sold" />
                  <Kpi value={`KSh ${Math.round(revenue / 1_000_000)}M`} label="Total revenue" />
                  <Kpi value={String(leads?.length ?? 0)} label="Active leads" />
                </div>
                <h3 className="portal-h3">Projects</h3>
                {projects.map((p) => (
                  <button key={p.id} className="proj-card" onClick={() => openUnits(p)}>
                    <div className="proj-top"><b>{p.name}</b><ProjectPill s={p.status} /></div>
                    <span className="proj-loc">{p.location}</span>
                    <div className="proj-bar"><div className="proj-bar-fill" style={{ width: `${p.completion}%` }} /></div>
                    <div className="proj-stats">
                      <span>{p.sold}/{p.totalUnits} sold</span>
                      <span>{p.available} available</span>
                      <span>KSh {Math.round(p.revenue / 1_000_000)}M</span>
                      <span>{p.completion}% built</span>
                    </div>
                  </button>
                ))}
              </>
            ),
          },
          {
            key: "units", label: "Units", render: () => (
              <>
                {openProject ? (
                  <>
                    <div className="portal-h3 row-between"><span>{openProject.name} — units</span><button className="btn-mini" onClick={() => { setOpenProject(null); setUnits(null); }}>← All projects</button></div>
                    {units === null ? <Loading /> : units.map((u) => (
                      <div key={u.id} className="lrow">
                        <div style={{ flex: 1 }}><b>{u.unitNo}</b><span>{u.type} · KSh {u.price.toLocaleString()}</span></div>
                        {u.status === "sold" ? <Pill tone="blue">Sold</Pill> : u.status === "reserved" ? <Pill tone="amber">Reserved</Pill> : <button className="btn-mini" onClick={() => sell(u)}>Mark sold</button>}
                      </div>
                    ))}
                  </>
                ) : projects === null ? <Loading /> : (
                  <Empty icon="🏢" title="Pick a project" hint="Open a project from Overview to manage its units." />
                )}
              </>
            ),
          },
          {
            key: "leads", label: "Sales leads", render: () => leads === null ? <Loading /> : leads.length === 0 ? <Empty icon="🎯" title="No leads yet" /> : (
              <>
                {leads.map((l) => (
                  <div key={l.id} className="lrow">
                    <div className="lrow-av">{l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                    <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.project} · KSh {l.value.toLocaleString()}</span></div>
                    <DevLeadPill s={l.stage} />
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

function ProjectPill({ s }: { s: Project["status"] }) {
  const m = { planning: ["grey", "Planning"], selling: ["green", "Selling"], completed: ["blue", "Completed"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
function DevLeadPill({ s }: { s: DeveloperLead["stage"] }) {
  const m = { enquiry: ["grey", "Enquiry"], reserved: ["amber", "Reserved"], deposit: ["blue", "Deposit paid"], completed: ["green", "Completed"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
