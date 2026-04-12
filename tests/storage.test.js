import fs from "node:fs";
import path from "node:path";
import {
  badgeEarnedEvent,
  buildSession,
  historyImportEvent,
  sessionEndEvent,
  sessionStartEvent,
  slashCommandEvent,
  subagentStartEvent,
  subagentStopEvent,
  toolFailureEvent,
  toolUseEvent,
  turnCompleteEvent,
  turnErrorEvent,
  xpAwardEvent,
} from "./helpers/fixtures.js";
import { createTestStorage, readEvents, writeEvents } from "./helpers/test-storage.js";

// ── Constructor & basics ──────────────────────────────────────────────────────

describe("Constructor & basics", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("creates data directory on construction", () => {
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  test("getDataDir returns the data directory path", () => {
    expect(storage.getDataDir()).toBe(tmpDir);
  });

  test("data directory matches the tmpDir passed to constructor", () => {
    expect(storage.getDataDir()).toBe(tmpDir);
  });
});

// ── appendEvent ───────────────────────────────────────────────────────────────

describe("appendEvent", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("creates events.jsonl on first append", () => {
    const eventsFile = path.join(tmpDir, "events.jsonl");
    expect(fs.existsSync(eventsFile)).toBe(false);
    storage.appendEvent({ type: "test", ts: "2026-01-01T00:00:00Z", sid: "s1" });
    expect(fs.existsSync(eventsFile)).toBe(true);
  });

  test("appends a single event", () => {
    const evt = { type: "turn_complete", ts: "2026-01-01T10:00:00Z", sid: "s1" };
    storage.appendEvent(evt);
    const events = readEvents(tmpDir);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject(evt);
  });

  test("appends multiple events in order", () => {
    const evts = [
      { type: "session_start", ts: "2026-01-01T10:00:00Z", sid: "s1" },
      { type: "tool_use", ts: "2026-01-01T10:01:00Z", sid: "s1", tool: "Read" },
      { type: "session_end", ts: "2026-01-01T10:02:00Z", sid: "s1" },
    ];
    for (const e of evts) storage.appendEvent(e);
    const stored = readEvents(tmpDir);
    expect(stored).toHaveLength(3);
    expect(stored[0].type).toBe("session_start");
    expect(stored[1].type).toBe("tool_use");
    expect(stored[2].type).toBe("session_end");
  });

  test("writes valid JSONL format (one JSON object per line)", () => {
    storage.appendEvent({ type: "a", ts: "2026-01-01T00:00:00Z", sid: "s1" });
    storage.appendEvent({ type: "b", ts: "2026-01-01T00:00:01Z", sid: "s1" });
    const eventsFile = path.join(tmpDir, "events.jsonl");
    const raw = fs.readFileSync(eventsFile, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ── Pause/Resume ──────────────────────────────────────────────────────────────

describe("Pause/Resume", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("isPaused is false initially", () => {
    expect(storage.isPaused()).toBe(false);
  });

  test("pause creates .paused file and isPaused returns true", () => {
    storage.pause();
    const pausedFile = path.join(tmpDir, ".paused");
    expect(fs.existsSync(pausedFile)).toBe(true);
    expect(storage.isPaused()).toBe(true);
  });

  test("resume removes .paused file and isPaused returns false", () => {
    storage.pause();
    expect(storage.isPaused()).toBe(true);
    storage.resume();
    expect(storage.isPaused()).toBe(false);
    const pausedFile = path.join(tmpDir, ".paused");
    expect(fs.existsSync(pausedFile)).toBe(false);
  });

  test("resume is idempotent when not paused", () => {
    expect(() => storage.resume()).not.toThrow();
    expect(storage.isPaused()).toBe(false);
  });
});

// ── _emptyCache ───────────────────────────────────────────────────────────────

describe("_emptyCache", () => {
  let storage;
  let cleanup;

  beforeEach(() => {
    ({ storage, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("has all expected top-level keys", () => {
    const cache = storage._emptyCache();
    const expectedKeys = [
      "total_xp",
      "tier",
      "total_sessions",
      "total_tools",
      "total_tool_failures",
      "total_turns",
      "total_seconds",
      "total_turn_errors",
      "total_subagents",
      "current_streak",
      "longest_streak",
      "last_active_date",
      "tool_counts",
      "slash_command_counts",
      "subagent_counts",
      "turn_errors",
      "daily_sessions",
      "hourly_activity",
      "badges_earned",
      "imported_session_ids",
      "xp_log",
      "sessions",
      "tool_sequences",
      "weekly_snapshots",
      "dynamic_badge_tracks",
      "last_weekly_summary_shown",
      "events_offset",
      "last_rebuilt",
    ];
    for (const key of expectedKeys) {
      expect(cache).toHaveProperty(key);
    }
  });

  test("hourly_activity is a 24-element array", () => {
    const cache = storage._emptyCache();
    expect(cache.hourly_activity).toHaveLength(24);
  });

  test("hourly_activity is all zeros", () => {
    const cache = storage._emptyCache();
    for (const val of cache.hourly_activity) {
      expect(val).toBe(0);
    }
  });

  test("all numeric counters start at 0", () => {
    const cache = storage._emptyCache();
    const numericKeys = [
      "total_xp",
      "total_sessions",
      "total_tools",
      "total_tool_failures",
      "total_turns",
      "total_seconds",
      "total_turn_errors",
      "total_subagents",
      "current_streak",
      "longest_streak",
      "events_offset",
    ];
    for (const key of numericKeys) {
      expect(cache[key]).toBe(0);
    }
  });

  test("last_active_date is null", () => {
    expect(storage._emptyCache().last_active_date).toBeNull();
  });

  test("tier defaults to Bronze", () => {
    expect(storage._emptyCache().tier).toBe("Bronze");
  });

  test("array fields start empty", () => {
    const cache = storage._emptyCache();
    expect(cache.badges_earned).toEqual([]);
    expect(cache.imported_session_ids).toEqual([]);
    expect(cache.xp_log).toEqual([]);
    expect(cache.tool_sequences).toEqual([]);
  });

  test("object fields start empty", () => {
    const cache = storage._emptyCache();
    expect(cache.tool_counts).toEqual({});
    expect(cache.slash_command_counts).toEqual({});
    expect(cache.subagent_counts).toEqual({});
    expect(cache.turn_errors).toEqual({});
    expect(cache.daily_sessions).toEqual({});
    expect(cache.sessions).toEqual({});
    expect(cache.weekly_snapshots).toEqual({});
    expect(cache.dynamic_badge_tracks).toEqual({});
  });
});

// ── Cache rebuild & event processing ─────────────────────────────────────────

describe("Cache rebuild & event processing", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("rebuildCache with no events file returns empty-ish cache", () => {
    const cache = storage.rebuildCache();
    expect(cache.total_sessions).toBe(0);
    expect(cache.total_tools).toBe(0);
    expect(cache.total_xp).toBe(0);
  });

  test("processes session_start: increments total_sessions", () => {
    const evt = sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" });
    writeEvents(tmpDir, [evt]);
    const cache = storage.rebuildCache();
    expect(cache.total_sessions).toBe(1);
  });

  test("processes session_start: updates daily_sessions", () => {
    const evt = sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" });
    writeEvents(tmpDir, [evt]);
    const cache = storage.rebuildCache();
    expect(cache.daily_sessions["2026-03-15"]).toBe(1);
  });

  test("processes session_start: updates hourly_activity", () => {
    const ts = "2026-03-15T10:00:00Z";
    const expectedHour = new Date(ts).getHours();
    const evt = sessionStartEvent({ ts, sid: "s1" });
    writeEvents(tmpDir, [evt]);
    const cache = storage.rebuildCache();
    expect(cache.hourly_activity[expectedHour]).toBe(1);
  });

  test("processes session_start: creates session object in cache.sessions", () => {
    const evt = sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" });
    writeEvents(tmpDir, [evt]);
    const cache = storage.rebuildCache();
    expect(cache.sessions.s1).toBeDefined();
    expect(cache.sessions.s1.start_ts).toBe("2026-03-15T10:00:00Z");
    expect(cache.sessions.s1.tool_count).toBe(0);
    expect(cache.sessions.s1.failure_count).toBe(0);
  });

  test("processes session_end: computes duration and adds to total_seconds", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      sessionEndEvent("s1", { ts: "2026-03-15T10:05:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_seconds).toBe(300); // 5 minutes
  });

  test("processes session_end: rejects duration >= 86400s", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      sessionEndEvent("s1", { ts: "2026-03-16T10:01:00Z" }), // >24h
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_seconds).toBe(0);
  });

  test("processes tool_use: increments total_tools", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_tools).toBe(1);
  });

  test("processes tool_use: updates tool_counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:02:00Z" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.tool_counts.Read).toBe(2);
    expect(cache.tool_counts.Edit).toBe(1);
  });

  test("processes tool_use: updates session tool_count", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:02:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.sessions.s1.tool_count).toBe(2);
  });

  test("processes tool_use: creates dynamic_badge_tracks entry", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Glob", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.dynamic_badge_tracks["tool:Glob"]).toBeDefined();
    expect(cache.dynamic_badge_tracks["tool:Glob"].count).toBe(1);
  });

  test("processes tool_failure: increments total_tool_failures", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_tool_failures).toBe(1);
  });

  test("processes tool_failure: also increments total_tools and tool_counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_tools).toBe(1);
    expect(cache.tool_counts.Bash).toBe(1);
  });

  test("processes tool_failure: increments session failure_count", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.sessions.s1.failure_count).toBe(1);
  });

  test("processes turn_complete: increments total_turns", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      turnCompleteEvent("s1", { ts: "2026-03-15T10:01:00Z" }),
      turnCompleteEvent("s1", { ts: "2026-03-15T10:02:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_turns).toBe(2);
  });

  test("processes turn_error: increments total_turn_errors", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      turnErrorEvent("s1", "timeout", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_turn_errors).toBe(1);
  });

  test("processes turn_error: populates turn_errors map by error_type", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      turnErrorEvent("s1", "timeout", { ts: "2026-03-15T10:01:00Z" }),
      turnErrorEvent("s1", "timeout", { ts: "2026-03-15T10:02:00Z" }),
      turnErrorEvent("s1", "network", { ts: "2026-03-15T10:03:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.turn_errors.timeout).toBe(2);
    expect(cache.turn_errors.network).toBe(1);
  });

  test("processes slash_command: updates slash_command_counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      slashCommandEvent("s1", "orank", { ts: "2026-03-15T10:01:00Z" }),
      slashCommandEvent("s1", "orank", { ts: "2026-03-15T10:02:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.slash_command_counts.orank).toBe(2);
  });

  test("processes slash_command: updates dynamic_badge_tracks", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      slashCommandEvent("s1", "review", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.dynamic_badge_tracks["cmd:review"]).toBeDefined();
    expect(cache.dynamic_badge_tracks["cmd:review"].count).toBe(1);
  });

  test("processes subagent_start: increments total_subagents", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      subagentStartEvent("s1", { ts: "2026-03-15T10:01:00Z", agent_type: "Explore" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_subagents).toBe(1);
  });

  test("processes subagent_start: updates subagent_counts by agent_type", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      subagentStartEvent("s1", { ts: "2026-03-15T10:01:00Z", agent_type: "Explore" }),
      subagentStartEvent("s1", { ts: "2026-03-15T10:02:00Z", agent_type: "Explore" }),
      subagentStartEvent("s1", { ts: "2026-03-15T10:03:00Z", agent_type: "Task" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.subagent_counts.Explore).toBe(2);
    expect(cache.subagent_counts.Task).toBe(1);
  });

  test("processes xp_award: increments total_xp", () => {
    const events = [
      xpAwardEvent(100, "badge", { ts: "2026-03-15T10:00:00Z" }),
      xpAwardEvent(50, "streak", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.total_xp).toBe(150);
  });

  test("processes xp_award: appends to xp_log with running_total", () => {
    const events = [
      xpAwardEvent(100, "first", { ts: "2026-03-15T10:00:00Z" }),
      xpAwardEvent(50, "second", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.xp_log).toHaveLength(2);
    expect(cache.xp_log[0].running_total).toBe(100);
    expect(cache.xp_log[1].running_total).toBe(150);
    expect(cache.xp_log[0].reason).toBe("first");
    expect(cache.xp_log[1].reason).toBe("second");
  });

  test("processes badge_earned: adds to badges_earned", () => {
    const events = [badgeEarnedEvent("first-session", "Hello Claude", "bronze", { ts: "2026-03-15T10:00:00Z" })];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.badges_earned).toHaveLength(1);
    expect(cache.badges_earned[0].badge_id).toBe("first-session");
    expect(cache.badges_earned[0].badge_name).toBe("Hello Claude");
    expect(cache.badges_earned[0].badge_tier).toBe("bronze");
  });

  test("processes badge_earned: deduplicates by badge_id", () => {
    const events = [
      badgeEarnedEvent("first-session", "Hello Claude", "bronze", { ts: "2026-03-15T10:00:00Z" }),
      badgeEarnedEvent("first-session", "Hello Claude", "bronze", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.badges_earned).toHaveLength(1);
  });

  test("processes history_import: adds to imported_session_ids", () => {
    const events = [historyImportEvent("imported-session-1", { ts: "2026-03-15T10:00:00Z" })];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.imported_session_ids).toContain("imported-session-1");
  });

  test("processes history_import: deduplicates session IDs", () => {
    const events = [
      historyImportEvent("imported-session-1", { ts: "2026-03-15T10:00:00Z" }),
      historyImportEvent("imported-session-1", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    const cache = storage.rebuildCache();
    expect(cache.imported_session_ids.filter((id) => id === "imported-session-1")).toHaveLength(1);
  });

  test("incremental rebuild: only processes events after last known offset", () => {
    // Write first batch and rebuild
    const firstEvents = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, firstEvents);
    storage.rebuildCache();

    // Now append more events directly and rebuild again
    const eventsFile = path.join(tmpDir, "events.jsonl");
    const newEvent = toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z" });
    fs.appendFileSync(eventsFile, `${JSON.stringify(newEvent)}\n`);

    // Force cache to reload by clearing in-memory cache
    storage._cache = null;
    const cache2 = storage.rebuildCache();

    // Should have processed all 3 events total
    expect(cache2.total_tools).toBe(2);
    expect(cache2.tool_counts.Read).toBe(1);
    expect(cache2.tool_counts.Edit).toBe(1);
  });

  test("skips malformed JSON lines without throwing", () => {
    const eventsFile = path.join(tmpDir, "events.jsonl");
    const goodEvent = sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" });
    // Write good event, then a malformed line, then another good event
    fs.writeFileSync(
      eventsFile,
      `${JSON.stringify(goodEvent)}\nNOT VALID JSON\n${JSON.stringify(toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z" }))}\n`,
      "utf8",
    );
    let cache;
    expect(() => {
      cache = storage.rebuildCache();
    }).not.toThrow();
    expect(cache.total_sessions).toBe(1);
    expect(cache.total_tools).toBe(1);
  });
});

// ── Streaks ───────────────────────────────────────────────────────────────────

describe("Streaks", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  test("no sessions → current_streak=0, longest_streak=0", () => {
    const cache = storage.rebuildCache();
    expect(cache.current_streak).toBe(0);
    expect(cache.longest_streak).toBe(0);
  });

  test("single day → current_streak=1, longest_streak=1", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })]);
    const cache = storage.rebuildCache();
    expect(cache.current_streak).toBe(1);
    expect(cache.longest_streak).toBe(1);
  });

  test("consecutive days → correct longest_streak", () => {
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-13T10:00:00Z", sid: "s1" }),
      sessionStartEvent({ ts: "2026-03-14T10:00:00Z", sid: "s2" }),
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s3" }),
    ]);
    const cache = storage.rebuildCache();
    expect(cache.longest_streak).toBe(3);
  });

  test("gap in days breaks streak", () => {
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-10T10:00:00Z", sid: "s1" }),
      // skip 11, 12
      sessionStartEvent({ ts: "2026-03-13T10:00:00Z", sid: "s2" }),
      sessionStartEvent({ ts: "2026-03-14T10:00:00Z", sid: "s3" }),
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s4" }),
    ]);
    const cache = storage.rebuildCache();
    expect(cache.current_streak).toBe(3);
    expect(cache.longest_streak).toBe(3);
  });

  test("current streak counts backward from today", () => {
    // Today is 2026-03-15; sessions on 14 and 15 → streak of 2
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-14T10:00:00Z", sid: "s1" }),
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s2" }),
    ]);
    const cache = storage.rebuildCache();
    expect(cache.current_streak).toBe(2);
  });

  test("no session today but session yesterday → current_streak=1", () => {
    // Today 2026-03-15, last session 2026-03-14
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-14T10:00:00Z", sid: "s1" })]);
    const cache = storage.rebuildCache();
    expect(cache.current_streak).toBe(1);
  });

  test("last session was 2 days ago → current_streak=0", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-13T10:00:00Z", sid: "s1" })]);
    const cache = storage.rebuildCache();
    expect(cache.current_streak).toBe(0);
  });

  test("last_active_date is set to most recent session date", () => {
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-13T10:00:00Z", sid: "s1" }),
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s2" }),
    ]);
    const cache = storage.rebuildCache();
    expect(cache.last_active_date).toBe("2026-03-15");
  });
});

// ── Public read methods ───────────────────────────────────────────────────────

describe("Public read methods", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  describe("getStats", () => {
    test("returns all expected fields", () => {
      const stats = storage.getStats();
      const expectedKeys = [
        "total_xp",
        "tier",
        "total_sessions",
        "total_tool_uses",
        "total_tool_failures",
        "total_turns",
        "total_seconds",
        "total_turn_errors",
        "total_subagents",
        "current_streak",
        "longest_streak",
        "last_active_date",
        "success_rate",
        "unique_tools",
        "top_tools",
        "slash_command_counts",
        "subagent_counts",
        "turn_errors",
        "tool_counts",
      ];
      for (const key of expectedKeys) {
        expect(stats).toHaveProperty(key);
      }
    });

    test("success_rate is 0 when no tools used", () => {
      const stats = storage.getStats();
      expect(stats.success_rate).toBe(0);
    });

    test("success_rate is correct percentage string when tools used", () => {
      writeEvents(tmpDir, [
        sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
        toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
        toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z" }),
        toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:03:00Z" }),
        toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:04:00Z" }),
      ]);
      const stats = storage.getStats();
      // 2 success out of 4 total = 50.0%
      expect(stats.success_rate).toBe("50.0");
    });

    test("top_tools is sorted by count descending", () => {
      writeEvents(tmpDir, [
        sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
        toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
        toolUseEvent("s1", "Read", { ts: "2026-03-15T10:02:00Z" }),
        toolUseEvent("s1", "Read", { ts: "2026-03-15T10:03:00Z" }),
        toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:04:00Z" }),
        toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:05:00Z" }),
        toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:06:00Z" }),
      ]);
      const stats = storage.getStats();
      expect(stats.top_tools[0].name).toBe("Read");
      expect(stats.top_tools[0].count).toBe(3);
      expect(stats.top_tools[1].name).toBe("Edit");
    });

    test("unique_tools reflects number of distinct tools used", () => {
      writeEvents(tmpDir, [
        sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
        toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
        toolUseEvent("s1", "Read", { ts: "2026-03-15T10:02:00Z" }),
        toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z" }),
      ]);
      const stats = storage.getStats();
      expect(stats.unique_tools).toBe(2);
    });
  });

  test("getBadges returns earned array", () => {
    writeEvents(tmpDir, [badgeEarnedEvent("first-session", "Hello Claude", "bronze", { ts: "2026-03-15T10:00:00Z" })]);
    const badges = storage.getBadges();
    expect(badges).toHaveProperty("earned");
    expect(badges.earned).toHaveLength(1);
    expect(badges.earned[0].badge_id).toBe("first-session");
  });

  test("getContributionData returns array of correct length (52 weeks default)", () => {
    const data = storage.getContributionData();
    expect(data).toHaveLength(52 * 7);
  });

  test("getContributionData with custom weeks returns correct length", () => {
    const data = storage.getContributionData(4);
    expect(data).toHaveLength(4 * 7);
  });

  test("getContributionData entries have date and count fields", () => {
    const data = storage.getContributionData(1);
    for (const entry of data) {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("count");
    }
  });

  test("getToolBreakdown returns sorted entries with pct", () => {
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:02:00Z" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z" }),
    ]);
    const breakdown = storage.getToolBreakdown();
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].name).toBe("Read");
    expect(breakdown[0].count).toBe(2);
    expect(breakdown[0].pct).toBeDefined();
    // pct for Read: 2/3 * 100 = 66.7%
    expect(breakdown[0].pct).toBe("66.7");
  });

  test("getToolBreakdown returns empty array when no tools", () => {
    expect(storage.getToolBreakdown()).toEqual([]);
  });

  test("getHourlyActivity returns a 24-element array", () => {
    const activity = storage.getHourlyActivity();
    expect(activity).toHaveLength(24);
  });

  test("getHourlyActivity returns a copy (not the cache reference)", () => {
    const a = storage.getHourlyActivity();
    const b = storage.getHourlyActivity();
    expect(a).toEqual(b);
    a[0] = 999;
    const c = storage.getHourlyActivity();
    expect(c[0]).toBe(0); // original not mutated
  });

  test("getStreakInfo returns {current, longest, lastActiveDate}", () => {
    const info = storage.getStreakInfo();
    expect(info).toHaveProperty("current");
    expect(info).toHaveProperty("longest");
    expect(info).toHaveProperty("lastActiveDate");
  });

  test("getSessions returns sessions object", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })]);
    const sessions = storage.getSessions();
    expect(sessions).toHaveProperty("s1");
  });

  test("getWeeklySnapshots / setWeeklySnapshot round-trip", () => {
    const snapshot = { total_sessions: 5, total_tools: 20 };
    storage.setWeeklySnapshot("2026-W14", snapshot);
    const snapshots = storage.getWeeklySnapshots();
    expect(snapshots["2026-W14"]).toEqual(snapshot);
  });

  test("getDynamicBadgeTracks returns tracks object", () => {
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
    ]);
    const tracks = storage.getDynamicBadgeTracks();
    expect(tracks).toHaveProperty("tool:Read");
  });

  test("getLastWeeklySummaryShown / setLastWeeklySummaryShown round-trip", () => {
    expect(storage.getLastWeeklySummaryShown()).toBeNull();
    storage.setLastWeeklySummaryShown("2026-03-15");
    expect(storage.getLastWeeklySummaryShown()).toBe("2026-03-15");
  });

  test("getSlashCommandCounts returns slash_command_counts", () => {
    writeEvents(tmpDir, [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      slashCommandEvent("s1", "orank", { ts: "2026-03-15T10:01:00Z" }),
    ]);
    const counts = storage.getSlashCommandCounts();
    expect(counts.orank).toBe(1);
  });
});

// ── XP methods ────────────────────────────────────────────────────────────────

describe("XP methods", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  test("addXP appends an xp_award event to events.jsonl", () => {
    storage.addXP(100, "test-reason");
    const events = readEvents(tmpDir);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("xp_award");
    expect(events[0].amount).toBe(100);
    expect(events[0].reason).toBe("test-reason");
  });

  test("getTotalXP returns 0 when no XP awarded", () => {
    expect(storage.getTotalXP()).toBe(0);
  });

  test("getTotalXP returns correct total after multiple addXP calls", () => {
    writeEvents(tmpDir, [
      xpAwardEvent(100, "badge", { ts: "2026-03-15T10:00:00Z" }),
      xpAwardEvent(50, "streak", { ts: "2026-03-15T10:01:00Z" }),
    ]);
    expect(storage.getTotalXP()).toBe(150);
  });

  test("getTodayXP returns 0 when no XP awarded today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    writeEvents(tmpDir, [xpAwardEvent(100, "old", { ts: "2026-03-10T10:00:00Z" })]);
    expect(storage.getTodayXP()).toBe(0);
  });

  test("getTodayXP returns only today's XP sum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    writeEvents(tmpDir, [
      xpAwardEvent(100, "yesterday", { ts: "2026-03-14T10:00:00Z" }),
      xpAwardEvent(50, "today1", { ts: "2026-03-15T08:00:00Z" }),
      xpAwardEvent(75, "today2", { ts: "2026-03-15T11:00:00Z" }),
    ]);
    expect(storage.getTodayXP()).toBe(125);
  });
});

// ── Data management ───────────────────────────────────────────────────────────

describe("Data management", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("recordBadge appends a badge_earned event", () => {
    storage.recordBadge("first-session", "Hello Claude", "bronze");
    const events = readEvents(tmpDir);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("badge_earned");
    expect(events[0].badge_id).toBe("first-session");
    expect(events[0].badge_name).toBe("Hello Claude");
    expect(events[0].badge_tier).toBe("bronze");
  });

  test("exportAll returns {cache, events, exported_at}", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })]);
    const result = storage.exportAll();
    expect(result).toHaveProperty("cache");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("exported_at");
  });

  test("exportAll events array contains all stored events", () => {
    const evts = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, evts);
    const result = storage.exportAll();
    expect(result.events).toHaveLength(2);
  });

  test("purge deletes events.jsonl, cache.json, and sync-cursor.json", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })]);
    storage.rebuildCache();
    storage.setSyncCursor(100);

    const eventsFile = path.join(tmpDir, "events.jsonl");
    const cacheFile = path.join(tmpDir, "cache.json");
    const syncFile = path.join(tmpDir, "sync-cursor.json");

    expect(fs.existsSync(eventsFile)).toBe(true);
    expect(fs.existsSync(cacheFile)).toBe(true);
    expect(fs.existsSync(syncFile)).toBe(true);

    storage.purge();

    expect(fs.existsSync(eventsFile)).toBe(false);
    expect(fs.existsSync(cacheFile)).toBe(false);
    expect(fs.existsSync(syncFile)).toBe(false);
  });

  test("purge resets in-memory cache", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })]);
    storage.rebuildCache();
    expect(storage._cache).not.toBeNull();

    storage.purge();
    expect(storage._cache).toBeNull();
  });

  test("purge is idempotent (no throw if files don't exist)", () => {
    expect(() => storage.purge()).not.toThrow();
  });

  test("isSessionImported returns false for unknown session", () => {
    expect(storage.isSessionImported("unknown-session")).toBe(false);
  });

  test("markSessionImported appends history_import event", () => {
    storage.markSessionImported("session-abc");
    const events = readEvents(tmpDir);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("history_import");
    expect(events[0].sid).toBe("session-abc");
  });

  test("isSessionImported/markSessionImported round-trip", () => {
    storage.markSessionImported("session-xyz");
    // Need to reload cache
    storage._cache = null;
    expect(storage.isSessionImported("session-xyz")).toBe(true);
  });

  test("getDataSize returns 0 when no files exist", () => {
    expect(storage.getDataSize()).toBe(0);
  });

  test("getDataSize returns sum of file sizes", () => {
    writeEvents(tmpDir, [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })]);
    storage.rebuildCache();
    const size = storage.getDataSize();
    expect(size).toBeGreaterThan(0);
  });

  test("getSyncCursor returns 0 when no cursor file exists", () => {
    expect(storage.getSyncCursor()).toBe(0);
  });

  test("setSyncCursor/getSyncCursor round-trip", () => {
    storage.setSyncCursor(12345);
    expect(storage.getSyncCursor()).toBe(12345);
  });

  test("getEventsSince returns empty array when no events file", () => {
    const events = storage.getEventsSince(0);
    expect(events).toEqual([]);
  });

  test("getEventsSince returns all events from offset 0", () => {
    const evts = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, evts);
    const events = storage.getEventsSince(0);
    expect(events).toHaveLength(2);
  });

  test("getEventsSince returns only events after given offset", () => {
    const evts = [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })];
    writeEvents(tmpDir, evts);

    // Get the byte offset after the first event
    const eventsFile = path.join(tmpDir, "events.jsonl");
    const firstEventSize = fs.statSync(eventsFile).size;

    // Append a second event
    const secondEvent = toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z" });
    fs.appendFileSync(eventsFile, `${JSON.stringify(secondEvent)}\n`);

    // Events since firstEventSize should only return the second event
    const events = storage.getEventsSince(firstEventSize);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_use");
  });
});

// ── Rich data: _emptyCache fields ─────────────────────────────────────────

describe("Rich data: _emptyCache fields", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("_emptyCache includes lang_counts as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("lang_counts");
    expect(cache.lang_counts).toEqual({});
  });

  test("_emptyCache includes lang_lines as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("lang_lines");
    expect(cache.lang_lines).toEqual({});
  });

  test("_emptyCache includes framework_counts as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("framework_counts");
    expect(cache.framework_counts).toEqual({});
  });

  test("_emptyCache includes project_stacks as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("project_stacks");
    expect(cache.project_stacks).toEqual({});
  });

  test("_emptyCache includes bash_categories as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("bash_categories");
    expect(cache.bash_categories).toEqual({});
  });

  test("_emptyCache includes bash_stacks as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("bash_stacks");
    expect(cache.bash_stacks).toEqual({});
  });

  test("_emptyCache includes repos as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("repos");
    expect(cache.repos).toEqual({});
  });

  test("_emptyCache includes models_used as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("models_used");
    expect(cache.models_used).toEqual({});
  });

  test("_emptyCache includes file_types_edited as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("file_types_edited");
    expect(cache.file_types_edited).toEqual({});
  });

  test("_emptyCache includes daily_lang_breakdown as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("daily_lang_breakdown");
    expect(cache.daily_lang_breakdown).toEqual({});
  });

  test("_emptyCache includes platforms as empty object", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("platforms");
    expect(cache.platforms).toEqual({});
  });

  test("_emptyCache includes total_chars_added initialized to 0", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("total_chars_added");
    expect(cache.total_chars_added).toBe(0);
  });

  test("_emptyCache includes total_chars_removed initialized to 0", () => {
    const cache = storage._emptyCache();
    expect(cache).toHaveProperty("total_chars_removed");
    expect(cache.total_chars_removed).toBe(0);
  });

  test("all new rich data fields exist with correct default types", () => {
    const cache = storage._emptyCache();
    const richFields = [
      "lang_counts",
      "lang_lines",
      "framework_counts",
      "project_stacks",
      "bash_categories",
      "bash_stacks",
      "repos",
      "models_used",
      "file_types_edited",
      "daily_lang_breakdown",
      "platforms",
    ];
    for (const field of richFields) {
      expect(cache).toHaveProperty(field);
      expect(typeof cache[field]).toBe("object");
      expect(Array.isArray(cache[field])).toBe(false);
    }
  });
});

// ── Rich data: session_start processing ──────────────────────────────────

describe("Rich data: session_start processing", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("session_start with project_stacks aggregates into cache", () => {
    const events = [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", project_stacks: ["typescript", "nextjs"] })];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.project_stacks).toEqual({ typescript: 1, nextjs: 1 });
  });

  test("multiple sessions with project_stacks accumulate", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", project_stacks: ["typescript"] }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", project_stacks: ["typescript", "python"] }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.project_stacks).toEqual({ typescript: 2, python: 1 });
  });

  test("session_start with repo creates repos entry with sessions counter", () => {
    const events = [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", repo: "sedhuait/orank" })];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.repos).toHaveProperty("sedhuait/orank");
    expect(cache.repos["sedhuait/orank"].sessions).toBe(1);
    expect(cache.repos["sedhuait/orank"].tools).toBe(0);
    expect(cache.repos["sedhuait/orank"].first_seen).toBe("2026-03-15T10:00:00Z");
  });

  test("multiple sessions in same repo increment sessions counter", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", repo: "sedhuait/orank" }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", repo: "sedhuait/orank" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.repos["sedhuait/orank"].sessions).toBe(2);
  });

  test("session_start with model aggregates into models_used", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", model: "opus-4" }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", model: "sonnet-4" }),
      sessionStartEvent({ ts: "2026-03-15T12:00:00Z", sid: "s3", model: "opus-4" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.models_used).toEqual({ "opus-4": 2, "sonnet-4": 1 });
  });

  test("session_start with platform aggregates into platforms", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", platform: "darwin" }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", platform: "linux" }),
      sessionStartEvent({ ts: "2026-03-15T12:00:00Z", sid: "s3", platform: "darwin" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.platforms).toEqual({ darwin: 2, linux: 1 });
  });

  test("session object includes repo, model, and langs fields", () => {
    const events = [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", repo: "test/repo", model: "opus-4" })];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const sessions = storage.getSessions();
    expect(sessions.s1).toHaveProperty("repo");
    expect(sessions.s1).toHaveProperty("model");
    expect(sessions.s1).toHaveProperty("langs");
    expect(sessions.s1.repo).toBe("test/repo");
    expect(sessions.s1.model).toBe("opus-4");
    expect(sessions.s1.langs).toEqual({});
  });

  test("session_start with missing fields does not error", () => {
    const events = [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" })];
    writeEvents(tmpDir, events);
    expect(() => storage.rebuildCache()).not.toThrow();
    const cache = storage.ensureFreshCache();
    expect(cache.project_stacks).toEqual({});
    expect(cache.repos).toEqual({});
  });

  test("empty project_stacks array does not add entries", () => {
    const events = [sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", project_stacks: [] })];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.project_stacks).toEqual({});
  });
});

// ── Rich data: tool_use processing ───────────────────────────────────────

describe("Rich data: tool_use processing", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("tool_use with lang aggregates into lang_counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", lang: "python" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", lang: "typescript" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.lang_counts).toEqual({ typescript: 2, python: 1 });
  });

  test("tool_use with lang updates session.langs", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", lang: "python" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const sessions = storage.getSessions();
    expect(sessions.s1.langs).toEqual({ typescript: 2, python: 1 });
  });

  test("tool_use with lang aggregates into daily_lang_breakdown", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", lang: "python" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", lang: "typescript" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.daily_lang_breakdown["2026-03-15"]).toEqual({ typescript: 2, python: 1 });
  });

  test("tool_use with frameworks aggregates into framework_counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", frameworks: ["react", "nextjs"] }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", frameworks: ["react"] }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.framework_counts).toEqual({ react: 2, nextjs: 1 });
  });

  test("tool_use with edit_size type=write adds to total_chars_added", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Write", { ts: "2026-03-15T10:01:00Z", edit_size: { type: "write", chars: 1000 } }),
      toolUseEvent("s1", "Write", { ts: "2026-03-15T10:02:00Z", edit_size: { type: "write", chars: 500 } }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.total_chars_added).toBe(1500);
  });

  test("tool_use with edit_size type=edit tracks chars_added and chars_removed", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", {
        ts: "2026-03-15T10:01:00Z",
        edit_size: { type: "edit", chars_added: 500, chars_removed: 200 },
      }),
      toolUseEvent("s1", "Edit", {
        ts: "2026-03-15T10:02:00Z",
        edit_size: { type: "edit", chars_added: 300, chars_removed: 100 },
      }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.total_chars_added).toBe(800);
    expect(cache.total_chars_removed).toBe(300);
  });

  test("tool_use with file_path extracts extension into file_types_edited", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", file_path: "/src/app.tsx", edit_size: { type: "edit", chars_added: 100, chars_removed: 0 } }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", file_path: "/src/main.py", edit_size: { type: "edit", chars_added: 50, chars_removed: 0 } }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", file_path: "/src/app.tsx", edit_size: { type: "edit", chars_added: 75, chars_removed: 0 } }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.file_types_edited).toEqual({ ".tsx": 2, ".py": 1 });
  });

  test("tool_use with lang and edit_size tracks lines in lang_lines", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", {
        ts: "2026-03-15T10:01:00Z",
        lang: "typescript",
        edit_size: { type: "edit", chars_added: 500, chars_removed: 200 },
      }),
      toolUseEvent("s1", "Edit", {
        ts: "2026-03-15T10:02:00Z",
        lang: "python",
        edit_size: { type: "write", chars: 1000 },
      }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.lang_lines.typescript).toEqual({ added: 500, removed: 200 });
    expect(cache.lang_lines.python).toEqual({ added: 1000, removed: 0 });
  });

  test("tool_use with bash.category aggregates into bash_categories", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z", bash: { category: "node", stack: "javascript" } }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:02:00Z", bash: { category: "testing", stack: "javascript" } }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:03:00Z", bash: { category: "node", stack: "javascript" } }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.bash_categories).toEqual({ node: 2, testing: 1 });
  });

  test("tool_use with bash.stack aggregates into bash_stacks", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z", bash: { category: "node", stack: "javascript" } }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:02:00Z", bash: { category: "git", stack: "python" } }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:03:00Z", bash: { category: "node", stack: "javascript" } }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.bash_stacks).toEqual({ javascript: 2, python: 1 });
  });

  test("tool_use in session with repo increments repos[repo].tools counter", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", repo: "sedhuait/orank" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:02:00Z" }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:03:00Z" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.repos["sedhuait/orank"].tools).toBe(3);
  });

  test("tool_use with missing lang/frameworks/bash fields does not error", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Read", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    expect(() => storage.rebuildCache()).not.toThrow();
  });

  test("tool_use with empty frameworks array does not add entries", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", frameworks: [] }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.framework_counts).toEqual({});
  });
});

// ── Rich data: tool_failure processing ────────────────────────────────────

describe("Rich data: tool_failure processing", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("tool_failure with lang aggregates into lang_counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z", lang: "python" }),
      toolFailureEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", lang: "typescript" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:03:00Z", lang: "python" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.lang_counts).toEqual({ python: 2, typescript: 1 });
  });

  test("tool_failure with missing lang field does not error", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    expect(() => storage.rebuildCache()).not.toThrow();
    const cache = storage.ensureFreshCache();
    expect(cache.lang_counts).toEqual({});
  });

  test("tool_failure lang tracking is independent of tool_use lang tracking", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", lang: "typescript" }),
      toolFailureEvent("s1", "Bash", { ts: "2026-03-15T10:02:00Z", lang: "python" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", lang: "typescript" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const cache = storage.ensureFreshCache();
    expect(cache.lang_counts).toEqual({ typescript: 2, python: 1 });
  });
});

// ── Rich data: public getters ────────────────────────────────────────────

describe("Rich data: public getters", () => {
  let storage;
  let tmpDir;
  let cleanup;

  beforeEach(() => {
    ({ storage, tmpDir, cleanup } = createTestStorage());
  });

  afterEach(() => {
    cleanup();
  });

  test("getLangBreakdown returns empty array when no data", () => {
    const breakdown = storage.getLangBreakdown();
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown).toHaveLength(0);
  });

  test("getLangBreakdown returns sorted array with pct field", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", lang: "python" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const breakdown = storage.getLangBreakdown();
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].lang).toBe("typescript");
    expect(breakdown[0].count).toBe(2);
    expect(breakdown[1].lang).toBe("python");
    expect(breakdown[1].count).toBe(1);
    // Check pct is a string representing percentage
    expect(typeof breakdown[0].pct).toBe("string");
    expect(breakdown[0].pct).toMatch(/^\d+(\.\d+)?$/);
  });

  test("getLangBreakdown sorts by count descending", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", lang: "python" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:03:00Z", lang: "typescript" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:04:00Z", lang: "typescript" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const breakdown = storage.getLangBreakdown();
    expect(breakdown[0].lang).toBe("typescript");
    expect(breakdown[1].lang).toBe("python");
  });

  test("getFrameworkBreakdown returns empty array when no data", () => {
    const breakdown = storage.getFrameworkBreakdown();
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown).toHaveLength(0);
  });

  test("getFrameworkBreakdown returns sorted array", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z", frameworks: ["react", "nextjs"] }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:02:00Z", frameworks: ["react"] }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const breakdown = storage.getFrameworkBreakdown();
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].name).toBe("react");
    expect(breakdown[0].count).toBe(2);
    expect(breakdown[1].name).toBe("nextjs");
  });

  test("getRepos returns empty array when no data", () => {
    const repos = storage.getRepos();
    expect(Array.isArray(repos)).toBe(true);
    expect(repos).toHaveLength(0);
  });

  test("getRepos returns repos with sessions, tools, and first_seen", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", repo: "repo-a" }),
      toolUseEvent("s1", "Edit", { ts: "2026-03-15T10:01:00Z" }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", repo: "repo-a" }),
      toolUseEvent("s2", "Read", { ts: "2026-03-15T11:01:00Z" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const repos = storage.getRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe("repo-a");
    expect(repos[0].sessions).toBe(2);
    expect(repos[0].tools).toBe(2);
    expect(repos[0].first_seen).toBe("2026-03-15T10:00:00Z");
  });

  test("getRepos sorts by sessions descending", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", repo: "repo-a" }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", repo: "repo-b" }),
      sessionStartEvent({ ts: "2026-03-15T12:00:00Z", sid: "s3", repo: "repo-b" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const repos = storage.getRepos();
    expect(repos[0].name).toBe("repo-b");
    expect(repos[1].name).toBe("repo-a");
  });

  test("getModelsUsed returns empty array when no data", () => {
    const models = storage.getModelsUsed();
    expect(Array.isArray(models)).toBe(true);
    expect(models).toHaveLength(0);
  });

  test("getModelsUsed returns sorted models with counts", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", model: "opus-4" }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", model: "sonnet-4" }),
      sessionStartEvent({ ts: "2026-03-15T12:00:00Z", sid: "s3", model: "opus-4" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const models = storage.getModelsUsed();
    expect(models).toHaveLength(2);
    expect(models[0].model).toBe("opus-4");
    expect(models[0].count).toBe(2);
    expect(models[1].model).toBe("sonnet-4");
  });

  test("getBashCategories returns empty array when no data", () => {
    const categories = storage.getBashCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories).toHaveLength(0);
  });

  test("getBashCategories returns sorted categories", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:01:00Z", bash: { category: "node", stack: "javascript" } }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:02:00Z", bash: { category: "testing", stack: "javascript" } }),
      toolUseEvent("s1", "Bash", { ts: "2026-03-15T10:03:00Z", bash: { category: "node", stack: "javascript" } }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const categories = storage.getBashCategories();
    expect(categories).toHaveLength(2);
    expect(categories[0].category).toBe("node");
    expect(categories[0].count).toBe(2);
    expect(categories[1].category).toBe("testing");
  });

  test("getEditStats returns zero totals when no data", () => {
    const stats = storage.getEditStats();
    expect(stats.total_chars_added).toBe(0);
    expect(stats.total_chars_removed).toBe(0);
    expect(Array.isArray(stats.file_types)).toBe(true);
    expect(stats.file_types).toHaveLength(0);
  });

  test("getEditStats returns aggregated edit data", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Write", { ts: "2026-03-15T10:01:00Z", file_path: "/src/app.tsx", edit_size: { type: "write", chars: 1000 } }),
      toolUseEvent("s1", "Edit", {
        ts: "2026-03-15T10:02:00Z",
        file_path: "/src/main.py",
        edit_size: { type: "edit", chars_added: 500, chars_removed: 200 },
      }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const stats = storage.getEditStats();
    expect(stats.total_chars_added).toBe(1500);
    expect(stats.total_chars_removed).toBe(200);
    expect(stats.file_types).toHaveLength(2);
    expect(stats.file_types[0].ext).toBe(".tsx");
  });

  test("getEditStats returns lang_lines object", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1" }),
      toolUseEvent("s1", "Edit", {
        ts: "2026-03-15T10:01:00Z",
        lang: "typescript",
        edit_size: { type: "edit", chars_added: 500, chars_removed: 200 },
      }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const stats = storage.getEditStats();
    expect(stats.lang_lines).toHaveProperty("typescript");
    expect(stats.lang_lines.typescript.added).toBe(500);
    expect(stats.lang_lines.typescript.removed).toBe(200);
  });

  test("getProjectStacks returns empty array when no data", () => {
    const stacks = storage.getProjectStacks();
    expect(Array.isArray(stacks)).toBe(true);
    expect(stacks).toHaveLength(0);
  });

  test("getProjectStacks returns sorted stacks", () => {
    const events = [
      sessionStartEvent({ ts: "2026-03-15T10:00:00Z", sid: "s1", project_stacks: ["typescript", "nextjs"] }),
      sessionStartEvent({ ts: "2026-03-15T11:00:00Z", sid: "s2", project_stacks: ["typescript"] }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const stacks = storage.getProjectStacks();
    expect(stacks).toHaveLength(2);
    expect(stacks[0].stack).toBe("typescript");
    expect(stacks[0].count).toBe(2);
    expect(stacks[1].stack).toBe("nextjs");
  });

  test("getDailyLangBreakdown returns object with date keys for last N days", () => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const events = [
      sessionStartEvent({ ts: `${today}T10:00:00Z`, sid: "s1" }),
      toolUseEvent("s1", "Edit", { ts: `${today}T10:01:00Z`, lang: "typescript" }),
      sessionStartEvent({ ts: `${yesterday}T10:00:00Z`, sid: "s2" }),
      toolUseEvent("s2", "Edit", { ts: `${yesterday}T10:01:00Z`, lang: "python" }),
    ];
    writeEvents(tmpDir, events);
    storage.rebuildCache();
    const breakdown = storage.getDailyLangBreakdown(2);
    expect(breakdown).toHaveProperty(today);
    expect(breakdown).toHaveProperty(yesterday);
    expect(breakdown[today]).toEqual({ typescript: 1 });
    expect(breakdown[yesterday]).toEqual({ python: 1 });
  });

  test("getDailyLangBreakdown default days parameter is 28", () => {
    const breakdown = storage.getDailyLangBreakdown();
    expect(Object.keys(breakdown).length).toBe(28);
  });

  test("getDailyLangBreakdown returns empty objects for days without data", () => {
    const breakdown = storage.getDailyLangBreakdown(3);
    const dates = Object.keys(breakdown);
    expect(dates.length).toBe(3);
    for (const date of dates) {
      expect(typeof breakdown[date]).toBe("object");
    }
  });
});
