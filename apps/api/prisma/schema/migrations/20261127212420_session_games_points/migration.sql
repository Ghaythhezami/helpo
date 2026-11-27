-- AlterEnum
ALTER TYPE "GameKind" ADD VALUE 'ODD_ONE_OUT';

-- AlterTable
ALTER TABLE "activity_session" ADD COLUMN     "games" JSONB;

-- AlterTable
ALTER TABLE "game_result" ADD COLUMN     "hintsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wrongTries" INTEGER NOT NULL DEFAULT 0;
