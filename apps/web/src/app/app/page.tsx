import type { Metadata } from "next";
import { CreateScreen } from "@/components/teacher/create-screen";

export const metadata: Metadata = { title: "Create" };

export default function CreatePage() {
  return <CreateScreen />;
}
