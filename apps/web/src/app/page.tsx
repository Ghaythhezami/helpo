import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { PublicShell } from "@/components/public/public-shell";
import { Landing } from "@/components/public/landing";

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await pageMetadata("meta.title.home")), description: undefined };
}

export default function LandingPage() {
  return (
    <PublicShell>
      <Landing />
    </PublicShell>
  );
}
