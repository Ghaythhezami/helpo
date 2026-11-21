import type { Metadata } from "next";
import { pageMetadata } from "@/lib/meta";
import { GamePlay } from "@/components/student/game-play";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("meta.title.game");
}

export default async function GamePage({ params }: { params: Promise<{ lessonId: string; game: string }> }) {
  const { lessonId, game } = await params;
  return <GamePlay lessonId={lessonId} game={game} />;
}
