import type { Metadata } from "next";
import { Suspense } from "react";
import { Workspace } from "@/components/teacher/workspace";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <Workspace id={id} />
    </Suspense>
  );
}
