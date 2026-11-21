import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { AdminView } from "@/components/teacher/admin-view";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.admin");
}

export default function AdminPage() {
  return <AdminView />;
}
