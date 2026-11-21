import type { Metadata } from "next";
import { layoutMetadata } from "@/lib/meta";
import { TeacherShell } from "@/components/teacher/shell";

export async function generateMetadata(): Promise<Metadata> {
  return layoutMetadata("meta.title.teacher");
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
