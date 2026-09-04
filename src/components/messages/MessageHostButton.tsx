"use client";

import { useState } from "react";
import { useGuest } from "@/components/booking/GuestProvider";

/**
 * "Message host", on a listing.
 *
 * The listing id is all it sends. The host is derived from it on the server —
 * a button that named its own recipient would be a way to message anybody on
 * the platform, which is why the endpoint refuses to be told.
 */
export function MessageHostButton({ listingId }: { listingId: string }) {
  const { guest } = useGuest();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Signed out there is nothing useful to offer: the thread has to belong to
  // somebody. The header's sign-in is a click away and says so itself.
  if (!guest) return null;

  async function open() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) { setError(payload?.error?.message ?? "Could not open that conversation."); return; }
      window.location.assign(`/messages?thread=${payload.threadId}`);
    } catch {
      setError("Could not reach PALTAS. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn secondary host-message" onClick={() => void open()} disabled={busy}>
        {busy ? "Opening…" : "Message host"}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}
