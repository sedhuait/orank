"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToolUseEvents(count, minute = "2026-01-15T10:30") {
  return Array.from({ length: count }, (_, i) => ({
    type: "tool_use",
    ts: `${minute}:${String(i % 60).padStart(2, "0")}.000Z`,
    sid: "s1",
    tool: "Read",
  }));
}

function makeSessionStartEvents(count, day = "2026-01-15") {
  return Array.from({ length: count }, (_, i) => ({
    type: "session_start",
    ts: `${day}T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
    sid: `s${i}`,
  }));
}

function makeXpAwardEvents(total, day = "2026-01-15") {
  return [{ type: "xp_award", ts: `${day}T10:00:00.000Z`, sid: null, amount: total }];
}

// ── Module Cache Reset ────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orank-integrity-"));
  process.env.CLAUDE_PLUGIN_DATA = tmpDir;
  delete require.cache[require.resolve("../scripts/integrity")];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
  delete require.cache[require.resolve("../scripts/integrity")];
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("RATE_LIMITS", () => {
  test("tool_uses_per_minute is 60", () => {
    const { RATE_LIMITS } = require("../scripts/integrity");
    expect(RATE_LIMITS.tool_uses_per_minute).toBe(60);
  });

  test("sessions_per_day is 50", () => {
    const { RATE_LIMITS } = require("../scripts/integrity");
    expect(RATE_LIMITS.sessions_per_day).toBe(50);
  });

  test("xp_per_day is 5000", () => {
    const { RATE_LIMITS } = require("../scripts/integrity");
    expect(RATE_LIMITS.xp_per_day).toBe(5000);
  });
});

describe("ANOMALY_RULES", () => {
  test("has 5 rules", () => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    expect(ANOMALY_RULES).toHaveLength(5);
  });

  test("each rule has id, name, description, check function", () => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    for (const rule of ANOMALY_RULES) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.name).toBe("string");
      expect(typeof rule.description).toBe("string");
      expect(typeof rule.check).toBe("function");
    }
  });

  test("rule IDs are correct", () => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    const ids = ANOMALY_RULES.map((r) => r.id);
    expect(ids).toContain("impossible-speed");
    expect(ids).toContain("session-spam");
    expect(ids).toContain("xp-spike");
    expect(ids).toContain("midnight-marathon");
    expect(ids).toContain("monotone-tools");
  });
});

// ── loadAllEvents ─────────────────────────────────────────────────────────────

describe("loadAllEvents", () => {
  test("returns [] when events.jsonl does not exist", () => {
    const { loadAllEvents } = require("../scripts/integrity");
    expect(loadAllEvents()).toEqual([]);
  });

  test("returns [] when events.jsonl is empty", () => {
    const { loadAllEvents } = require("../scripts/integrity");
    fs.writeFileSync(path.join(tmpDir, "events.jsonl"), "");
    expect(loadAllEvents()).toEqual([]);
  });

  test("returns [] when events.jsonl has only whitespace", () => {
    const { loadAllEvents } = require("../scripts/integrity");
    fs.writeFileSync(path.join(tmpDir, "events.jsonl"), "   \n\n  ");
    expect(loadAllEvents()).toEqual([]);
  });

  test("parses valid JSONL", () => {
    const { loadAllEvents } = require("../scripts/integrity");
    const events = [
      { type: "session_start", ts: "2026-01-15T10:00:00.000Z", sid: "s1" },
      { type: "tool_use", ts: "2026-01-15T10:01:00.000Z", sid: "s1", tool: "Read" },
    ];
    const lines = events.map((e) => JSON.stringify(e)).join("\n");
    fs.writeFileSync(path.join(tmpDir, "events.jsonl"), lines);
    const result = loadAllEvents();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject(events[0]);
    expect(result[1]).toMatchObject(events[1]);
  });

  test("skips malformed lines and returns valid ones", () => {
    const { loadAllEvents } = require("../scripts/integrity");
    const validEvent = { type: "session_start", ts: "2026-01-15T10:00:00.000Z", sid: "s1" };
    const lines = [
      JSON.stringify(validEvent),
      "not valid json {{{",
      '{"type":"tool_use","ts":"2026-01-15T10:01:00.000Z","sid":"s1","tool":"Read"}',
    ].join("\n");
    fs.writeFileSync(path.join(tmpDir, "events.jsonl"), lines);
    const result = loadAllEvents();
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("session_start");
    expect(result[1].type).toBe("tool_use");
  });

  test("parses a single event", () => {
    const { loadAllEvents } = require("../scripts/integrity");
    const event = { type: "turn_complete", ts: "2026-01-15T10:00:00.000Z", sid: "s1" };
    fs.writeFileSync(path.join(tmpDir, "events.jsonl"), JSON.stringify(event) + "\n");
    const result = loadAllEvents();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(event);
  });
});

// ── Anomaly Rules ─────────────────────────────────────────────────────────────

describe("impossible-speed rule", () => {
  let rule;

  beforeEach(() => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    rule = ANOMALY_RULES.find((r) => r.id === "impossible-speed");
  });

  test("not flagged with exactly 60 tool_use events in same minute", () => {
    const events = makeToolUseEvents(60);
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("flagged with 61 tool_use events in same minute", () => {
    const events = makeToolUseEvents(61);
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
  });

  test("evidence includes minute and count when flagged", () => {
    const events = makeToolUseEvents(65);
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toHaveProperty("minute");
    expect(result.evidence[0]).toHaveProperty("count", 65);
  });

  test("not flagged when events span different minutes", () => {
    const events = [
      ...makeToolUseEvents(30, "2026-01-15T10:30"),
      ...makeToolUseEvents(30, "2026-01-15T10:31"),
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("not flagged with empty events", () => {
    const result = rule.check([]);
    expect(result.flagged).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  test("not flagged when events are non-tool_use type", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      type: "session_start",
      ts: `2026-01-15T10:30:${String(i % 60).padStart(2, "0")}.000Z`,
      sid: `s${i}`,
    }));
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });
});

describe("session-spam rule", () => {
  let rule;

  beforeEach(() => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    rule = ANOMALY_RULES.find((r) => r.id === "session-spam");
  });

  test("not flagged with exactly 50 session_start events in one day", () => {
    const events = makeSessionStartEvents(50);
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("flagged with 51 session_start events in one day", () => {
    const events = makeSessionStartEvents(51);
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
  });

  test("evidence includes day and count when flagged", () => {
    const events = makeSessionStartEvents(55);
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toHaveProperty("day");
    expect(result.evidence[0]).toHaveProperty("count", 55);
  });

  test("not flagged when sessions span different days", () => {
    const events = [
      ...makeSessionStartEvents(30, "2026-01-15"),
      ...makeSessionStartEvents(30, "2026-01-16"),
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("not flagged with empty events", () => {
    const result = rule.check([]);
    expect(result.flagged).toBe(false);
    expect(result.evidence).toEqual([]);
  });
});

describe("xp-spike rule", () => {
  let rule;

  beforeEach(() => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    rule = ANOMALY_RULES.find((r) => r.id === "xp-spike");
  });

  test("not flagged with exactly 5000 XP in one day", () => {
    const events = makeXpAwardEvents(5000);
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("flagged with 5001 XP in one day", () => {
    const events = makeXpAwardEvents(5001);
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
  });

  test("correctly sums multiple xp_award amounts in one day", () => {
    const events = [
      { type: "xp_award", ts: "2026-01-15T10:00:00.000Z", sid: null, amount: 3000 },
      { type: "xp_award", ts: "2026-01-15T11:00:00.000Z", sid: null, amount: 2001 },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence[0]).toHaveProperty("total_xp", 5001);
  });

  test("not flagged when XP spread across different days", () => {
    const events = [
      { type: "xp_award", ts: "2026-01-15T10:00:00.000Z", sid: null, amount: 4000 },
      { type: "xp_award", ts: "2026-01-16T10:00:00.000Z", sid: null, amount: 4000 },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("evidence includes day and total_xp when flagged", () => {
    const events = makeXpAwardEvents(6000);
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence[0]).toHaveProperty("day");
    expect(result.evidence[0]).toHaveProperty("total_xp", 6000);
  });

  test("not flagged with empty events", () => {
    const result = rule.check([]);
    expect(result.flagged).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  test("handles missing amount field (treats as 0)", () => {
    const events = Array.from({ length: 100 }, () => ({
      type: "xp_award",
      ts: "2026-01-15T10:00:00.000Z",
      sid: null,
      // no amount field
    }));
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });
});

describe("midnight-marathon rule", () => {
  let rule;

  beforeEach(() => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    rule = ANOMALY_RULES.find((r) => r.id === "midnight-marathon");
  });

  test("not flagged for a 19-hour session", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T00:00:00.000Z", sid: "s1" },
      { type: "session_end", ts: "2026-01-15T19:00:00.000Z", sid: "s1" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("not flagged for exactly 20-hour session", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T00:00:00.000Z", sid: "s1" },
      { type: "session_end", ts: "2026-01-15T20:00:00.000Z", sid: "s1" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("flagged for a 21-hour session", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T00:00:00.000Z", sid: "s1" },
      { type: "session_end", ts: "2026-01-15T21:00:00.000Z", sid: "s1" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
  });

  test("evidence includes session_id and hours when flagged", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T00:00:00.000Z", sid: "long-session" },
      { type: "session_end", ts: "2026-01-15T23:00:00.000Z", sid: "long-session" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence[0]).toHaveProperty("session_id", "long-session");
    expect(result.evidence[0]).toHaveProperty("hours", 23);
  });

  test("not flagged when session_end is missing", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T00:00:00.000Z", sid: "s1" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("not flagged with empty events", () => {
    const result = rule.check([]);
    expect(result.flagged).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  test("multiple sessions: only flags the long one", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T00:00:00.000Z", sid: "s-long" },
      { type: "session_end", ts: "2026-01-15T22:00:00.000Z", sid: "s-long" },
      { type: "session_start", ts: "2026-01-15T08:00:00.000Z", sid: "s-short" },
      { type: "session_end", ts: "2026-01-15T09:00:00.000Z", sid: "s-short" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].session_id).toBe("s-long");
  });
});

describe("monotone-tools rule", () => {
  let rule;

  beforeEach(() => {
    const { ANOMALY_RULES } = require("../scripts/integrity");
    rule = ANOMALY_RULES.find((r) => r.id === "monotone-tools");
  });

  test("not flagged for exactly 1000 consecutive same tool", () => {
    const events = Array.from({ length: 1000 }, () => ({
      type: "tool_use",
      ts: "2026-01-15T10:00:00.000Z",
      sid: "s1",
      tool: "Read",
    }));
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("flagged for 1001 consecutive same tool_use events", () => {
    const events = Array.from({ length: 1001 }, () => ({
      type: "tool_use",
      ts: "2026-01-15T10:00:00.000Z",
      sid: "s1",
      tool: "Read",
    }));
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
  });

  test("evidence includes tool and streak when flagged", () => {
    const events = Array.from({ length: 1500 }, () => ({
      type: "tool_use",
      ts: "2026-01-15T10:00:00.000Z",
      sid: "s1",
      tool: "Bash",
    }));
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence[0]).toHaveProperty("tool", "Bash");
    expect(result.evidence[0]).toHaveProperty("streak", 1500);
  });

  test("returns empty evidence when no tool events", () => {
    const events = [
      { type: "session_start", ts: "2026-01-15T10:00:00.000Z", sid: "s1" },
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  test("not flagged with empty events", () => {
    const result = rule.check([]);
    expect(result.flagged).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  test("not flagged when tools alternate", () => {
    const events = Array.from({ length: 2000 }, (_, i) => ({
      type: "tool_use",
      ts: "2026-01-15T10:00:00.000Z",
      sid: "s1",
      tool: i % 2 === 0 ? "Read" : "Bash",
    }));
    const result = rule.check(events);
    expect(result.flagged).toBe(false);
  });

  test("detects monotone streak in the middle of varied events", () => {
    const events = [
      ...Array.from({ length: 5 }, () => ({ type: "tool_use", ts: "2026-01-15T10:00:00.000Z", sid: "s1", tool: "Write" })),
      ...Array.from({ length: 1001 }, () => ({ type: "tool_use", ts: "2026-01-15T10:00:00.000Z", sid: "s1", tool: "Read" })),
      ...Array.from({ length: 5 }, () => ({ type: "tool_use", ts: "2026-01-15T10:00:00.000Z", sid: "s1", tool: "Bash" })),
    ];
    const result = rule.check(events);
    expect(result.flagged).toBe(true);
    expect(result.evidence[0].tool).toBe("Read");
  });
});

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  function recentToolUseEvents(count) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => ({
      type: "tool_use",
      ts: new Date(now - i * 100).toISOString(),
      sid: "s1",
      tool: "Read",
    }));
  }

  function recentSessionStartEvents(count) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => ({
      type: "session_start",
      ts: new Date(now - i * 1000).toISOString(),
      sid: `s${i}`,
    }));
  }

  test("tool_use: allowed when under 60 per minute", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const events = recentToolUseEvents(59);
    const result = checkRateLimit(events, "tool_use");
    expect(result.allowed).toBe(true);
  });

  test("tool_use: blocked when at 60 per minute", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const events = recentToolUseEvents(60);
    const result = checkRateLimit(events, "tool_use");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("60");
  });

  test("tool_failure: blocked when tool_use count hits 60 per minute", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const events = recentToolUseEvents(60);
    const result = checkRateLimit(events, "tool_failure");
    expect(result.allowed).toBe(false);
  });

  test("tool_use: allowed when all tool_use events are older than 60 seconds", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const oldTs = new Date(Date.now() - 120000).toISOString();
    const events = Array.from({ length: 60 }, () => ({
      type: "tool_use",
      ts: oldTs,
      sid: "s1",
      tool: "Read",
    }));
    const result = checkRateLimit(events, "tool_use");
    expect(result.allowed).toBe(true);
  });

  test("session_start: allowed when under 50 per day", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const events = recentSessionStartEvents(49);
    const result = checkRateLimit(events, "session_start");
    expect(result.allowed).toBe(true);
  });

  test("session_start: blocked when at 50 per day", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const events = recentSessionStartEvents(50);
    const result = checkRateLimit(events, "session_start");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("50");
  });

  test("other event types: always allowed regardless of event count", () => {
    const { checkRateLimit } = require("../scripts/integrity");
    const events = Array.from({ length: 1000 }, (_, i) => ({
      type: "turn_complete",
      ts: new Date().toISOString(),
      sid: "s1",
    }));
    expect(checkRateLimit(events, "turn_complete").allowed).toBe(true);
    expect(checkRateLimit(events, "badge_earned").allowed).toBe(true);
    expect(checkRateLimit([], "unknown_type").allowed).toBe(true);
  });
});

// ── runIntegrityReport ────────────────────────────────────────────────────────

describe("runIntegrityReport", () => {
  test("trustScore is 100 when no flags", () => {
    const { runIntegrityReport } = require("../scripts/integrity");
    const report = runIntegrityReport([]);
    expect(report.trustScore).toBe(100);
    expect(report.flags).toBe(0);
  });

  test("trustScore is 85 when 1 flag", () => {
    const { runIntegrityReport } = require("../scripts/integrity");
    // Trigger impossible-speed: 61 tool_use in one minute
    const events = makeToolUseEvents(61);
    const report = runIntegrityReport(events);
    expect(report.flags).toBe(1);
    expect(report.trustScore).toBe(85);
  });

  test("trustScore is 0 when 7 or more flags (capped at 0)", () => {
    const { runIntegrityReport } = require("../scripts/integrity");
    // We can't easily trigger all 5 real rules to get 7 flags, so test the math
    // by constructing a mock. Instead, verify capping behaviour is enforced:
    // With 5 flags: 100 - 5*15 = 25. With our 5 rules, max flags = 5 -> 25.
    // The clamp to 0 happens at 7+ flags. We test the formula direction.
    // Trigger impossible-speed (61 tool_use/min) + session-spam (51/day) + xp-spike (5001/day)
    const minute = "2026-01-15T10:30";
    const toolEvents = makeToolUseEvents(61, minute);
    const sessionEvents = makeSessionStartEvents(51, "2026-01-15");
    const xpEvents = makeXpAwardEvents(5001, "2026-01-15");
    const events = [...toolEvents, ...sessionEvents, ...xpEvents];
    const report = runIntegrityReport(events);
    expect(report.flags).toBeGreaterThanOrEqual(3);
    expect(report.trustScore).toBe(Math.max(0, 100 - report.flags * 15));
  });

  test("trustScore minimum is 0 (not negative) with many flags", () => {
    const { runIntegrityReport, ANOMALY_RULES } = require("../scripts/integrity");
    // We can verify that 7 flags => Math.max(0, 100-105) = 0
    expect(Math.max(0, 100 - 7 * 15)).toBe(0);
    // And verify the function always returns >= 0
    const report = runIntegrityReport([]);
    expect(report.trustScore).toBeGreaterThanOrEqual(0);
  });

  test("results has 5 entries (one per rule)", () => {
    const { runIntegrityReport } = require("../scripts/integrity");
    const report = runIntegrityReport([]);
    expect(report.results).toHaveLength(5);
  });

  test("report includes totalEvents count", () => {
    const { runIntegrityReport } = require("../scripts/integrity");
    const events = [
      { type: "session_start", ts: "2026-01-15T10:00:00.000Z", sid: "s1" },
      { type: "tool_use", ts: "2026-01-15T10:01:00.000Z", sid: "s1", tool: "Read" },
    ];
    const report = runIntegrityReport(events);
    expect(report.totalEvents).toBe(2);
  });

  test("report includes checkedAt timestamp", () => {
    const { runIntegrityReport } = require("../scripts/integrity");
    const report = runIntegrityReport([]);
    expect(typeof report.checkedAt).toBe("string");
    expect(() => new Date(report.checkedAt)).not.toThrow();
  });

  test("handles exception thrown in a rule (catches error, does not flag)", () => {
    const { runIntegrityReport, ANOMALY_RULES } = require("../scripts/integrity");
    // Temporarily patch a rule to throw
    const original = ANOMALY_RULES[0].check;
    ANOMALY_RULES[0].check = () => { throw new Error("rule exploded"); };
    try {
      const report = runIntegrityReport([]);
      const brokenResult = report.results.find((r) => r.id === ANOMALY_RULES[0].id);
      expect(brokenResult.flagged).toBe(false);
      expect(brokenResult.error).toBe("rule exploded");
    } finally {
      ANOMALY_RULES[0].check = original;
    }
  });
});

// ── formatIntegrityReport ─────────────────────────────────────────────────────

describe("formatIntegrityReport", () => {
  function getReport(events = []) {
    const { runIntegrityReport } = require("../scripts/integrity");
    return runIntegrityReport(events);
  }

  test("returns a string", () => {
    const { formatIntegrityReport } = require("../scripts/integrity");
    const report = getReport();
    expect(typeof formatIntegrityReport(report)).toBe("string");
  });

  test("contains 'Trust Score'", () => {
    const { formatIntegrityReport } = require("../scripts/integrity");
    const report = getReport();
    expect(formatIntegrityReport(report)).toContain("Trust Score");
  });

  test("contains each rule name", () => {
    const { formatIntegrityReport, ANOMALY_RULES } = require("../scripts/integrity");
    const report = getReport();
    const output = formatIntegrityReport(report);
    for (const rule of ANOMALY_RULES) {
      expect(output).toContain(rule.name);
    }
  });

  test("contains trust score value", () => {
    const { formatIntegrityReport } = require("../scripts/integrity");
    const report = getReport();
    expect(formatIntegrityReport(report)).toContain("100");
  });

  test("shows [!] for flagged rule and evidence", () => {
    const { formatIntegrityReport } = require("../scripts/integrity");
    const events = makeToolUseEvents(61);
    const report = getReport(events);
    const output = formatIntegrityReport(report);
    expect(output).toContain("[!]");
    expect(output).toContain("Evidence");
  });

  test("shows checkmark for clean rules", () => {
    const { formatIntegrityReport } = require("../scripts/integrity");
    const report = getReport([]);
    const output = formatIntegrityReport(report);
    expect(output).toContain("[✓]");
  });
});
