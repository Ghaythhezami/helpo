import type { Metadata } from "next";
import { PublicShell } from "@/components/public/public-shell";
import { Landing } from "@/components/public/landing";

export const metadata: Metadata = { title: { absolute: "Nibras: lesson kits made friendly" } };

export default function LandingPage() {
  return (
    <PublicShell>
      <Landing />
    </PublicShell>
  );
}
