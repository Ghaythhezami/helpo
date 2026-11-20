import type { Metadata } from "next";
import { StudentFrame } from "@/components/student/frame";

export const metadata: Metadata = { title: { default: "Play", template: "%s · Nibras" } };

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <StudentFrame>{children}</StudentFrame>;
}
