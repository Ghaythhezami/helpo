import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicShell } from "@/components/public/public-shell";
import { AuthForm } from "@/components/public/auth-form";

export const metadata: Metadata = { title: "Teacher sign-in" };

export default function LoginPage() {
  return (
    <PublicShell>
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </PublicShell>
  );
}
