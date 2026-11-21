import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { Suspense } from "react";
import { SelfPacedPage } from "@/components/student/self-paced-page";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.quiz");
}

export default async function SelfPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return (
    <Suspense fallback={null}>
      <SelfPacedPage sessionId={(await params).sessionId} />
    </Suspense>
  );
}
