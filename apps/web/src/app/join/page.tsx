import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { Suspense } from "react";
import { JoinPage } from "@/components/student/join-page";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.join");
}

export default function Join() {
  return (
    <Suspense fallback={null}>
      <JoinPage />
    </Suspense>
  );
}
