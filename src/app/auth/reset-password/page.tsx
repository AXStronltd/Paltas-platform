import { Suspense } from "react";
import { ResetPassword } from "@/components/auth/ResetPassword";

export const metadata = {
  title: "Choose a new password — PALTAS",
  robots: { index: false, follow: false },
};

export default function SupabaseResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-page" />}>
      <ResetPassword />
    </Suspense>
  );
}