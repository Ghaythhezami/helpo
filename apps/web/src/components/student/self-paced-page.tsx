"use client";
import { useSearchParams } from "next/navigation";
import { SelfPacedQuiz } from "./self-paced";

export function SelfPacedPage({ sessionId }: { sessionId: string }) {
  const code = useSearchParams().get("code") ?? undefined;
  return <SelfPacedQuiz sessionId={sessionId} code={code} />;
}
