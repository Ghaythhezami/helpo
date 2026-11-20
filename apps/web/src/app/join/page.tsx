import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinPage } from "@/components/student/join-page";

export const metadata: Metadata = { title: "Join your class" };

export default function Join() {
  return (
    <Suspense fallback={null}>
      <JoinPage />
    </Suspense>
  );
}
