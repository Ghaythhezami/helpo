# CLAUDE.md: Nibras

@AGENTS.md

## Claude Code notes

- **Claude API work:** load the `claude-api` skill before changing `apps/api/src/ai/*`. Keep structured outputs, prompt
  caching on the shared blueprint block, `effort` (no `temperature`), refusal and `max_tokens` handling, and typed SDK
  errors. Model ids come from env (`CLAUDE_ANALYSIS_MODEL`, `CLAUDE_GEN_MODEL`).
- **UI work:** check the v6 mockups and `docs/best-practices/ux.md` first.
  - Verify in a browser (Playwright MCP or the built-in browser) at desktop and phone sizes, in EN and AR, and run the
    no-page-scroll check.
  - Never type real passwords into the production site; use the local dev server with the QA harness in `apps/web/qa/`.
- **Backend best practices:** the owner's knowledge bases are `C:\Users\A\Desktop\DEV\backend` (Stackwise, topics
  T09/T11/T12/T32) and `C:\Users\A\Desktop\DEV\UX UI`. Keep `docs/best-practices/*.md` up to date when you change what
  they audit.
- **Subagents:** give each one disjoint files, the pattern to copy and the acceptance commands. Only one of them may run
  `npm install`. Subagents never commit, push or deploy.
- **Windows shell:** the Bash tool runs Git Bash. Heredocs passed to inline Python can collapse `\\` to `\`. For exact
  multi-line or regex edits, prefer the Edit tool or a script file.
- **Live check after deploys:** sign in with the demo account from `.local/prod-demo-account.txt` through the web origin,
  then run through the whole flow:
  1. Refine with AI.
  2. Create the kit and wait for READY.
  3. Share, then join as a student and answer.
  4. Check results and the PPTX export.

  Report the timing and the tokens (`resources[].tokensIn/tokensOut`).
