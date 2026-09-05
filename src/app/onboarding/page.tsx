"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ONBOARDING, ROLES, COUNTRY_CODES, requiredDocuments, type Field, type RoleKey } from "./steps";
import { currencyForCountry } from "@/lib/i18n/countries";

/**
 * The PALTAS onboarding form.
 *
 * One form, and the only one — the same route and the same endpoint it has
 * always used. What changed is that it now asks what the original design asked:
 * a role, then the questions that role actually implies, then the business half
 * for the roles that are businesses, then verification.
 *
 * Finishing it grants access. The account is activated by the submission
 * itself, so the last screen is the dashboard rather than a queue.
 */

/** Multi-value answers live in the same flat string map, joined on "|". */
const SEP = "|";
const many = (value: string | undefined): string[] => (value ? value.split(SEP).filter(Boolean) : []);
const joinMany = (values: string[]): string => values.join(SEP);

/** Country and currency names in the reader's own language, not ours. */
function useNames() {
  return useMemo(() => {
    const region = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(undefined, { type: "region" }) : null;
    const currency = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(undefined, { type: "currency" }) : null;
    return {
      country: (code: string) => { try { return region?.of(code) ?? code; } catch { return code; } },
      currency: (code: string) => { try { return currency?.of(code) ? `${code} — ${currency.of(code)}` : code; } catch { return code; } },
    };
  }, []);
}

const TIMEZONES: string[] = (() => {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return supported ? supported("timeZone") : [];
  } catch { return []; }
})();

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const names = useNames();
  const [role, setRole] = useState<RoleKey | "">("");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<{ type: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [uploadsAvailable, setUploadsAvailable] = useState(true);
  const [ready, setReady] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRefs = useRef<Record<string, HTMLElement | null>>({});
  /** Skips the heading-focus effect on the very first render of the form. */
  const entered = useRef(false);

  // Signed out, or already through — either way this form is not the place to
  // be. The endpoint is the one that knows; asking it avoids a second opinion.
  //
  // It also carries the draft. Someone who closed the tab on step 4 is put
  // back on step 4 with what they had typed, which is the whole point of the
  // autosave below.
  useEffect(() => {
    void fetch("/api/onboarding").then(async (response) => {
      if (response.status === 401) { router.replace("/"); return; }
      const payload = await response.json().catch(() => null);
      if (payload?.role) setRole(payload.role as RoleKey);
      const saved = (payload?.profile?.onboardingData ?? {}) as Record<string, unknown>;
      const restored: Record<string, string> = {};
      for (const [key, value] of Object.entries(saved)) {
        if (key === "currentStep") continue;
        if (typeof value === "string") restored[key] = value;
      }
      if (payload?.profile?.name) restored.name = restored.name || payload.profile.name;
      if (payload?.profile?.phone) restored.phone = restored.phone || payload.profile.phone;
      setData((d) => ({ ...restored, ...d }));
      const at = Number(saved.currentStep);
      if (Number.isFinite(at) && at > 0) setStep(at);
      if (payload?.onboardingCompleted) setDone(true);
      if (payload && payload.uploadsAvailable === false) setUploadsAvailable(false);
      setReady(true);
    }).catch(() => setReady(true));
  }, [router]);

  // Memoised on the role, because the defaults effect below depends on it. A
  // fresh array each render would make that effect run on every render, and it
  // calls setData — which renders again.
  const steps = useMemo(() => (role ? ONBOARDING[role] : []), [role]);
  const current = steps[Math.min(step, Math.max(steps.length - 1, 0))];
  const isLast = role !== "" && step === steps.length - 1;
  const needed = role ? requiredDocuments(role) : [];
  const held = new Set(documents.map((d) => d.type));
  const missing = needed.filter((type) => !held.has(type));

  /**
   * Defaults, and the "don't ask twice" rule that produces most of them.
   *
   * Country, currency and timezone are asked once and reused. Anything the
   * person has already answered is left exactly as they left it — this only
   * ever fills a blank.
   */
  useEffect(() => {
    if (!role || !ready) return;
    setData((d) => {
      const next = { ...d };
      const home = next.regCountry || next.country || "";
      for (const s of steps) for (const f of s.f) if (f.def && !next[f.k]) next[f.k] = f.def;
      if (!next.timezone && TIMEZONES.length) {
        try { next.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* keep unset */ }
      }
      if (!next.dateFormat && home) next.dateFormat = home === "US" ? "MM/DD/YYYY" : "DD/MM/YYYY";
      if (!next.currency && home) next.currency = currencyForCountry(home) ?? "";
      if (!next.operatingCountries && home) next.operatingCountries = home;
      if (!next.propCountry) next.propCountry = many(next.operatingCountries)[0] ?? home;
      // Return the identical object when nothing was filled in. Handing back a
      // new one every time is a re-render, and this effect depends on values it
      // would then be re-reading — the loop is silent and the page is dead.
      const changed = Object.keys(next).some((k) => next[k] !== d[k]) || Object.keys(next).length !== Object.keys(d).length;
      return changed ? next : d;
    });
  }, [role, ready, steps, data.regCountry, data.country, data.operatingCountries]);

  /** The step heading takes focus, so a screen reader announces the move. */
  useEffect(() => {
    if (!entered.current) { entered.current = Boolean(role); return; }
    headingRef.current?.focus();
  }, [step, role]);

  /** One field's complaint, written as something to do rather than a verdict. */
  const validate = useCallback((f: Field, raw: string): string => {
    const value = (raw ?? "").trim();
    if (f.type === "checks" || f.type === "countries") {
      if (f.required && many(value).length === 0) {
        return f.type === "countries" ? "Choose at least one country." : "Choose at least one option.";
      }
      return "";
    }
    if (f.type === "toggle" || f.type === "check") {
      return f.required && value !== "yes" ? "Please tick this to continue." : "";
    }
    if (!value) return f.required ? `${f.l || "This"} is required.` : "";
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return "Enter a valid email address, like name@company.com";
    }
    if (f.type === "url") {
      try {
        const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        if (!parsed.hostname.includes(".")) return "Enter a full web address, like https://example.com";
      } catch { return "Enter a full web address, like https://example.com"; }
    }
    if (f.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) return "Enter a number.";
      if (f.min !== undefined && n < f.min) return `Enter ${f.min} or more.`;
    }
    if (f.k === "country" && value.length !== 2) return "Use the two-letter country code, like KE.";
    return "";
  }, []);

  function set(key: string, value: string) {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
    // Clear a complaint as soon as it stops being true, but do not start
    // complaining mid-word: validation on every keystroke tells someone their
    // email is invalid before they have finished writing it.
    setFieldErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  }

  function toggleMany(key: string, option: string) {
    const held = new Set(many(data[key]));
    if (held.has(option)) held.delete(option); else held.add(option);
    set(key, joinMany([...held]));
  }

  /** Whole step, on Continue. Returns the first offending key, if any. */
  function checkStep(fields: Field[]): string {
    const found: Record<string, string> = {};
    for (const f of fields) found[f.k] = validate(f, data[f.k] ?? "");
    setFieldErrors((e) => ({ ...e, ...found }));
    setTouched((t) => ({ ...t, ...Object.fromEntries(fields.map((f) => [f.k, true])) }));
    return fields.find((f) => found[f.k])?.k ?? "";
  }

  /**
   * Save on every step change, not only at the end.
   *
   * Best-effort by design: a failed autosave must not block someone from
   * carrying on with the form, so nothing here is awaited or surfaced.
   */
  const saveProgress = useCallback((atStep: number, answers: Record<string, string>) => {
    if (!role) return;
    void fetch("/api/onboarding", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, step: atStep, details: answers }),
    }).catch(() => { /* the draft is a convenience, not the submission */ });
  }, [role]);

  function goTo(next: number) {
    setStep(next);
    setError("");
    saveProgress(next, data);
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
      setError(t("ob.uploadFailed"));
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
      // An account that was suspended or turned down before does not become
      // active by filling this in again, and says so rather than pretending.
      if (payload.pendingApproval) { setStalled(true); return; }
      setDone(true);
    } catch {
      setError(t("ob.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (stalled) {
    return <main className="auth-page"><div className="auth-card">
      <h1 className="auth-title">{t("ob.stalledTitle")}</h1>
      <p className="auth-sub">
        {t("ob.stalledSub")}
      </p>
      <p className="auth-notice">{t("ob.stalledNotice")}</p>
    </div></main>;
  }

  if (done) {
    const dashboard = role ? (ROLES.find((r) => r.key === role) ? `/portal/${role}` : "/manage") : "/manage";
    return <main className="auth-page"><div className="auth-card">
      <h1 className="auth-title">{t("ob.doneTitle")}</h1>
      <p className="auth-sub">
        {t("ob.doneSub")}
      </p>
      {/* Pointed at screens this application actually has. The patch named
          /properties, /documents and /settings, which belong to a different
          product — all three answer 404 here, and three dead ends is a worse
          welcome than no suggestions at all. */}
      <div className="ob-next">
        <a className="ob-nextcard" href="/manage/portfolio">
          <b>{t("ob.nextProperties")}</b>
          <span>{t("ob.nextPropertiesSub")}</span>
        </a>
        <a className="ob-nextcard" href="/manage/listings">
          <b>{t("ob.nextListing")}</b>
          <span>{t("ob.nextListingSub")}</span>
        </a>
        <a className="ob-nextcard" href="/manage/staff">
          <b>{t("ob.nextTeam")}</b>
          <span>{t("ob.nextTeamSub")}</span>
        </a>
      </div>
      <div className="ob-actions">
        <button className="btn btn-primary" onClick={() => window.location.assign(dashboard)}>{t("ob.goDashboard")}</button>
      </div>
    </div></main>;
  }

  if (!role) {
    return <main className="auth-page"><div className="auth-card">
      <p className="muted">{t("ob.steps")}</p>
      <h1 className="auth-title">{t("ob.whoTitle")}</h1>
      <p className="auth-sub">{t("ob.whoSub")}</p>
      <div className="ob-roles">
        {ROLES.map((r) => (
          <button type="button" key={r.key} className="ob-role" onClick={() => { setRole(r.key); setStep(0); }}>
            <b>{r.label}</b><span>{r.blurb}</span>
          </button>
        ))}
      </div>
    </div></main>;
  }

  if (!current) return <main className="auth-page"><div className="auth-card"><p className="muted">{t("ob.loading")}</p></div></main>;

  /** One field, with its label, help, and its error tied to it by id. */
  function renderField(f: Field) {
    const id = `ob-${f.k}`;
    const describedBy = [f.hint ? `${id}-hint` : "", touched[f.k] && fieldErrors[f.k] ? `${id}-err` : ""].filter(Boolean).join(" ");
    const invalid = Boolean(touched[f.k] && fieldErrors[f.k]);
    const blur = () => {
      setTouched((t) => ({ ...t, [f.k]: true }));
      setFieldErrors((e) => ({ ...e, [f.k]: validate(f, data[f.k] ?? "") }));
    };
    const optional = !f.required && f.type !== "toggle" && f.type !== "check";
    const label = <>{f.l}{optional && <span className="ob-optional"> Optional</span>}</>;

    const help = (
      <>
        {f.hint && <span className="ob-hint" id={`${id}-hint`}>{f.hint}</span>}
        {invalid && <span className="auth-error small" id={`${id}-err`} role="alert">{fieldErrors[f.k]}</span>}
      </>
    );

    const common = {
      id,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": invalid || undefined,
      onBlur: blur,
    } as const;

    if (f.type === "check") {
      return <div className="ob-fieldwrap" key={f.k}>
        <label className="ob-check" htmlFor={id}>
          <input {...common} type="checkbox" ref={(el) => { inputRefs.current[f.k] = el; }}
            checked={data[f.k] === "yes"} onChange={(e) => set(f.k, e.target.checked ? "yes" : "")} />
          <span>{f.text}</span>
        </label>
        {help}
      </div>;
    }

    if (f.type === "toggle") {
      return <div className="ob-fieldwrap" key={f.k}>
        <label className="ob-toggle" htmlFor={id}>
          <input {...common} type="checkbox" ref={(el) => { inputRefs.current[f.k] = el; }}
            checked={data[f.k] === "on"} onChange={(e) => set(f.k, e.target.checked ? "on" : "")} />
          <span className="ob-togglelabel">{f.l}</span>
        </label>
        {help}
      </div>;
    }

    if (f.type === "checks") {
      return <fieldset className="ob-fieldwrap ob-group" key={f.k} aria-describedby={describedBy || undefined}>
        <legend>{label}</legend>
        {f.opts!.map((o) => (
          <label className="ob-check" key={o}>
            <input type="checkbox" checked={many(data[f.k]).includes(o)}
              ref={(el) => { if (o === f.opts![0]) inputRefs.current[f.k] = el; }}
              onChange={() => toggleMany(f.k, o)} onBlur={blur} />
            <span>{o}{f.optHints?.[o] && <em className="ob-hint"> — {f.optHints[o]}</em>}</span>
          </label>
        ))}
        {help}
      </fieldset>;
    }

    if (f.type === "countries") {
      const chosen = many(data[f.k]);
      return <div className="ob-fieldwrap" key={f.k}>
        <label className="auth-field" htmlFor={id}>{label}
          <select {...common} value="" ref={(el) => { inputRefs.current[f.k] = el; }}
            onChange={(e) => { if (e.target.value) toggleMany(f.k, e.target.value); }}>
            <option value="">{t("ob.addCountry")}</option>
            {COUNTRY_CODES.filter((c) => !chosen.includes(c)).map((c) => (
              <option key={c} value={c}>{names.country(c)}</option>
            ))}
          </select>
        </label>
        {chosen.length > 0 && (
          <div className="ob-chips">
            {chosen.map((c) => (
              <button type="button" className="ob-chip" key={c} onClick={() => toggleMany(f.k, c)}
                aria-label={`Remove ${names.country(c)}`}>
                {names.country(c)} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        {help}
      </div>;
    }

    if (f.type === "select" || f.type === "country" || f.type === "timezone") {
      const options = f.type === "country" ? COUNTRY_CODES : f.type === "timezone" ? TIMEZONES : f.opts!;
      const labelFor = (o: string) =>
        f.type === "country" ? names.country(o) : f.k === "currency" ? names.currency(o) : o;
      return <div className="ob-fieldwrap" key={f.k}>
        <label className="auth-field" htmlFor={id}>{label}
          <select {...common} value={data[f.k] ?? ""} ref={(el) => { inputRefs.current[f.k] = el; }}
            onChange={(e) => set(f.k, e.target.value)}>
            <option value="">{t("ob.select")}</option>
            {options.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
          </select>
        </label>
        {help}
      </div>;
    }

    if (f.type === "textarea") {
      return <div className="ob-fieldwrap" key={f.k}>
        <label className="auth-field" htmlFor={id}>{label}
          <textarea {...common} rows={3} value={data[f.k] ?? ""} placeholder={f.ph}
            ref={(el) => { inputRefs.current[f.k] = el; }} onChange={(e) => set(f.k, e.target.value)} />
        </label>
        {help}
      </div>;
    }

    return <div className="ob-fieldwrap" key={f.k}>
      <label className="auth-field" htmlFor={id}>{label}
        <input {...common} type={f.type === "number" ? "number" : f.type === "url" ? "url" : f.type ?? "text"}
          value={data[f.k] ?? ""} placeholder={f.ph}
          min={f.min} maxLength={f.k === "country" ? 2 : undefined}
          ref={(el) => { inputRefs.current[f.k] = el; }}
          onChange={(e) => set(f.k, e.target.value)} />
      </label>
      {help}
    </div>;
  }

  return <main className="auth-page"><form className="auth-card" noValidate onSubmit={(e) => {
    e.preventDefault();
    const bad = checkStep(current.f);
    if (bad) {
      // Move focus to the first field with a problem, rather than leaving
      // someone to hunt for it in a step of eight.
      inputRefs.current[bad]?.focus();
      return;
    }
    if (isLast) {
      if (uploadsAvailable && missing.length) {
        return setError(`Upload your ${missing.map((m) => m === "IDENTITY" ? "identity document" : "proof of ownership").join(" and ")} before submitting.`);
      }
      return void submit();
    }
    goTo(step + 1);
  }}>
    <p className="muted">{ROLES.find((r) => r.key === role)!.label} · Step {step + 1} of {steps.length}</p>
    <div className="ob-dots">
      {steps.map((s, i) => (
        <button type="button" key={i} aria-label={`Step ${i + 1}: ${s.t}`} aria-current={i === step || undefined}
          className={`ob-dot${i <= step ? " on" : ""}`}
          // Completed steps are clickable so people can go back and correct
          // something without losing what they have typed since.
          disabled={i > step} onClick={() => i < step && goTo(i)} />
      ))}
    </div>

    <h1 className="auth-title" tabIndex={-1} ref={headingRef}>{current.t}</h1>
    <p className="auth-sub">{current.d}</p>
    {current.note && <p className="ob-note">{current.note}</p>}

    {current.f.map(renderField)}

    {isLast && needed.length > 0 && !uploadsAvailable && (
      <p className="auth-notice">
        Document upload is temporarily unavailable. Submit your details now — PALTAS will
        contact you to collect your {needed.includes("OWNERSHIP") ? "identity and ownership documents" : "identity document"} afterwards.
      </p>
    )}
    {isLast && uploadsAvailable && needed.map((type) => (
      <label className="auth-field" key={type}>
        {type === "IDENTITY" ? "Identity document" : "Ownership / title deed"} (PDF, JPG or PNG, max 10 MB)
        <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(type, file); event.currentTarget.value = ""; }} />
        {held.has(type) && <span className="muted small">✓ {documents.find((d) => d.type === type)!.fileName} — uploaded</span>}
      </label>
    ))}
    {isLast && uploadsAvailable && needed.length > 0 && (
      <p className="muted small">{t("ob.docsPrivate")}</p>
    )}

    {error && <p className="auth-error" role="alert">{error}</p>}

    <div className="ob-actions">
      {step > 0 && <button type="button" className="btn secondary" onClick={() => goTo(step - 1)}>Back</button>}
      <button className="btn btn-primary" disabled={busy || uploading}>
        {busy ? "Saving…" : uploading ? "Uploading…" : isLast ? "Finish and submit" : "Continue"}
      </button>
    </div>

    {current.skippable && !isLast && (
      <button type="button" className="ob-skip" onClick={() => goTo(step + 1)}>
        {current.skipLabel ?? "Skip for now"}
      </button>
    )}
  </form></main>;
}
