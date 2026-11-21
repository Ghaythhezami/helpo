import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { CreateScreen } from "@/components/teacher/create-screen";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.create");
}

export default function CreatePage() {
  return <CreateScreen />;
}
