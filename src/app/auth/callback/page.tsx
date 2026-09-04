"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseEnterStaff } from "@/lib/supabase/auth";
import { staffDestination } from "@/lib/auth/destination";

export default function AuthCallbackPage() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Completing sign in...");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          if (active) setMessage(error?.message ?? "The sign-in session could not be completed.");
          return;
        }
        const audience = params.get("audience") === "staff"
          ? "staff"
          : window.localStorage.getItem("paltas_oauth_audience") === "staff" ? "staff" : "guest";
        window.localStorage.removeItem("paltas_oauth_audience");
        const response = await fetch("/api/auth/supabase/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: data.session.access_token, audience }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          if (active) setMessage(payload?.error?.message ?? "Your account is not ready for PALTAS yet.");
          return;
        }
        // Onboarding first, exactly as the password form does. Without this the
        // Google half of sign-in sent people at a dashboard that would only
        // bounce them back here, and a brand-new account — which has no role
        // and no approval — landed on /manage with nothing on it.
        let destination = "/";
        if (audience === "staff") {
          destination = staffDestination(payload);
        } else if (payload?.staff) {
          // "Continue with Google" from the marketplace header, by someone who
          // also holds a PALTAS account. Same treatment as the password form:
          // establish the staff session too, then send them to the onboarding
          // form or their dashboard rather than back to the shopfront.
          const staff = await supabaseEnterStaff();
          if (!("error" in staff && staff.error)) destination = staffDestination(staff.data);
        }
        window.location.assign(destination);
      } catch (reason) {
        if (active) setMessage(reason instanceof Error ? reason.message : "The sign-in session could not be completed.");
      }
    })();
    return () => { active = false; };
  }, [params]);

  return <main className="auth-page"><div className="auth-card"><p className="auth-sub">{message}</p></div></main>;
}