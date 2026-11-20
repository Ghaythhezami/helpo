import { keysForEvent } from "./realtime";

describe("keysForEvent", () => {
  it("refreshes the lesson and the lesson list when a resource is ready", () => {
    expect(keysForEvent("resource.ready", { lessonId: "L1" })).toEqual([["lesson", "L1"], ["lessons"]]);
  });
  it("only refreshes the lesson on progress", () => {
    expect(keysForEvent("resource.progress", { lessonId: "L1" })).toEqual([["lesson", "L1"]]);
  });
  it("refreshes the session and results when a student joins or answers", () => {
    expect(keysForEvent("session.studentJoined", { sessionId: "S1" })).toEqual([["session", "S1"], ["results"]]);
    expect(keysForEvent("session.answer", { sessionId: "S1" })).toEqual([["session", "S1"], ["results"]]);
  });
  it("ignores payloads without ids", () => {
    expect(keysForEvent("session.question", {})).toEqual([]);
  });
});
