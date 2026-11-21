import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { Suspense } from "react";
import { PublicShell } from "@/components/public/public-shell";
import { AuthForm } from "@/components/public/auth-form";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.signup");
}

export default function SignupPage() {
  return (
    <PublicShell>
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </PublicShell>
  );
}
