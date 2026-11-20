import type { Metadata } from "next";
import { QuizView } from "@/components/student/quiz";

export const metadata: Metadata = { title: "Live quiz" };

export default async function QuizPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return <QuizView sessionId={(await params).sessionId} />;
}
