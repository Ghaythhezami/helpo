import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicShell } from "@/components/public/public-shell";
import { AuthForm } from "@/components/public/auth-form";

export const metadata: Metadata = { title: "Create a teacher account" };

export default function SignupPage() {
  return (
    <PublicShell>
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </PublicShell>
  );
}
