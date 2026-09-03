"use client";

import { useId, useState } from "react";

/**
 * One set of parts for every authentication form on PALTAS.
 *
 * There were three — the guest modal, the management sign-in, and the account
 * step inside checkout — each with its own markup and its own styles in two
 * different stylesheets. They looked like three different products, and the
 * management one lived in manage.css where the marketplace could not reach it.
 *
 * Signing in is often the first thing a person does on the platform and
 * frequently the only thing they do twice. It is worth looking the same every
 * time, and worth only being built once.
 */

export function AuthCard({
  brand, title, subtitle, children, onSubmit, footer,
}: {
  /** The small mark above the title — "PALTAS" and a context word. */
  brand?: { name: string; context?: string };
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  footer?: React.ReactNode;
}) {
  return (
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      {brand && (
        <div className="auth-brand">
          <b>{brand.name}</b>
          {brand.context && <small>{brand.context}</small>}
        </div>
      )}
      <h1 className="auth-title">{title}</h1>
      {subtitle && <p className="auth-sub">{subtitle}</p>}
      <div className="auth-fields">{children}</div>
      {footer && <div className="auth-footer">{footer}</div>}
    </form>
  );
}

/** Two tabs — create an account, or sign in to one. */
export function AuthTabs({
  value, onChange, labels,
}: {
  value: "up" | "in";
  onChange: (v: "up" | "in") => void;
  labels: { up: string; in: string };
}) {
  return (
    <div className="auth-tabs" role="tablist">
      {(["up", "in"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          className={value === k ? "on" : ""}
          onClick={() => onChange(k)}
        >
          {labels[k]}
        </button>
      ))}
    </div>
  );
}

export function AuthField({
  label, type = "text", value, onChange, placeholder, autoComplete,
  required, hint, autoFocus, minLength,
}: {
  label: string;
  type?: "text" | "email" | "password" | "tel";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  autoFocus?: boolean;
  minLength?: number;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={isPassword ? "auth-input-wrap" : undefined}>
        <input
          id={id}
          // A revealed password is a text field, which is the only way the
          // browser will show the characters.
          type={isPassword && revealed ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          autoFocus={autoFocus}
        />
        {isPassword && (
          // Typing a long password blind on a phone is where people give up.
          <button
            type="button"
            className="auth-reveal"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            tabIndex={-1}
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && <small className="auth-hint">{hint}</small>}
    </div>
  );
}

/**
 * A refusal, said plainly.
 *
 * `role="alert"` so a screen reader announces it — an error nobody is told
 * about is the same as no error at all.
 */
export function AuthError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="auth-error" role="alert">
      <span aria-hidden="true">!</span>
      <span>{children}</span>
    </p>
  );
}

export function AuthSubmit({
  busy, children, busyLabel = "Please wait…",
}: {
  busy?: boolean;
  children: React.ReactNode;
  busyLabel?: string;
}) {
  return (
    <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? (<><span className="auth-spinner" aria-hidden="true" />{busyLabel}</>) : children}
    </button>
  );
}

/** The quieter second action — "I already have an account". */
export function AuthAlt({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="auth-alt" onClick={onClick}>
      {children}
    </button>
  );
}
