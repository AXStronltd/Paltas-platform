"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

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
        const destination = audience === "staff"
          ? ({ developer: "/portal/developer", landlord: "/portal/landlord", agent: "/portal/agent", hotel: "/portal/hotel", seller: "/portal/seller" } as Record<string, string>)[payload?.dashboardRole ?? ""] ?? "/manage"
          : "/";
        window.location.assign(destination);
      } catch (reason) {
        if (active) setMessage(reason instanceof Error ? reason.message : "The sign-in session could not be completed.");
      }
    })();
    return () => { active = false; };
  }, [params]);

  return <main className="auth-page"><div className="auth-card"><p className="auth-sub">{message}</p></div></main>;
}