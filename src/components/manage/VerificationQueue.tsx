"use client";

import { useEffect, useState } from "react";

interface VerificationDocument {
  id: string; type: string; fileName: string; size: number; createdAt: string;
  user: { name: string; email: string; requestedRole: string | null };
}

export function VerificationQueue() {
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/platform/verification", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message ?? "Could not load verification queue.");
    setDocuments(payload.documents ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    const reviewNote = status === "REJECTED" ? window.prompt("Reason for rejection") ?? "" : "";
    if (status === "REJECTED" && !reviewNote.trim()) return;
    const response = await fetch(`/api/platform/verification?id=${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNote }) });
    if (!response.ok) { const payload = await response.json().catch(() => null); setError(payload?.error?.message ?? "Could not review document."); return; }
    await load();
  }

  async function openDocument(id: string) {
    const response = await fetch("/api/platform/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message ?? "Could not open document.");
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  return <div>
    <h2 className="section-title">Verification queue</h2>
    {error && <p className="muted">{error}</p>}
    {!error && documents.length === 0 && <p className="muted">No documents awaiting review.</p>}
    {documents.length > 0 && <div className="table-wrap"><table className="table"><thead><tr><th>Applicant</th><th>Type</th><th>Document</th><th /></tr></thead><tbody>
      {documents.map((document) => <tr key={document.id}><td><b>{document.user.name}</b><span className="sub">{document.user.email}</span></td><td>{document.type.toLowerCase()}</td><td><button className="link" onClick={() => void openDocument(document.id)}>{document.fileName}</button><span className="sub">{Math.ceil(document.size / 1024)} KB</span></td><td><button className="btn btn-primary small" onClick={() => void review(document.id, "APPROVED")}>Approve</button> <button className="btn small" onClick={() => void review(document.id, "REJECTED")}>Reject</button></td></tr>)}
    </tbody></table></div>}
  </div>;
}