"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ONBOARDING, ROLES, requiredDocuments, type Field, type RoleKey } from "./steps";

/**
 * The PALTAS onboarding form.
 *
 * One form, and the only one — the same route and the same endpoint it has
 * always used. What changed is that it now asks what the original design asked:
 * a role, then the questions that role actually implies, then verification.
 * Before this it was a single screen of four generic fields, and a developer
 * and a tenant were asked the same things.
 *
 * Selecting a role here requests access. It grants nothing: the account stays
 * PENDING, the documents stay unreviewed, and an approver decides. That is why
 * the role picker can be this open.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<RoleKey | "">("");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<{ type: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploadsAvailable, setUploadsAvailable] = useState(true);

  // Signed out, or already through — either way this form is not the place to
  // be. The endpoint is the one that knows; asking it avoids a second opinion.
  useEffect(() => {
    void fetch("/api/onboarding").then(async (response) => {
      if (response.status === 401) { router.replace("/"); return; }
      const payload = await response.json().catch(() => null);
      if (payload?.role) setRole(payload.role as RoleKey);
      if (payload?.profile?.name) setData((d) => ({ name: payload.profile.name, phone: payload.profile.phone ?? "", ...d }));
      if (payload?.onboardingCompleted) setPending(true);
      if (payload && payload.uploadsAvailable === false) setUploadsAvailable(false);
    });
  }, [router]);

  const steps = role ? ONBOARDING[role] : [];
  const current = steps[step];
  const isLast = role !== "" && step === steps.length - 1;
  const needed = role ? requiredDocuments(role) : [];
  const held = new Set(documents.map((d) => d.type));
  const missing = needed.filter((type) => !held.has(type));

  function set(key: string, value: string) {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
  }

  /** Every required field on the step in front of them, before they leave it. */
  function incomplete(fields: Field[]): Field | undefined {
    return fields.find((f) => f.required && !(data[f.k] ?? "").trim());
  }

  async function upload(type: "IDENTITY" | "OWNERSHIP", file: File) {
    setUploading(true); setError("");
    try {
      const init = await fetch("/api/verification/documents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, fileName: file.name, contentType: file.type, size: file.size }),
      });
      const start = await init.json().catch(() => null);
      if (!init.ok) return setError(start?.error?.message ?? "Could not start the document upload.");

      const put = await fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) return setError(`The document store refused the upload (${put.status}).`);

      const confirm = await fetch("/api/verification/documents", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: start.key, type, fileName: file.name, contentType: file.type }),
      });
      const result = await confirm.json().catch(() => null);
      if (!confirm.ok) return setError(result?.error?.message ?? "The document could not be confirmed.");
      setDocuments((current) => [...current.filter((d) => d.type !== type), { type, fileName: file.name }]);
    } catch {
      // The PUT above goes straight to the document store, on another origin.
      // A browser reports a blocked cross-origin request as a bare network
      // failure — "Load failed" in Safari — which tells the person nothing.
      setError("The upload could not reach the document store. This is usually the storage bucket's CORS rules, not your file.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      const { name, phone, country, ...details } = data;
      const response = await fetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, name, phone, country, details }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setError(payload?.error?.message ?? "Please check your details.");
      if (payload.pendingApproval) { setPending(true); return; }
      // Approved already — the server names the dashboard, not this page.
      window.location.assign(payload.destination ?? "/manage");
    } catch {
      setError("We could not reach PALTAS to save this. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return <main className="auth-page"><div className="auth-card">
      <h1 className="auth-title">Thank you — you&apos;re in the queue</h1>
      <p className="auth-sub">
        Your details and documents have been submitted. PALTAS reviews every account before
        access is granted, and you will be signed in to your dashboard once that is done.
      </p>
      <p className="auth-notice">Your access is pending verification and approval.</p>
    </div></main>;
  }

  if (!role) {
    return <main className="auth-page"><div className="auth-card">
      <p className="muted">Role → Details → Verification</p>
      <h1 className="auth-title">What best describes you?</h1>
      <p className="auth-sub">Your selection requests access. It does not grant permissions.</p>
      <div className="ob-roles">
        {ROLES.map((r) => (
          <button type="button" key={r.key} className="ob-role" onClick={() => { setRole(r.key); setStep(0); }}>
            <b>{r.label}</b><span>{r.blurb}</span>
          </button>
        ))}
      </div>
    </div></main>;
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={(e) => { e.preventDefault();
    const gap = incomplete(current.f);
    if (gap) return setError(`${gap.l || "This"} is required.`);
    if (isLast) {
      if (uploadsAvailable && missing.length) return setError(`Upload your ${missing.map((m) => m === "IDENTITY" ? "identity document" : "proof of ownership").join(" and ")} before submitting.`);
      return void submit();
    }
    setStep((s) => s + 1); setError("");
  }}>
    <p className="muted">{ROLES.find((r) => r.key === role)!.label} · Step {step + 1} of {steps.length}</p>
    <div className="ob-dots">{steps.map((_, i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>

    <h1 className="auth-title">{current.t}</h1>
    <p className="auth-sub">{current.d}</p>

    {current.f.map((f) => f.type === "check" ? (
      <label className="ob-check" key={f.k}>
        <input type="checkbox" checked={data[f.k] === "yes"} onChange={(e) => set(f.k, e.target.checked ? "yes" : "")} />
        <span>{f.text}</span>
      </label>
    ) : f.type === "select" ? (
      <label className="auth-field" key={f.k}>{f.l}
        <select value={data[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)}>
          <option value="">Select…</option>
          {f.opts!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    ) : (
      <label className="auth-field" key={f.k}>{f.l}
        <input type={f.type ?? "text"} value={data[f.k] ?? ""} placeholder={f.ph}
          maxLength={f.k === "country" ? 2 : undefined}
          onChange={(e) => set(f.k, e.target.value)} />
      </label>
    ))}

    {isLast && needed.length > 0 && !uploadsAvailable && (
      <p className="auth-notice">
        Document upload is temporarily unavailable. Submit your details now — PALTAS will
        contact you to collect your {needed.includes("OWNERSHIP") ? "identity and ownership documents" : "identity document"} before your account is approved.
      </p>
    )}
    {isLast && uploadsAvailable && needed.map((type) => (
      <label className="auth-field" key={type}>
        {type === "IDENTITY" ? "Identity document" : "Ownership / title deed"} (PDF, JPG or PNG, max 10 MB)
        <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(type, file); event.currentTarget.value = ""; }} />
        {held.has(type) && <span className="muted small">✓ {documents.find((d) => d.type === type)!.fileName} — awaiting review</span>}
      </label>
    ))}
    {isLast && uploadsAvailable && needed.length > 0 && (
      <p className="muted small">Documents are private and visible only to authorized reviewers.</p>
    )}

    {error && <p className="auth-error">{error}</p>}

    <div className="ob-actions">
      {step > 0 && <button type="button" className="btn secondary" onClick={() => { setStep((s) => s - 1); setError(""); }}>Back</button>}
      <button className="btn btn-primary" disabled={busy || uploading}>
        {busy ? "Saving…" : uploading ? "Uploading…" : isLast ? "Finish and submit" : "Continue"}
      </button>
    </div>
  </form></main>;
}
