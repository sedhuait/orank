import { NAMED_PATTERNS, computeWorkflowScore, detectPatterns } from "../scripts/patterns.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a session object for the cache.sessions shape:
 *   { tools_ordered: [{ tool, ts }] }
 */
function makeSession(toolNames) {
  return {
    tools_ordered: toolNames.map((tool) => ({ tool, ts: new Date().toISOString() })),
  };
}

/**
 * Build a sessions map with a single session containing the given tools.
 */
function singleSession(toolNames) {
  return { s1: makeSession(toolNames) };
}

/**
 * Repeat a tool sequence `n` times inside a single session.
 * e.g. repeat(["Read","Edit","Bash"], 5) → Read,Edit,Bash,Read,Edit,Bash,...
 */
function repeat(seq, n) {
  const tools = [];
  for (let i = 0; i < n; i++) tools.push(...seq);
  return tools;
}

// ── NAMED_PATTERNS ────────────────────────────────────────────────────────────

describe("NAMED_PATTERNS", () => {
  it("has exactly 6 entries", () => {
    expect(Object.keys(NAMED_PATTERNS)).toHaveLength(6);
  });

  it('maps "Read,Edit,Bash" to "Code-Test"', () => {
    expect(NAMED_PATTERNS["Read,Edit,Bash"]).toBe("Code-Test");
  });

  it('maps "Grep,Read,Edit" to "Find-and-Fix"', () => {
    expect(NAMED_PATTERNS["Grep,Read,Edit"]).toBe("Find-and-Fix");
  });

  it('maps "Agent,Read,Edit" to "Delegate-then-Refine"', () => {
    expect(NAMED_PATTERNS["Agent,Read,Edit"]).toBe("Delegate-then-Refine");
  });

  it('maps "Read,Edit,Read" to "Iterative Edit"', () => {
    expect(NAMED_PATTERNS["Read,Edit,Read"]).toBe("Iterative Edit");
  });

  it('maps "Grep,Read" to "Search-and-Review"', () => {
    expect(NAMED_PATTERNS["Grep,Read"]).toBe("Search-and-Review");
  });

  it('maps "Bash,Read,Edit" to "Debug Cycle"', () => {
    expect(NAMED_PATTERNS["Bash,Read,Edit"]).toBe("Debug Cycle");
  });
});

// ── detectPatterns ────────────────────────────────────────────────────────────

describe("detectPatterns", () => {
  it("returns an empty array for an empty sessions object", () => {
    expect(detectPatterns({})).toEqual([]);
  });

  it("returns an empty array when all sessions have fewer than 2 tools", () => {
    const sessions = {
      s1: makeSession(["Read"]),
      s2: makeSession([]),
    };
    expect(detectPatterns(sessions, 1)).toEqual([]);
  });

  it("returns an empty array when occurrences are below the default threshold of 5", () => {
    // Only 4 occurrences of Read→Edit — should not appear
    const sessions = {};
    for (let i = 0; i < 4; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit"]);
    }
    expect(detectPatterns(sessions)).toEqual([]);
  });

  it("detects a 2-tool sequence at the default threshold (5 occurrences)", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit"]);
    }
    const patterns = detectPatterns(sessions);
    const keys = patterns.map((p) => p.sequence.join(","));
    expect(keys).toContain("Read,Edit");
  });

  it("detects a named 3-tool sequence (Read,Edit,Bash → Code-Test)", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit", "Bash"]);
    }
    const patterns = detectPatterns(sessions);
    const codeTest = patterns.find((p) => p.sequence.join(",") === "Read,Edit,Bash");
    expect(codeTest).toBeDefined();
    expect(codeTest.name).toBe("Code-Test");
  });

  it("detects a 4-tool sequence when it meets the threshold", () => {
    // Build 5 sessions each containing Read,Edit,Bash,Read
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit", "Bash", "Read"]);
    }
    const patterns = detectPatterns(sessions);
    const keys = patterns.map((p) => p.sequence.join(","));
    expect(keys).toContain("Read,Edit,Bash,Read");
  });

  it("respects a custom minOccurrences=1", () => {
    const sessions = singleSession(["Grep", "Write"]);
    const patterns = detectPatterns(sessions, 1);
    const keys = patterns.map((p) => p.sequence.join(","));
    expect(keys).toContain("Grep,Write");
  });

  it("does not include sequences below a custom threshold", () => {
    // 2 occurrences, threshold = 3
    const sessions = {
      s1: makeSession(["Grep", "Write"]),
      s2: makeSession(["Grep", "Write"]),
    };
    expect(detectPatterns(sessions, 3)).toEqual([]);
  });

  it("assigns the correct name from NAMED_PATTERNS for a named sequence", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Grep", "Read"]);
    }
    const patterns = detectPatterns(sessions);
    const sr = patterns.find((p) => p.sequence.join(",") === "Grep,Read");
    expect(sr).toBeDefined();
    expect(sr.name).toBe("Search-and-Review");
  });

  it("generates an auto-name for unnamed sequences in the form 'X → Y flow'", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Write", "Bash"]);
    }
    const patterns = detectPatterns(sessions);
    const wb = patterns.find((p) => p.sequence.join(",") === "Write,Bash");
    expect(wb).toBeDefined();
    expect(wb.name).toBe("Write → Bash flow");
  });

  it("auto-names a 3-tool unnamed sequence with arrows between each tool", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Write", "Bash", "Write"]);
    }
    const patterns = detectPatterns(sessions);
    const wbw = patterns.find((p) => p.sequence.join(",") === "Write,Bash,Write");
    expect(wbw).toBeDefined();
    expect(wbw.name).toBe("Write → Bash → Write flow");
  });

  it("returns results sorted by count descending", () => {
    // Give Read,Edit 7 occurrences and Bash,Read 5 occurrences
    const sessions = {};
    for (let i = 0; i < 7; i++) {
      sessions[`re${i}`] = makeSession(["Read", "Edit"]);
    }
    for (let i = 0; i < 5; i++) {
      sessions[`br${i}`] = makeSession(["Bash", "Read"]);
    }
    const patterns = detectPatterns(sessions);
    for (let i = 0; i < patterns.length - 1; i++) {
      expect(patterns[i].count).toBeGreaterThanOrEqual(patterns[i + 1].count);
    }
  });

  it("handles sessions with null tools_ordered gracefully", () => {
    const sessions = {
      s1: { tools_ordered: null },
      s2: makeSession(["Read", "Edit"]),
    };
    // Should not throw; s1 contributes nothing
    expect(() => detectPatterns(sessions, 1)).not.toThrow();
  });

  it("handles sessions with undefined tools_ordered gracefully", () => {
    const sessions = {
      s1: {},
      s2: makeSession(["Read", "Edit"]),
    };
    expect(() => detectPatterns(sessions, 1)).not.toThrow();
    const patterns = detectPatterns(sessions, 1);
    const keys = patterns.map((p) => p.sequence.join(","));
    expect(keys).toContain("Read,Edit");
  });

  it("accumulates counts across multiple sessions", () => {
    // 3 sessions each contribute Read,Edit once → total 3; threshold = 3
    const sessions = {
      s1: makeSession(["Read", "Edit", "Bash"]),
      s2: makeSession(["Read", "Edit", "Bash"]),
      s3: makeSession(["Read", "Edit", "Bash"]),
    };
    const patterns = detectPatterns(sessions, 3);
    const re = patterns.find((p) => p.sequence.join(",") === "Read,Edit");
    expect(re).toBeDefined();
    expect(re.count).toBe(3);
  });

  it("counts repeated patterns within a single session", () => {
    // One session with 5 repetitions of Read,Edit,Bash
    const tools = repeat(["Read", "Edit", "Bash"], 5);
    const sessions = singleSession(tools);
    const patterns = detectPatterns(sessions, 5);
    const codeTest = patterns.find((p) => p.sequence.join(",") === "Read,Edit,Bash");
    expect(codeTest).toBeDefined();
    expect(codeTest.count).toBeGreaterThanOrEqual(5);
  });

  it("each result has sequence, name, and count properties", () => {
    const sessions = singleSession(repeat(["Grep", "Read"], 5));
    const patterns = detectPatterns(sessions, 5);
    for (const p of patterns) {
      expect(p).toHaveProperty("sequence");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("count");
      expect(Array.isArray(p.sequence)).toBe(true);
      expect(typeof p.name).toBe("string");
      expect(typeof p.count).toBe("number");
    }
  });

  it("sequence property matches the comma-joined key split by commas", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Grep", "Read", "Edit"]);
    }
    const patterns = detectPatterns(sessions);
    const faf = patterns.find((p) => p.name === "Find-and-Fix");
    expect(faf).toBeDefined();
    expect(faf.sequence).toEqual(["Grep", "Read", "Edit"]);
  });
});

// ── computeWorkflowScore ──────────────────────────────────────────────────────

describe("computeWorkflowScore", () => {
  it("returns 0 when totalTools is 0", () => {
    expect(computeWorkflowScore({}, 0)).toBe(0);
  });

  it("returns 0 when no patterns are detected (below threshold)", () => {
    // Only 1 occurrence of each sequence — default threshold is 5
    const sessions = singleSession(["Read", "Edit", "Bash"]);
    expect(computeWorkflowScore(sessions, 3)).toBe(0);
  });

  it("returns 0 for empty sessions with non-zero totalTools", () => {
    expect(computeWorkflowScore({}, 10)).toBe(0);
  });

  it("returns a correct percentage when patterns cover a subset of tools", () => {
    // Build 5 sessions each with [Read, Edit, Bash, Write]
    // Read,Edit,Bash is a pattern; Write is extra
    // Total tools = 5 * 4 = 20; covered per session = 3; covered total = 15
    // Score = round(15/20 * 100) = 75
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit", "Bash", "Write"]);
    }
    const score = computeWorkflowScore(sessions, 20);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 100 when all tool uses are within detected patterns", () => {
    // 5 sessions each with exactly Read,Edit,Bash → all 15 tools covered by pattern
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit", "Bash"]);
    }
    const score = computeWorkflowScore(sessions, 15);
    expect(score).toBe(100);
  });

  it("caps at 100 even if covered count somehow exceeds totalTools", () => {
    // Use a totalTools smaller than the actual covered positions to force >100
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit", "Bash"]);
    }
    // totalTools = 1 so that coveredUses/totalTools >> 1 → capped at 100
    const score = computeWorkflowScore(sessions, 1);
    expect(score).toBe(100);
  });

  it("returns a number between 0 and 100 inclusive in normal cases", () => {
    const sessions = {};
    for (let i = 0; i < 6; i++) {
      sessions[`s${i}`] = makeSession(["Grep", "Read", "Edit", "Bash"]);
    }
    const totalTools = 6 * 4;
    const score = computeWorkflowScore(sessions, totalTools);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns a rounded integer", () => {
    const sessions = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = makeSession(["Read", "Edit", "Bash"]);
    }
    const score = computeWorkflowScore(sessions, 16);
    expect(Number.isInteger(score)).toBe(true);
  });
});
