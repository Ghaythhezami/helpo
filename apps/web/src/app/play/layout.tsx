import type { Metadata } from "next";
import { layoutMetadata } from "@/lib/meta";
import { PlayFrame } from "@/components/student/frame";

export async function generateMetadata(): Promise<Metadata> {
  return layoutMetadata("meta.title.play");
}

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <PlayFrame>{children}</PlayFrame>;
}
