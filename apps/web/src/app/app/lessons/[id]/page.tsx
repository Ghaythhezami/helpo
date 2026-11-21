import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { Suspense } from "react";
import { Workspace } from "@/components/teacher/workspace";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.lesson");
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <Workspace id={id} />
    </Suspense>
  );
}
