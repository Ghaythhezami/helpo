import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { PracticeHub } from "@/components/student/practice-hub";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.practice");
}

export default function PlayPage() {
  return <PracticeHub />;
}
