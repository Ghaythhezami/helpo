import type { Metadata } from "next";
import { WinView } from "@/components/student/win";

export const metadata: Metadata = { title: "Round complete" };

export default function WinPage() {
  return <WinView />;
}
