import type { Metadata } from "next";
import { GamePlay } from "@/components/student/game-play";

export const metadata: Metadata = { title: "Mini-game" };

export default async function GamePage({ params }: { params: Promise<{ lessonId: string; game: string }> }) {
  const { lessonId, game } = await params;
  return <GamePlay lessonId={lessonId} game={game} />;
}
