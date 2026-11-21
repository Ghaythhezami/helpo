import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { PracticeQuizView } from "@/components/student/practice-quiz";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.practiceQuiz");
}

export default async function PracticeQuizPage({ params }: { params: Promise<{ lessonId: string }> }) {
  return <PracticeQuizView lessonId={(await params).lessonId} />;
}
