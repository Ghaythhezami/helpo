import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { WinView } from "@/components/student/win";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.win");
}

export default function WinPage() {
  return <WinView />;
}
