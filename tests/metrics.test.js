"use strict";

const { computeMetrics, computeTrends, getWeekKey, getGrade, WEIGHTS } = require("../scripts/metrics");

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSessions(toolsOrdered) {
  return { s1: { tools_ordered: toolsOrdered } };
}

function toolsAt(toolNames, baseTs, gapMs = 1000) {
  const base = new Date(baseTs).getTime();
  return toolNames.map((tool, i) => ({
    tool,
    ts: new Date(base + i * gapMs).toISOString(),
  }));
}

// ── WEIGHTS ──────────────────────────────────────────────────────────────────

describe("WEIGHTS", () => {
  test("has all 5 required keys", () => {
    expect(WEIGHTS).toHaveProperty("success_rate");
    expect(WEIGHTS).toHaveProperty("throughput");
    expect(WEIGHTS).toHaveProperty("breadth");
    expect(WEIGHTS).toHaveProperty("retry_rate");
    expect(WEIGHTS).toHaveProperty("workflow_score");
  });

  test("values sum to exactly 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  test("each weight is a positive number", () => {
    for (const [key, val] of Object.entries(WEIGHTS)) {
      expect(typeof val).toBe("number");
      expect(val).toBeGreaterThan(0);
    }
  });
});

// ── getGrade ─────────────────────────────────────────────────────────────────

describe("getGrade", () => {
  test("A+ for score 95", () => expect(getGrade(95)).toBe("A+"));
  test("A for score 90", () => expect(getGrade(90)).toBe("A"));
  test("A- for score 85", () => expect(getGrade(85)).toBe("A-"));
  test("B+ for score 80", () => expect(getGrade(80)).toBe("B+"));
  test("B for score 75", () => expect(getGrade(75)).toBe("B"));
  test("B- for score 70", () => expect(getGrade(70)).toBe("B-"));
  test("C+ for score 65", () => expect(getGrade(65)).toBe("C+"));
  test("C for score 60", () => expect(getGrade(60)).toBe("C"));
  test("C- for score 55", () => expect(getGrade(55)).toBe("C-"));
  test("D for score 40", () => expect(getGrade(40)).toBe("D"));
  test("F for score 0", () => expect(getGrade(0)).toBe("F"));

  test("boundary: 94.9 → A (not A+)", () => expect(getGrade(94.9)).toBe("A"));
  test("boundary: 95 → A+", () => expect(getGrade(95)).toBe("A+"));

  test("negative score → F", () => expect(getGrade(-1)).toBe("F"));
  test("score above 100 → A+", () => expect(getGrade(101)).toBe("A+"));
});

// ── computeMetrics ───────────────────────────────────────────────────────────

describe("computeMetrics", () => {
  const BASE = {
    totalTools: 0,
    totalFailures: 0,
    totalSeconds: 0,
    uniqueToolsInWindow: 0,
    totalDistinctToolsEver: 0,
    sessions: {},
  };

  test("returns all 7 expected keys", () => {
    const result = computeMetrics(BASE);
    for (const key of ["success_rate", "throughput", "breadth", "retry_rate", "workflow_score", "composite", "grade"]) {
      expect(result).toHaveProperty(key);
    }
    expect(Object.keys(result)).toHaveLength(7);
  });

  describe("success_rate", () => {
    test("totalTools=0 → success_rate=100", () => {
      const r = computeMetrics(BASE);
      expect(r.success_rate).toBe(100);
    });

    test("totalFailures=0 → success_rate=100", () => {
      const r = computeMetrics({ ...BASE, totalTools: 50, totalFailures: 0 });
      expect(r.success_rate).toBe(100);
    });

    test("half failures → success_rate=50", () => {
      const r = computeMetrics({ ...BASE, totalTools: 100, totalFailures: 50 });
      expect(r.success_rate).toBe(50);
    });

    test("all failures → success_rate=0", () => {
      const r = computeMetrics({ ...BASE, totalTools: 10, totalFailures: 10 });
      expect(r.success_rate).toBe(0);
    });
  });

  describe("throughput", () => {
    test("totalSeconds=0 → throughput=0", () => {
      const r = computeMetrics(BASE);
      expect(r.throughput).toBe(0);
    });

    test("600 tools / 3600 seconds = 10 tools/min (raw)", () => {
      const r = computeMetrics({ ...BASE, totalTools: 600, totalSeconds: 3600 });
      expect(r.throughput).toBe(10);
    });

    test("30 tools / 60 seconds = 30 tools/min (raw)", () => {
      const r = computeMetrics({ ...BASE, totalTools: 30, totalSeconds: 60 });
      expect(r.throughput).toBe(30);
    });
  });

  describe("breadth", () => {
    test("5 unique / 10 total → breadth=50", () => {
      const r = computeMetrics({ ...BASE, totalTools: 10, uniqueToolsInWindow: 5, totalDistinctToolsEver: 10 });
      expect(r.breadth).toBe(50);
    });

    test("totalDistinctToolsEver=0 → breadth=0", () => {
      const r = computeMetrics({ ...BASE, uniqueToolsInWindow: 5, totalDistinctToolsEver: 0 });
      expect(r.breadth).toBe(0);
    });

    test("all tools used → breadth=100", () => {
      const r = computeMetrics({ ...BASE, totalTools: 10, uniqueToolsInWindow: 10, totalDistinctToolsEver: 10 });
      expect(r.breadth).toBe(100);
    });
  });

  describe("retry_rate", () => {
    const BASE_TS = "2026-01-01T10:00:00.000Z";

    test("consecutive same-tool within 30s counted as retry", () => {
      const tools = [
        { tool: "Read", ts: new Date("2026-01-01T10:00:00.000Z").toISOString() },
        { tool: "Read", ts: new Date("2026-01-01T10:00:05.000Z").toISOString() }, // 5s gap → retry
        { tool: "Bash", ts: new Date("2026-01-01T10:00:10.000Z").toISOString() },
      ];
      const r = computeMetrics({ ...BASE, totalTools: 3, sessions: makeSessions(tools) });
      // retries=1, totalTools=3 → 1/3*100 ≈ 33.3
      expect(r.retry_rate).toBe(33.3);
    });

    test("consecutive same-tool outside 30s NOT counted as retry", () => {
      const tools = [
        { tool: "Read", ts: new Date("2026-01-01T10:00:00.000Z").toISOString() },
        { tool: "Read", ts: new Date("2026-01-01T10:00:40.000Z").toISOString() }, // 40s gap → no retry
      ];
      const r = computeMetrics({ ...BASE, totalTools: 2, sessions: makeSessions(tools) });
      expect(r.retry_rate).toBe(0);
    });

    test("mixed: one retry within 30s, one outside 30s → correct rate", () => {
      const base = new Date("2026-01-01T10:00:00.000Z").getTime();
      const tools = [
        { tool: "Read", ts: new Date(base).toISOString() },
        { tool: "Read", ts: new Date(base + 5000).toISOString() },   // retry
        { tool: "Bash", ts: new Date(base + 10000).toISOString() },
        { tool: "Read", ts: new Date(base + 40000).toISOString() },
        { tool: "Read", ts: new Date(base + 80000).toISOString() },  // 40s gap → no retry
      ];
      const r = computeMetrics({ ...BASE, totalTools: 5, sessions: makeSessions(tools) });
      // 1 retry out of 5 = 20%
      expect(r.retry_rate).toBe(20);
    });

    test("empty sessions → retry_rate=0", () => {
      const r = computeMetrics(BASE);
      expect(r.retry_rate).toBe(0);
    });
  });

  describe("workflow_score", () => {
    test("no patterns (not enough repetitions) → workflow_score=0", () => {
      const tools = toolsAt(["Read", "Edit", "Bash"], "2026-01-01T10:00:00Z");
      const r = computeMetrics({ ...BASE, totalTools: 3, sessions: makeSessions(tools) });
      expect(r.workflow_score).toBe(0);
    });

    test("repeated pattern (20x Read+Edit) → workflow_score > 0", () => {
      const base = new Date("2026-01-01T10:00:00Z").getTime();
      const tools = [];
      for (let i = 0; i < 20; i++) {
        tools.push({ tool: "Read", ts: new Date(base + i * 2000).toISOString() });
        tools.push({ tool: "Edit", ts: new Date(base + i * 2000 + 1000).toISOString() });
      }
      const r = computeMetrics({ ...BASE, totalTools: 40, sessions: makeSessions(tools) });
      expect(r.workflow_score).toBeGreaterThan(0);
    });
  });

  describe("composite and grade", () => {
    test("composite is weighted average with retry_rate inverted", () => {
      // success=100, throughput=600 tools/3600s → raw 10 → normalized 100, breadth=0, retry=0, workflow=0
      // composite = 100*0.25 + 100*0.20 + 0*0.15 + (100-0)*0.20 + 0*0.20 = 25+20+0+20+0 = 65
      const r = computeMetrics({ ...BASE, totalTools: 600, totalSeconds: 3600 });
      expect(r.composite).toBe(65);
    });

    test("grade matches composite", () => {
      const r = computeMetrics({ ...BASE, totalTools: 100, totalFailures: 50 });
      const { getGrade } = require("../scripts/metrics");
      expect(r.grade).toBe(getGrade(r.composite));
    });

    test("composite with all zeros → 45 (retry inverted contributes 20)", () => {
      // 100*0.25 + 0 + 0 + (100-0)*0.20 + 0 = 25 + 20 = 45
      const r = computeMetrics(BASE);
      expect(r.composite).toBe(45);
    });
  });

  describe("rounding", () => {
    test("values are rounded to 1 decimal place", () => {
      // 1 retry out of 3 → 33.333... should round to 33.3
      const tools = [
        { tool: "Read", ts: new Date("2026-01-01T10:00:00.000Z").toISOString() },
        { tool: "Read", ts: new Date("2026-01-01T10:00:05.000Z").toISOString() },
        { tool: "Bash", ts: new Date("2026-01-01T10:00:10.000Z").toISOString() },
      ];
      const r = computeMetrics({ ...BASE, totalTools: 3, sessions: makeSessions(tools) });
      // Check it's rounded to 1dp (not raw floating point)
      const decimals = r.retry_rate.toString().split(".")[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(1);
    });

    test("composite is a whole integer (Math.round)", () => {
      const r = computeMetrics({ ...BASE, totalTools: 100, totalFailures: 50 });
      expect(Number.isInteger(r.composite)).toBe(true);
    });
  });
});

// ── getWeekKey ────────────────────────────────────────────────────────────────

describe("getWeekKey", () => {
  test("returns a string", () => {
    expect(typeof getWeekKey(new Date())).toBe("string");
  });

  test("format matches YYYY-WXX", () => {
    const key = getWeekKey(new Date("2026-01-01"));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  test("known date 2026-01-01 (Thursday) → 2026-W01", () => {
    expect(getWeekKey(new Date("2026-01-01"))).toBe("2026-W01");
  });

  test("2026-03-30 (Monday) → 2026-W14", () => {
    expect(getWeekKey(new Date("2026-03-30"))).toBe("2026-W14");
  });

  test("2026-03-31 (Tuesday, same ISO week as 2026-03-30) → 2026-W14", () => {
    expect(getWeekKey(new Date("2026-03-31"))).toBe("2026-W14");
  });

  test("dates in the same ISO week return the same key", () => {
    // 2026-03-30 Mon through 2026-04-05 Sun are all W14
    const keys = [
      getWeekKey(new Date("2026-03-30")),
      getWeekKey(new Date("2026-03-31")),
      getWeekKey(new Date("2026-04-01")),
    ];
    expect(new Set(keys).size).toBe(1);
  });

  test("consecutive weeks return different keys", () => {
    const w13 = getWeekKey(new Date("2026-03-29")); // Sunday of W13
    const w14 = getWeekKey(new Date("2026-03-30")); // Monday of W14
    expect(w13).not.toBe(w14);
  });

  test("consistent result for same date called twice", () => {
    const d = new Date("2026-06-15");
    expect(getWeekKey(d)).toBe(getWeekKey(d));
  });
});

// ── computeTrends ─────────────────────────────────────────────────────────────

describe("computeTrends", () => {
  const CURRENT = {
    success_rate: 90,
    throughput: 8,
    breadth: 60,
    retry_rate: 10,
    workflow_score: 70,
    composite: 80,
  };

  test("previous=null → all deltas 0 and all arrows empty", () => {
    const trends = computeTrends(CURRENT, null);
    for (const key of ["success_rate", "throughput", "breadth", "retry_rate", "workflow_score", "composite"]) {
      expect(trends[key].delta).toBe(0);
      expect(trends[key].arrow).toBe("");
    }
  });

  test("previous=null → returns all 6 metric keys", () => {
    const trends = computeTrends(CURRENT, null);
    expect(Object.keys(trends)).toHaveLength(6);
  });

  test("positive delta → up arrow (↑) for success_rate", () => {
    const prev = { ...CURRENT, success_rate: 80 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.success_rate.arrow).toBe("↑");
    expect(trends.success_rate.delta).toBe(10);
  });

  test("negative delta → down arrow (↓) for success_rate", () => {
    const prev = { ...CURRENT, success_rate: 95 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.success_rate.arrow).toBe("↓");
    expect(trends.success_rate.delta).toBe(-5);
  });

  test("retry_rate positive delta (worse) → DOWN arrow (↓)", () => {
    // retry_rate went up from 5 to 10 — that's bad, so arrow is ↓
    const prev = { ...CURRENT, retry_rate: 5 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.retry_rate.arrow).toBe("↓");
    expect(trends.retry_rate.delta).toBe(5);
  });

  test("retry_rate negative delta (better) → UP arrow (↑)", () => {
    // retry_rate went down from 20 to 10 — that's good, so arrow is ↑
    const prev = { ...CURRENT, retry_rate: 20 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.retry_rate.arrow).toBe("↑");
    expect(trends.retry_rate.delta).toBe(-10);
  });

  test("no arrow when |delta| < 0.5", () => {
    const prev = { ...CURRENT, success_rate: 89.6 }; // delta = 0.4
    const trends = computeTrends(CURRENT, prev);
    expect(trends.success_rate.arrow).toBe("");
  });

  test("arrow appears when |delta| >= 0.5", () => {
    const prev = { ...CURRENT, success_rate: 89.5 }; // delta = 0.5
    const trends = computeTrends(CURRENT, prev);
    expect(trends.success_rate.arrow).toBe("↑");
  });

  test("delta rounded to 1 decimal place", () => {
    // 90 - 89.67 = 0.33... rounded to 0.3
    const prev = { ...CURRENT, success_rate: 89.67 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.success_rate.delta).toBe(0.3);
  });

  test("positive delta for throughput → up arrow", () => {
    const prev = { ...CURRENT, throughput: 5 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.throughput.arrow).toBe("↑");
  });

  test("negative delta for composite → down arrow", () => {
    const prev = { ...CURRENT, composite: 90 };
    const trends = computeTrends(CURRENT, prev);
    expect(trends.composite.arrow).toBe("↓");
  });
});
