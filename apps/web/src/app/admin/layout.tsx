import type { Metadata } from "next";
import { layoutMetadata } from "@/lib/meta";
import { TeacherShell } from "@/components/teacher/shell";

export async function generateMetadata(): Promise<Metadata> {
  return layoutMetadata("meta.title.admin");
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
