import type { Metadata } from "next";
import { TeacherShell } from "@/components/teacher/shell";

export const metadata: Metadata = { title: { default: "Teacher", template: "%s · Nibras" } };

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
