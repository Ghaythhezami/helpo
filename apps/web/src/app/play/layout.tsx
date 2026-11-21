import type { Metadata } from "next";
import { PlayFrame } from "@/components/student/frame";

export const metadata: Metadata = { title: { default: "Play", template: "%s · Nibras" } };

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <PlayFrame>{children}</PlayFrame>;
}
