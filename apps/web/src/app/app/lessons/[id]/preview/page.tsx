import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { PreviewAsStudent } from "@/components/teacher/preview-student";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.preview");
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <PreviewAsStudent id={(await params).id} />;
}
