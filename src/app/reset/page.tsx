import { Suspense } from "react";
import { ResetPassword } from "@/components/auth/ResetPassword";

export const metadata = {
  title: "Choose a new password — PALTAS",
  // A reset link is private to one person; it has no business in an index.
  robots: { index: false, follow: false },
};

export default function ResetPage() {
  // useSearchParams needs a boundary, and the token is only readable in the
  // browser anyway — this page is never usefully prerendered.
  return (
    <Suspense fallback={<main className="auth-page" />}>
      <ResetPassword />
    </Suspense>
  );
}
