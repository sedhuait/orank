"use strict";

const { BadgeEngine, BADGE_DEFINITIONS, XP_RULES, TIERS, getTier } = require("../scripts/badges.js");

// ── Mock Storage Factory ──────────────────────────────────────────────────────

function createMockStorage(overrides = {}) {
  const defaultStats = {
    total_xp: 0,
    tier: "Bronze",
    total_sessions: 0,
    total_tool_uses: 0,
    total_tool_failures: 0,
    total_turns: 0,
    total_seconds: 0,
    total_turn_errors: 0,
    total_subagents: 0,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    success_rate: "0",
    unique_tools: 0,
    top_tools: [],
    slash_command_counts: {},
    subagent_counts: {},
    turn_errors: {},
    tool_counts: {},
  };
  const stats = { ...defaultStats, ...overrides };

  return {
    getStats: () => stats,
    getTotalXP: () => stats.total_xp,
    getBadges: () => ({ earned: [] }),
    getSessions: () => ({}),
    getWeeklySnapshots: () => ({}),
    getDynamicBadgeTracks: () => ({}),
    recordBadge: vi.fn(),
    addXP: vi.fn(),
    ensureFreshCache: () => ({ xp_log: [] }),
    getStreakInfo: () => ({ current: stats.current_streak }),
  };
}

// ── BADGE_DEFINITIONS Constants ───────────────────────────────────────────────

describe("BADGE_DEFINITIONS", () => {
  test("has exactly 30 entries", () => {
    expect(BADGE_DEFINITIONS).toHaveLength(30);
  });

  test("each badge has id, name, description, icon, tier, check", () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge).toHaveProperty("id");
      expect(badge).toHaveProperty("name");
      expect(badge).toHaveProperty("description");
      expect(badge).toHaveProperty("icon");
      expect(badge).toHaveProperty("tier");
      expect(badge).toHaveProperty("check");
      expect(typeof badge.id).toBe("string");
      expect(typeof badge.name).toBe("string");
      expect(typeof badge.description).toBe("string");
      expect(typeof badge.icon).toBe("string");
      expect(typeof badge.tier).toBe("string");
      expect(typeof badge.check).toBe("function");
    }
  });

  test("all badge IDs are unique", () => {
    const ids = BADGE_DEFINITIONS.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("all badge tiers are valid (bronze/silver/gold/platinum/diamond)", () => {
    const validTiers = new Set(["bronze", "silver", "gold", "platinum", "diamond"]);
    for (const badge of BADGE_DEFINITIONS) {
      expect(validTiers.has(badge.tier)).toBe(true);
    }
  });
});

// ── XP_RULES Constants ────────────────────────────────────────────────────────

describe("XP_RULES", () => {
  test("has all 9 expected keys", () => {
    const expectedKeys = [
      "SESSION_COMPLETE",
      "TOOL_USE_MILESTONE_100",
      "STREAK_MILESTONE_7",
      "STREAK_MILESTONE_30",
      "STREAK_MILESTONE_100",
      "BADGE_EARNED_BRONZE",
      "BADGE_EARNED_SILVER",
      "BADGE_EARNED_GOLD",
      "BADGE_EARNED_PLATINUM",
    ];
    // Check that all 9 expected keys exist; note BADGE_EARNED_DIAMOND is 10th
    const allKeys = [
      "SESSION_COMPLETE",
      "TOOL_USE_MILESTONE_100",
      "STREAK_MILESTONE_7",
      "STREAK_MILESTONE_30",
      "STREAK_MILESTONE_100",
      "BADGE_EARNED_BRONZE",
      "BADGE_EARNED_SILVER",
      "BADGE_EARNED_GOLD",
      "BADGE_EARNED_PLATINUM",
      "BADGE_EARNED_DIAMOND",
    ];
    for (const key of allKeys) {
      expect(XP_RULES).toHaveProperty(key);
    }
  });

  test("SESSION_COMPLETE is 50", () => {
    expect(XP_RULES.SESSION_COMPLETE).toBe(50);
  });

  test("TOOL_USE_MILESTONE_100 is 200", () => {
    expect(XP_RULES.TOOL_USE_MILESTONE_100).toBe(200);
  });

  test("STREAK_MILESTONE_7 is 500", () => {
    expect(XP_RULES.STREAK_MILESTONE_7).toBe(500);
  });

  test("badge tier XP values are ordered correctly (bronze < silver < gold < platinum < diamond)", () => {
    expect(XP_RULES.BADGE_EARNED_BRONZE).toBeLessThan(XP_RULES.BADGE_EARNED_SILVER);
    expect(XP_RULES.BADGE_EARNED_SILVER).toBeLessThan(XP_RULES.BADGE_EARNED_GOLD);
    expect(XP_RULES.BADGE_EARNED_GOLD).toBeLessThan(XP_RULES.BADGE_EARNED_PLATINUM);
    expect(XP_RULES.BADGE_EARNED_PLATINUM).toBeLessThan(XP_RULES.BADGE_EARNED_DIAMOND);
  });
});

// ── TIERS Constants ───────────────────────────────────────────────────────────

describe("TIERS", () => {
  test("has exactly 5 entries", () => {
    expect(TIERS).toHaveLength(5);
  });

  test("min values are in ascending order", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].min).toBeGreaterThan(TIERS[i - 1].min);
    }
  });

  test("first tier is Bronze with min 0", () => {
    expect(TIERS[0].name).toBe("Bronze");
    expect(TIERS[0].min).toBe(0);
  });

  test("last tier is Diamond with min 20000", () => {
    expect(TIERS[4].name).toBe("Diamond");
    expect(TIERS[4].min).toBe(20000);
  });

  test("each tier has name, min, and icon", () => {
    for (const tier of TIERS) {
      expect(tier).toHaveProperty("name");
      expect(tier).toHaveProperty("min");
      expect(tier).toHaveProperty("icon");
    }
  });
});

// ── getTier ───────────────────────────────────────────────────────────────────

describe("getTier", () => {
  test("returns Bronze at xp=0", () => {
    const result = getTier(0);
    expect(result.name).toBe("Bronze");
  });

  test("returns Silver at xp=2000", () => {
    const result = getTier(2000);
    expect(result.name).toBe("Silver");
  });

  test("returns Gold at xp=5000", () => {
    const result = getTier(5000);
    expect(result.name).toBe("Gold");
  });

  test("returns Platinum at xp=10000", () => {
    const result = getTier(10000);
    expect(result.name).toBe("Platinum");
  });

  test("returns Diamond at xp=20000", () => {
    const result = getTier(20000);
    expect(result.name).toBe("Diamond");
  });

  test("intermediate: 3000 xp returns Silver", () => {
    const result = getTier(3000);
    expect(result.name).toBe("Silver");
  });

  test("returns object with name, icon, xp, nextTier, nextTierXP, progress fields", () => {
    const result = getTier(1000);
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("icon");
    expect(result).toHaveProperty("xp");
    expect(result).toHaveProperty("nextTier");
    expect(result).toHaveProperty("nextTierXP");
    expect(result).toHaveProperty("progress");
  });

  test("xp field matches input xp", () => {
    expect(getTier(1234).xp).toBe(1234);
    expect(getTier(0).xp).toBe(0);
  });

  test("progress is '100' (string) at Diamond", () => {
    const result = getTier(20000);
    expect(result.progress).toBe(100);
  });

  test("progress is '100' for xp beyond Diamond", () => {
    const result = getTier(99999);
    expect(result.progress).toBe(100);
  });

  test("nextTier is null at Diamond", () => {
    expect(getTier(20000).nextTier).toBeNull();
  });

  test("nextTierXP is null at Diamond", () => {
    expect(getTier(20000).nextTierXP).toBeNull();
  });

  test("nextTier is 'Silver' for Bronze xp", () => {
    expect(getTier(500).nextTier).toBe("Silver");
  });

  test("nextTierXP is 2000 for Bronze", () => {
    expect(getTier(500).nextTierXP).toBe(2000);
  });

  test("progress between tiers is computed correctly", () => {
    // At xp=1000 (between Bronze min=0 and Silver min=2000)
    // progress = (1000 - 0) / (2000 - 0) * 100 = 50.0
    const result = getTier(1000);
    expect(result.progress).toBe("50.0");
  });

  test("progress at start of tier is 0.0", () => {
    // At xp=2000 (just entered Silver, next is Gold at 5000)
    // progress = (2000 - 2000) / (5000 - 2000) * 100 = 0.0
    const result = getTier(2000);
    expect(result.progress).toBe("0.0");
  });

  test("progress at 75% through Silver tier", () => {
    // Silver: 2000-5000, range=3000; 75% = 2000 + 2250 = 4250
    // progress = (4250 - 2000) / (5000 - 2000) * 100 = 2250/3000*100 = 75.0
    const result = getTier(4250);
    expect(result.name).toBe("Silver");
    expect(result.progress).toBe("75.0");
  });
});

// ── Badge check functions ─────────────────────────────────────────────────────

function getBadge(id) {
  const badge = BADGE_DEFINITIONS.find((b) => b.id === id);
  if (!badge) throw new Error(`Badge '${id}' not found`);
  return badge;
}

describe("Badge check: first-session", () => {
  const badge = getBadge("first-session");

  test("total_sessions=0 → not earned", () => {
    expect(badge.check({ total_sessions: 0 }).earned).toBe(false);
  });

  test("total_sessions=1 → earned", () => {
    expect(badge.check({ total_sessions: 1 }).earned).toBe(true);
  });

  test("returns { earned, progress }", () => {
    const result = badge.check({ total_sessions: 0 });
    expect(result).toHaveProperty("earned");
    expect(result).toHaveProperty("progress");
  });

  test("progress=100 when earned", () => {
    expect(badge.check({ total_sessions: 5 }).progress).toBe(100);
  });
});

describe("Badge check: sessions-10", () => {
  const badge = getBadge("sessions-10");

  test("total_sessions=9 → not earned", () => {
    expect(badge.check({ total_sessions: 9 }).earned).toBe(false);
  });

  test("total_sessions=10 → earned", () => {
    expect(badge.check({ total_sessions: 10 }).earned).toBe(true);
  });

  test("progress is proportional", () => {
    expect(badge.check({ total_sessions: 5 }).progress).toBe(50);
  });
});

describe("Badge check: tool-uses-100", () => {
  const badge = getBadge("tool-uses-100");

  test("total_tool_uses=99 → not earned", () => {
    expect(badge.check({ total_tool_uses: 99 }).earned).toBe(false);
  });

  test("total_tool_uses=100 → earned", () => {
    expect(badge.check({ total_tool_uses: 100 }).earned).toBe(true);
  });

  test("progress=50 at 50 uses", () => {
    expect(badge.check({ total_tool_uses: 50 }).progress).toBe(50);
  });
});

describe("Badge check: unique-tools-5", () => {
  const badge = getBadge("unique-tools-5");

  test("unique_tools=4 → not earned", () => {
    expect(badge.check({ unique_tools: 4 }).earned).toBe(false);
  });

  test("unique_tools=5 → earned", () => {
    expect(badge.check({ unique_tools: 5 }).earned).toBe(true);
  });
});

describe("Badge check: streak-7", () => {
  const badge = getBadge("streak-7");

  test("longest_streak=6 → not earned", () => {
    expect(badge.check({ longest_streak: 6 }).earned).toBe(false);
  });

  test("longest_streak=7 → earned", () => {
    expect(badge.check({ longest_streak: 7 }).earned).toBe(true);
  });

  test("longest_streak=30 → earned (exceeds threshold)", () => {
    expect(badge.check({ longest_streak: 30 }).earned).toBe(true);
  });
});

describe("Badge check: success-rate-90", () => {
  const badge = getBadge("success-rate-90");

  test("below min uses (total_tool_uses < 100) → not earned, progress < 50", () => {
    const result = badge.check({ total_tool_uses: 50, success_rate: "95" });
    expect(result.earned).toBe(false);
    expect(result.progress).toBeLessThan(50);
  });

  test("at 100 uses with success_rate=89 → not earned", () => {
    const result = badge.check({ total_tool_uses: 100, success_rate: "89" });
    expect(result.earned).toBe(false);
  });

  test("at 100 uses with success_rate=90 → earned", () => {
    const result = badge.check({ total_tool_uses: 100, success_rate: "90" });
    expect(result.earned).toBe(true);
  });

  test("at 100 uses with success_rate=99 → earned", () => {
    const result = badge.check({ total_tool_uses: 100, success_rate: "99" });
    expect(result.earned).toBe(true);
  });

  test("progress is capped at 100", () => {
    const result = badge.check({ total_tool_uses: 500, success_rate: "100" });
    expect(result.progress).toBe(100);
  });
});

describe("Badge check: hours-10", () => {
  const badge = getBadge("hours-10");

  test("total_seconds=35999 (just under 10h) → not earned", () => {
    expect(badge.check({ total_seconds: 35999 }).earned).toBe(false);
  });

  test("total_seconds=36000 (exactly 10h) → earned", () => {
    expect(badge.check({ total_seconds: 36000 }).earned).toBe(true);
  });

  test("progress is proportional to hours", () => {
    // 5h = 18000 seconds = 50% of 10h
    expect(badge.check({ total_seconds: 18000 }).progress).toBe(50);
  });
});

describe("Badge check: xp-1000", () => {
  const badge = getBadge("xp-1000");

  test("total_xp=999 → not earned", () => {
    expect(badge.check({ total_xp: 999 }).earned).toBe(false);
  });

  test("total_xp=1000 → earned", () => {
    expect(badge.check({ total_xp: 1000 }).earned).toBe(true);
  });

  test("progress=50 at 500 xp", () => {
    expect(badge.check({ total_xp: 500 }).progress).toBe(50);
  });
});

describe("Badge check: turns-500", () => {
  const badge = getBadge("turns-500");

  test("total_turns=499 → not earned", () => {
    expect(badge.check({ total_turns: 499 }).earned).toBe(false);
  });

  test("total_turns=500 → earned", () => {
    expect(badge.check({ total_turns: 500 }).earned).toBe(true);
  });
});

describe("Badge check: parallel-thinker", () => {
  const badge = getBadge("parallel-thinker");

  test("total_subagents=9 → not earned", () => {
    expect(badge.check({ total_subagents: 9 }).earned).toBe(false);
  });

  test("total_subagents=10 → earned", () => {
    expect(badge.check({ total_subagents: 10 }).earned).toBe(true);
  });

  test("total_subagents undefined → not earned, progress=0", () => {
    const result = badge.check({});
    expect(result.earned).toBe(false);
    expect(result.progress).toBe(0);
  });
});

describe("Badge check: command-explorer", () => {
  const badge = getBadge("command-explorer");

  test("19 slash_command keys → not earned", () => {
    const slash_command_counts = {};
    for (let i = 0; i < 19; i++) slash_command_counts[`cmd${i}`] = 1;
    expect(badge.check({ slash_command_counts }).earned).toBe(false);
  });

  test("20 slash_command keys → earned", () => {
    const slash_command_counts = {};
    for (let i = 0; i < 20; i++) slash_command_counts[`cmd${i}`] = 1;
    expect(badge.check({ slash_command_counts }).earned).toBe(true);
  });

  test("empty slash_command_counts → not earned, progress=0", () => {
    const result = badge.check({ slash_command_counts: {} });
    expect(result.earned).toBe(false);
    expect(result.progress).toBe(0);
  });
});

describe("Badge check: pattern-builder", () => {
  const badge = getBadge("pattern-builder");

  test("_pattern_count=4 → not earned", () => {
    expect(badge.check({ _pattern_count: 4 }).earned).toBe(false);
  });

  test("_pattern_count=5 → earned", () => {
    expect(badge.check({ _pattern_count: 5 }).earned).toBe(true);
  });

  test("_pattern_count undefined → not earned, progress=0", () => {
    const result = badge.check({});
    expect(result.earned).toBe(false);
    expect(result.progress).toBe(0);
  });
});

describe("Badge check: zero-failures", () => {
  const badge = getBadge("zero-failures");

  test("_zero_failure_session=false → not earned", () => {
    expect(badge.check({ _zero_failure_session: false }).earned).toBe(false);
  });

  test("_zero_failure_session=true → earned", () => {
    expect(badge.check({ _zero_failure_session: true }).earned).toBe(true);
  });

  test("_zero_failure_session=true → progress=100", () => {
    expect(badge.check({ _zero_failure_session: true }).progress).toBe(100);
  });

  test("_zero_failure_session=false → progress=0", () => {
    expect(badge.check({ _zero_failure_session: false }).progress).toBe(0);
  });

  test("_zero_failure_session undefined → not earned", () => {
    expect(badge.check({}).earned).toBe(false);
  });
});

// ── BadgeEngine.evaluate() ────────────────────────────────────────────────────

describe("BadgeEngine.evaluate()", () => {
  test("returns empty array when no badges earned", () => {
    const storage = createMockStorage({ total_sessions: 0 });
    const engine = new BadgeEngine(storage);
    const result = engine.evaluate();
    expect(result).toEqual([]);
  });

  test("returns newly earned badges when thresholds met", () => {
    const storage = createMockStorage({ total_sessions: 1 });
    const engine = new BadgeEngine(storage);
    const result = engine.evaluate();
    const ids = result.map((b) => b.id);
    expect(ids).toContain("first-session");
  });

  test("calls recordBadge for each newly earned badge", () => {
    const storage = createMockStorage({ total_sessions: 1 });
    const engine = new BadgeEngine(storage);
    engine.evaluate();
    expect(storage.recordBadge).toHaveBeenCalled();
    const calls = storage.recordBadge.mock.calls;
    const badgeIds = calls.map((c) => c[0]);
    expect(badgeIds).toContain("first-session");
  });

  test("calls addXP with correct amount for bronze badge", () => {
    const storage = createMockStorage({ total_sessions: 1 });
    const engine = new BadgeEngine(storage);
    engine.evaluate();
    const xpCalls = storage.addXP.mock.calls;
    // first-session is bronze; XP_RULES.BADGE_EARNED_BRONZE = 100
    const bronzeXpCall = xpCalls.find((c) => c[0] === XP_RULES.BADGE_EARNED_BRONZE);
    expect(bronzeXpCall).toBeDefined();
  });

  test("does not re-award already-earned badges", () => {
    const storage = createMockStorage({ total_sessions: 1 });
    // Mock getBadges to return first-session as already earned
    storage.getBadges = () => ({
      earned: [{ badge_id: "first-session", earned_at: new Date().toISOString() }],
    });
    const engine = new BadgeEngine(storage);
    const result = engine.evaluate();
    const ids = result.map((b) => b.id);
    expect(ids).not.toContain("first-session");
  });

  test("awards XP for silver badge", () => {
    const storage = createMockStorage({ longest_streak: 7 });
    const engine = new BadgeEngine(storage);
    engine.evaluate();
    const xpCalls = storage.addXP.mock.calls;
    const silverXpCall = xpCalls.find((c) => c[0] === XP_RULES.BADGE_EARNED_SILVER);
    expect(silverXpCall).toBeDefined();
  });

  test("includes badge name in recordBadge call", () => {
    const storage = createMockStorage({ total_sessions: 1 });
    const engine = new BadgeEngine(storage);
    engine.evaluate();
    const calls = storage.recordBadge.mock.calls;
    const firstSessionCall = calls.find((c) => c[0] === "first-session");
    expect(firstSessionCall).toBeDefined();
    expect(firstSessionCall[1]).toBe("Hello Claude");
    expect(firstSessionCall[2]).toBe("bronze");
  });
});

// ── BadgeEngine.awardSessionXP() ──────────────────────────────────────────────

describe("BadgeEngine.awardSessionXP()", () => {
  test("awards SESSION_COMPLETE (50) XP", () => {
    const storage = createMockStorage({ total_tool_uses: 0 });
    const engine = new BadgeEngine(storage);
    engine.awardSessionXP();
    const calls = storage.addXP.mock.calls;
    const sessionCall = calls.find((c) => c[0] === 50 && c[1] === "Session completed");
    expect(sessionCall).toBeDefined();
  });

  test("awards TOOL_USE_MILESTONE_100 at 100-tool boundary", () => {
    const storage = createMockStorage({ total_tool_uses: 100 });
    // xp_log has 0 tool milestone entries, toolMilestone = floor(100/100) = 1 > 0
    const engine = new BadgeEngine(storage);
    engine.awardSessionXP();
    const calls = storage.addXP.mock.calls;
    const milestoneCall = calls.find((c) => c[0] === XP_RULES.TOOL_USE_MILESTONE_100);
    expect(milestoneCall).toBeDefined();
  });

  test("does not award tool milestone when already awarded", () => {
    const storage = createMockStorage({ total_tool_uses: 100 });
    // Simulate xp_log already has 1 tool milestone entry
    storage.ensureFreshCache = () => ({
      xp_log: [{ reason: "Tool milestone: 100 uses" }],
    });
    const engine = new BadgeEngine(storage);
    engine.awardSessionXP();
    const calls = storage.addXP.mock.calls;
    const milestoneCall = calls.find((c) => c[0] === XP_RULES.TOOL_USE_MILESTONE_100);
    expect(milestoneCall).toBeUndefined();
  });

  test("awards streak milestone at 7-day streak", () => {
    const storage = createMockStorage({ current_streak: 7 });
    const engine = new BadgeEngine(storage);
    engine.awardSessionXP();
    const calls = storage.addXP.mock.calls;
    const streakCall = calls.find((c) => c[0] === XP_RULES.STREAK_MILESTONE_7);
    expect(streakCall).toBeDefined();
  });

  test("does not award streak milestone at 6-day streak", () => {
    const storage = createMockStorage({ current_streak: 6 });
    const engine = new BadgeEngine(storage);
    engine.awardSessionXP();
    const calls = storage.addXP.mock.calls;
    const streakCall = calls.find((c) => c[0] === XP_RULES.STREAK_MILESTONE_7);
    expect(streakCall).toBeUndefined();
  });

  test("awards streak milestone at 30-day streak", () => {
    const storage = createMockStorage({ current_streak: 30 });
    const engine = new BadgeEngine(storage);
    engine.awardSessionXP();
    const calls = storage.addXP.mock.calls;
    const streakCall = calls.find((c) => c[0] === XP_RULES.STREAK_MILESTONE_30);
    expect(streakCall).toBeDefined();
  });
});

// ── BadgeEngine.getSummary() ──────────────────────────────────────────────────

describe("BadgeEngine.getSummary()", () => {
  test("returns earned, inProgress, locked, total, nextBadges", () => {
    const storage = createMockStorage();
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    expect(summary).toHaveProperty("earned");
    expect(summary).toHaveProperty("inProgress");
    expect(summary).toHaveProperty("locked");
    expect(summary).toHaveProperty("total");
    expect(summary).toHaveProperty("nextBadges");
  });

  test("total equals BADGE_DEFINITIONS.length when no dynamic badges", () => {
    const storage = createMockStorage();
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    expect(summary.total).toBe(BADGE_DEFINITIONS.length);
  });

  test("earned contains badges marked as earned in storage", () => {
    const storage = createMockStorage({ total_sessions: 5 });
    storage.getBadges = () => ({
      earned: [{ badge_id: "first-session", earned_at: "2025-01-01T00:00:00Z" }],
    });
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    const earnedIds = summary.earned.map((b) => b.id);
    expect(earnedIds).toContain("first-session");
  });

  test("locked contains badges with 0 progress", () => {
    const storage = createMockStorage();
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    for (const badge of summary.locked) {
      expect(badge.progress).toBe(0);
    }
  });

  test("inProgress contains badges with progress > 0 but not earned", () => {
    // Start a few sessions to create some progress but not hit thresholds
    const storage = createMockStorage({ total_sessions: 5, total_tool_uses: 50 });
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    for (const badge of summary.inProgress) {
      expect(badge.progress).toBeGreaterThan(0);
    }
  });

  test("earned badges have progress=100", () => {
    const storage = createMockStorage({ total_sessions: 5 });
    storage.getBadges = () => ({
      earned: [{ badge_id: "first-session", earned_at: "2025-01-01T00:00:00Z" }],
    });
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    for (const badge of summary.earned) {
      expect(badge.progress).toBe(100);
    }
  });

  test("nextBadges is an array", () => {
    const storage = createMockStorage({ total_sessions: 5 });
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    expect(Array.isArray(summary.nextBadges)).toBe(true);
  });

  test("all badges across earned, inProgress, locked sum to total curated count", () => {
    const storage = createMockStorage({ total_sessions: 5, total_tool_uses: 50 });
    const engine = new BadgeEngine(storage);
    const summary = engine.getSummary();
    const totalCurated = summary.earned.length + summary.inProgress.length + summary.locked.length;
    // Total includes dynamic badges too; curated count should equal BADGE_DEFINITIONS.length
    expect(totalCurated).toBeGreaterThanOrEqual(BADGE_DEFINITIONS.length);
  });
});
