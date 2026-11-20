import type { Metadata } from "next";
import { Suspense } from "react";
import { SelfPacedPage } from "@/components/student/self-paced-page";

export const metadata: Metadata = { title: "Quiz" };

export default async function SelfPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return (
    <Suspense fallback={null}>
      <SelfPacedPage sessionId={(await params).sessionId} />
    </Suspense>
  );
}
