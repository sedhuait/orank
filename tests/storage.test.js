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
