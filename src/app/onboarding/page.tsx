"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const roles = [
  ["developer", "Developer"],
  ["landlord", "Landlord"],
  ["agent", "Agent"],
  ["hotel", "Hotel"],
  ["seller", "Seller"],
  ["resident", "Tenant / Resident"],
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<(typeof roles)[number][0] | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [details, setDetails] = useState("");
  const [documents, setDocuments] = useState<{ type: string; fileName: string; status: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void fetch("/api/onboarding").then(async (response) => { if (response.status === 401) router.replace("/"); }); }, [router]);

  async function upload(type: "IDENTITY" | "OWNERSHIP" | "SUPPORTING", file: File) {
    setUploading(true); setError("");
    const init = await fetch("/api/verification/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, fileName: file.name, contentType: file.type, size: file.size }) });
    const start = await init.json().catch(() => null);
    if (!init.ok) { setUploading(false); return setError(start?.error?.message ?? "Could not start document upload."); }
    const put = await fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!put.ok) { setUploading(false); return setError("The document could not be uploaded."); }
    const confirm = await fetch("/api/verification/documents", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: start.key, type, fileName: file.name, contentType: file.type }) });
    const result = await confirm.json().catch(() => null);
    setUploading(false);
    if (!confirm.ok) return setError(result?.error?.message ?? "The document could not be confirmed.");
    setDocuments((current) => [...current, { type, fileName: file.name, status: "PENDING" }]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, name, phone, country, details: { notes: details } }) });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return setError(payload?.error?.message ?? "Please check your details.");
    router.replace(payload.pendingApproval ? "/onboarding?pending=1" : "/manage");
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={submit}>
    <p className="muted">Account → Role → Personal information → Review</p>
    <h1 className="auth-title">What best describes you?</h1>
    <p className="auth-sub">Your selection requests access. It does not grant permissions.</p>
    <div className="auth-tabs">{roles.map(([value, label]) => <button type="button" key={value} className={role === value ? "on" : ""} onClick={() => setRole(value)}>{label}</button>)}</div>
    <label className="auth-field">Full name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
    <label className="auth-field">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
    <label className="auth-field">Country<input value={country} onChange={(event) => setCountry(event.target.value)} maxLength={2} placeholder="KE" required /></label>
    {role && <label className="auth-field">{role === "resident" ? "Property and unit" : role === "agent" ? "Agency and service area" : role === "hotel" ? "Hotel and room portfolio" : role === "developer" ? "Projects and unit portfolio" : role === "seller" ? "Property you are selling" : "Property ownership and portfolio"}<textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} /></label>}
    {role && role !== "resident" && <>
      <label className="auth-field">Identity document (PDF, JPG or PNG, max 10 MB)<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("IDENTITY", file); event.currentTarget.value = ""; }} /></label>
      {role === "landlord" && <label className="auth-field">Ownership / title deed (PDF, JPG or PNG, max 10 MB)<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload("OWNERSHIP", file); event.currentTarget.value = ""; }} /></label>}
      <p className="muted small">{documents.length ? `${documents.length} document${documents.length === 1 ? "" : "s"} uploaded and awaiting review.` : "Documents are private and visible only to authorized reviewers."}</p>
    </>}
    {error && <p className="auth-error">{error}</p>}
    <button className="btn btn-primary" disabled={busy || !role}>{busy ? "Saving…" : "Continue"}</button>
    {new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").has("pending") && <p className="auth-notice">Your account has been created. Your access is pending verification/approval.</p>}
  </form></main>;
}