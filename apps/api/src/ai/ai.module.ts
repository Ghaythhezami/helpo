import { Global, Module } from "@nestjs/common";
import { AI_PROVIDER, isDemoMode } from "./ai.provider";
import { ClaudeAiProvider } from "./claude.provider";
import { DemoAiProvider } from "./demo.provider";

@Global()
@Module({
  providers: [{ provide: AI_PROVIDER, useFactory: () => (isDemoMode() ? new DemoAiProvider() : new ClaudeAiProvider()) }],
  exports: [AI_PROVIDER],
})
export class AiModule {}
