import { describe, it, expect, beforeEach } from "vitest";
import { checkNudgeAllowed, _resetNudgeRateLimit } from "../src/nudgeRateLimit.js";

beforeEach(() => _resetNudgeRateLimit());

describe("nudge rate limit", () => {
  it("allows a first nudge", () => {
    expect(checkNudgeAllowed("u1", "c1", 0)).toEqual({ allowed: true });
  });

  it("blocks a second nudge inside cooldown", () => {
    checkNudgeAllowed("u1", "c1", 0);
    expect(checkNudgeAllowed("u1", "c1", 500)).toEqual({ allowed: false, reason: "cooldown" });
  });

  it("allows again after cooldown elapses", () => {
    checkNudgeAllowed("u1", "c1", 0);
    expect(checkNudgeAllowed("u1", "c1", 3001)).toEqual({ allowed: true });
  });

  it("caps at 6 per rolling minute even outside cooldown", () => {
    let now = 0;
    for (let i = 0; i < 6; i++) {
      expect(checkNudgeAllowed("u1", "c1", now)).toEqual({ allowed: true });
      now += 3001;
    }
    expect(checkNudgeAllowed("u1", "c1", now)).toEqual({ allowed: false, reason: "rate_limited" });
  });

  it("does not cross-contaminate different conversations", () => {
    checkNudgeAllowed("u1", "c1", 0);
    expect(checkNudgeAllowed("u1", "c2", 0)).toEqual({ allowed: true });
  });
});
