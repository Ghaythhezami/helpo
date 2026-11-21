import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { QuizView } from "@/components/student/quiz";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.quiz");
}

export default async function QuizPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return <QuizView sessionId={(await params).sessionId} />;
}
