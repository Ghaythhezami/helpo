import { keysForEvent } from "./realtime";

describe("keysForEvent", () => {
  it("refreshes the lesson and the lesson list when a resource is ready, failed or the lesson status moves", () => {
    for (const e of ["resource.ready", "resource.failed", "lesson.status"]) {
      expect(keysForEvent(e, { lessonId: "L1" })).toEqual([["lesson", "L1"], ["lessons"]]);
    }
    expect(keysForEvent("lesson.status", {})).toEqual([["lessons"]]);
  });
  it("never refetches on progress: it is patched into the cache instead", () => {
    expect(keysForEvent("resource.progress", { lessonId: "L1" })).toEqual([]);
  });
  it("refreshes the session, the student quiz and results for answer / state / studentJoined", () => {
    for (const e of ["session.answer", "session.state", "session.studentJoined"]) {
      expect(keysForEvent(e, { sessionId: "S1" })).toEqual([["session", "S1"], ["play", "quiz", "S1"], ["results"]]);
    }
  });
  it("question and leaderboard refresh the session and quiz but not results", () => {
    for (const e of ["session.question", "session.leaderboard"]) {
      expect(keysForEvent(e, { sessionId: "S1" })).toEqual([["session", "S1"], ["play", "quiz", "S1"]]);
    }
  });
  it("ignores payloads without ids and unknown events", () => {
    expect(keysForEvent("session.question", {})).toEqual([]);
    expect(keysForEvent("mystery", { lessonId: "L1", sessionId: "S1" })).toEqual([]);
  });
});
