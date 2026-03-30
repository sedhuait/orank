"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createTestStorage, readEvents } = require("./helpers/test-storage");

let tmpHome, storageCtx;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "orank-home-"));
  vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  // Create .claude directory structure
  fs.mkdirSync(path.join(tmpHome, ".claude", "projects"), { recursive: true });
  // Clear module cache so constants are recomputed with mocked homedir
  delete require.cache[require.resolve("../scripts/history-import")];
  storageCtx = createTestStorage();
});

afterEach(() => {
  storageCtx.cleanup();
  vi.restoreAllMocks();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

// Helper to require the module fresh after homedir mock is set
function requireHistoryImport() {
  delete require.cache[require.resolve("../scripts/history-import")];
  return require("../scripts/history-import");
}

function writeHistoryFile(lines) {
  const historyFile = path.join(tmpHome, ".claude", "history.jsonl");
  fs.writeFileSync(historyFile, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
}

function writeProjectIndex(projectName, data) {
  const projectDir = path.join(tmpHome, ".claude", "projects", projectName);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "sessions-index.json"), JSON.stringify(data), "utf8");
}

// ── Session Collection ────────────────────────────────────────────────────────

describe("_collectSessions — empty sources", () => {
  test("returns empty array when no history.jsonl and no projects", () => {
    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();
    expect(sessions).toEqual([]);
  });

  test("returns empty array when projects dir has no subdirectories", () => {
    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();
    expect(sessions).toHaveLength(0);
  });
});

describe("_collectSessions — history.jsonl", () => {
  test("reads sessions from history.jsonl", () => {
    writeHistoryFile([
      { sessionId: "sess-1", timestamp: "2026-01-10T10:00:00Z", projectPath: "/work/proj", numTurns: 5, toolCounts: { Read: 3 } },
      { sessionId: "sess-2", timestamp: "2026-01-11T10:00:00Z", projectPath: "/work/proj2", numTurns: 2, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("sess-1");
    expect(sessions[1].id).toBe("sess-2");
  });

  test("maps sessionId to id correctly", () => {
    writeHistoryFile([
      { sessionId: "abc-123", timestamp: "2026-01-10T10:00:00Z", numTurns: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].id).toBe("abc-123");
  });

  test("supports field alias: id instead of sessionId", () => {
    writeHistoryFile([
      { id: "alias-id-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("alias-id-1");
  });

  test("supports timestamp alias: createdAt", () => {
    writeHistoryFile([
      { sessionId: "ts-1", createdAt: "2026-02-01T08:00:00Z", numTurns: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].startTime).toBe("2026-02-01T08:00:00Z");
  });

  test("supports timestamp alias: created_at", () => {
    writeHistoryFile([
      { sessionId: "ts-2", created_at: "2026-03-01T08:00:00Z", numTurns: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].startTime).toBe("2026-03-01T08:00:00Z");
  });

  test("supports turns alias: turns", () => {
    writeHistoryFile([
      { sessionId: "turns-1", timestamp: "2026-01-10T10:00:00Z", turns: 7, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].turns).toBe(7);
  });

  test("maps projectPath to cwd", () => {
    writeHistoryFile([
      { sessionId: "cwd-1", timestamp: "2026-01-10T10:00:00Z", projectPath: "/some/path", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].cwd).toBe("/some/path");
  });

  test("sets branch to null for history.jsonl entries", () => {
    writeHistoryFile([
      { sessionId: "br-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].branch).toBeNull();
  });

  test("skips malformed (non-JSON) lines in history.jsonl", () => {
    const historyFile = path.join(tmpHome, ".claude", "history.jsonl");
    const content = [
      JSON.stringify({ sessionId: "good-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} }),
      "THIS IS NOT JSON {{{{",
      JSON.stringify({ sessionId: "good-2", timestamp: "2026-01-11T10:00:00Z", numTurns: 0, toolCounts: {} }),
    ].join("\n") + "\n";
    fs.writeFileSync(historyFile, content, "utf8");

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.id)).toEqual(["good-1", "good-2"]);
  });

  test("handles missing fields gracefully (null cwd, null branch)", () => {
    writeHistoryFile([
      { sessionId: "minimal-1", timestamp: "2026-01-10T10:00:00Z" },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].cwd).toBeNull();
    expect(sessions[0].branch).toBeNull();
    expect(sessions[0].turns).toBe(0);
    expect(sessions[0].toolCounts).toEqual({});
  });

  test("skips entries without sessionId or id", () => {
    writeHistoryFile([
      { timestamp: "2026-01-10T10:00:00Z", numTurns: 1 },
      { sessionId: "valid-1", timestamp: "2026-01-10T11:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("valid-1");
  });
});

describe("_collectSessions — projects/sessions-index.json (array format)", () => {
  test("reads sessions from projects/project-name/sessions-index.json (array)", () => {
    writeProjectIndex("my-project", [
      { sessionId: "proj-sess-1", startedAt: "2026-01-15T09:00:00Z", messageCount: 3, toolCounts: { Bash: 2 } },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("proj-sess-1");
    expect(sessions[0].turns).toBe(3);
    expect(sessions[0].toolCounts).toEqual({ Bash: 2 });
  });

  test("handles sessions-index.json as { sessions: [...] } format", () => {
    writeProjectIndex("my-project", {
      sessions: [
        { sessionId: "wrapped-1", startedAt: "2026-01-20T10:00:00Z", messageCount: 2, toolCounts: {} },
        { sessionId: "wrapped-2", startedAt: "2026-01-21T10:00:00Z", messageCount: 4, toolCounts: { Read: 1 } },
      ],
    });

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.id)).toContain("wrapped-1");
    expect(sessions.map((s) => s.id)).toContain("wrapped-2");
  });

  test("supports sessions-index id alias", () => {
    writeProjectIndex("proj", [
      { id: "id-alias-sess", startedAt: "2026-01-15T09:00:00Z", messageCount: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].id).toBe("id-alias-sess");
  });

  test("supports sessions-index turns alias: numTurns", () => {
    writeProjectIndex("proj", [
      { sessionId: "t1", startedAt: "2026-01-15T09:00:00Z", numTurns: 6, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].turns).toBe(6);
  });

  test("supports sessions-index turns alias: numMessages", () => {
    writeProjectIndex("proj", [
      { sessionId: "t2", startedAt: "2026-01-15T09:00:00Z", numMessages: 8, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].turns).toBe(8);
  });

  test("captures gitBranch from sessions-index", () => {
    writeProjectIndex("proj", [
      { sessionId: "br-sess", startedAt: "2026-01-15T09:00:00Z", gitBranch: "feature-x", messageCount: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].branch).toBe("feature-x");
  });
});

describe("_collectSessions — deduplication and ordering", () => {
  test("deduplicates sessions by sessionId across both sources", () => {
    writeHistoryFile([
      { sessionId: "dup-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 1, toolCounts: {} },
    ]);
    writeProjectIndex("proj", [
      { sessionId: "dup-1", startedAt: "2026-01-10T10:00:00Z", messageCount: 1, toolCounts: {} },
      { sessionId: "unique-2", startedAt: "2026-01-11T10:00:00Z", messageCount: 2, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    const ids = sessions.map((s) => s.id);
    expect(ids).toContain("dup-1");
    expect(ids).toContain("unique-2");
    // dup-1 should appear only once
    expect(ids.filter((id) => id === "dup-1")).toHaveLength(1);
  });

  test("sorts sessions by startTime ascending", () => {
    writeHistoryFile([
      { sessionId: "late-1", timestamp: "2026-01-15T10:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "early-1", timestamp: "2026-01-05T10:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "mid-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const sessions = importer._collectSessions();

    expect(sessions[0].id).toBe("early-1");
    expect(sessions[1].id).toBe("mid-1");
    expect(sessions[2].id).toBe("late-1");
  });

  test("caches collected sessions on second call", () => {
    writeHistoryFile([
      { sessionId: "cache-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const first = importer._collectSessions();
    const second = importer._collectSessions();

    expect(first).toBe(second); // same reference (cached)
  });
});

// ── preview() ─────────────────────────────────────────────────────────────────

describe("preview()", () => {
  test("returns zeros when no history data", () => {
    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.preview();

    expect(result).toEqual({ totalFound: 0, alreadyImported: 0, toImport: 0 });
  });

  test("returns correct totalFound, alreadyImported, toImport", () => {
    writeHistoryFile([
      { sessionId: "p1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "p2", timestamp: "2026-01-11T10:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "p3", timestamp: "2026-01-12T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.preview();

    expect(result.totalFound).toBe(3);
    expect(result.alreadyImported).toBe(0);
    expect(result.toImport).toBe(3);
  });

  test("toImport excludes already-imported sessions", () => {
    writeHistoryFile([
      { sessionId: "pre-imported", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "fresh-1", timestamp: "2026-01-11T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    // Mark one as already imported
    storageCtx.storage.markSessionImported("pre-imported");
    storageCtx.storage.ensureFreshCache();

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.preview();

    expect(result.totalFound).toBe(2);
    expect(result.alreadyImported).toBe(1);
    expect(result.toImport).toBe(1);
  });

  test("totalFound equals alreadyImported + toImport", () => {
    writeHistoryFile([
      { sessionId: "x1", timestamp: "2026-01-01T00:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "x2", timestamp: "2026-01-02T00:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    storageCtx.storage.markSessionImported("x1");
    storageCtx.storage.ensureFreshCache();

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.preview();

    expect(result.totalFound).toBe(result.alreadyImported + result.toImport);
  });
});

// ── importAll() ───────────────────────────────────────────────────────────────

describe("importAll() — basic import", () => {
  test("imports sessions and returns { imported, skipped }", () => {
    writeHistoryFile([
      { sessionId: "imp-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 2, toolCounts: { Read: 1 } },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.importAll();

    expect(result).toHaveProperty("imported");
    expect(result).toHaveProperty("skipped");
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  test("skips already-imported sessions", () => {
    writeHistoryFile([
      { sessionId: "already-done", timestamp: "2026-01-10T10:00:00Z", numTurns: 1, toolCounts: {} },
      { sessionId: "new-one", timestamp: "2026-01-11T10:00:00Z", numTurns: 1, toolCounts: {} },
    ]);

    storageCtx.storage.markSessionImported("already-done");
    storageCtx.storage.ensureFreshCache();

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.importAll();

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test("writes session_start event for each imported session", () => {
    writeHistoryFile([
      { sessionId: "ev-start-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    const events = readEvents(storageCtx.tmpDir);
    const sessionStart = events.find((e) => e.type === "session_start" && e.sid === "ev-start-1");
    expect(sessionStart).toBeDefined();
    expect(sessionStart.sid).toBe("ev-start-1");
  });

  test("writes session_end event for each imported session", () => {
    writeHistoryFile([
      { sessionId: "ev-end-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    const events = readEvents(storageCtx.tmpDir);
    const sessionEnd = events.find((e) => e.type === "session_end" && e.sid === "ev-end-1");
    expect(sessionEnd).toBeDefined();
    expect(sessionEnd.reason).toBe("import");
  });

  test("writes one tool_use event per tool count entry", () => {
    writeHistoryFile([
      {
        sessionId: "tools-sess",
        timestamp: "2026-01-10T10:00:00Z",
        numTurns: 0,
        toolCounts: { Read: 3, Bash: 2 },
      },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    const events = readEvents(storageCtx.tmpDir);
    const toolUses = events.filter((e) => e.type === "tool_use" && e.sid === "tools-sess");
    expect(toolUses).toHaveLength(5); // 3 Read + 2 Bash

    const readUses = toolUses.filter((e) => e.tool === "Read");
    const bashUses = toolUses.filter((e) => e.tool === "Bash");
    expect(readUses).toHaveLength(3);
    expect(bashUses).toHaveLength(2);
  });

  test("writes turn_complete events equal to turns count", () => {
    writeHistoryFile([
      { sessionId: "turns-sess", timestamp: "2026-01-10T10:00:00Z", numTurns: 4, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    const events = readEvents(storageCtx.tmpDir);
    const turnCompletes = events.filter((e) => e.type === "turn_complete" && e.sid === "turns-sess");
    expect(turnCompletes).toHaveLength(4);
  });

  test("events use new schema field names (ts, sid, tool)", () => {
    writeHistoryFile([
      { sessionId: "schema-check", timestamp: "2026-01-10T10:00:00Z", numTurns: 1, toolCounts: { Read: 1 } },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    const events = readEvents(storageCtx.tmpDir);
    const sessionStart = events.find((e) => e.type === "session_start" && e.sid === "schema-check");
    expect(sessionStart).toHaveProperty("ts");
    expect(sessionStart).toHaveProperty("sid");

    const toolUse = events.find((e) => e.type === "tool_use" && e.sid === "schema-check");
    expect(toolUse).toHaveProperty("ts");
    expect(toolUse).toHaveProperty("sid");
    expect(toolUse).toHaveProperty("tool");
  });

  test("marks each session as imported after processing", () => {
    writeHistoryFile([
      { sessionId: "mark-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    storageCtx.storage.ensureFreshCache();
    expect(storageCtx.storage.isSessionImported("mark-1")).toBe(true);
  });

  test("awards 50 XP per imported session", () => {
    writeHistoryFile([
      { sessionId: "xp-1", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
      { sessionId: "xp-2", timestamp: "2026-01-11T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    const events = readEvents(storageCtx.tmpDir);
    const xpEvents = events.filter((e) => e.type === "xp_award");
    const totalXP = xpEvents.reduce((sum, e) => sum + (e.amount || 0), 0);
    expect(totalXP).toBe(100); // 2 sessions * 50 XP
  });

  test("handles sessions with zero tools and zero turns", () => {
    writeHistoryFile([
      { sessionId: "empty-sess", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.importAll();

    expect(result.imported).toBe(1);

    const events = readEvents(storageCtx.tmpDir);
    const sessionEvents = events.filter((e) => e.sid === "empty-sess");
    const types = sessionEvents.map((e) => e.type);
    expect(types).toContain("session_start");
    expect(types).toContain("session_end");
    // No tool_use or turn_complete events
    expect(types).not.toContain("tool_use");
    expect(types).not.toContain("turn_complete");
  });

  test("handles sessions with missing startTime (uses fallback)", () => {
    // No timestamp field — should not throw
    writeHistoryFile([
      { sessionId: "no-time", numTurns: 1, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);

    expect(() => importer.importAll()).not.toThrow();

    const result = importer.importAll();
    // The second importAll will skip because session is already marked
    expect(result.imported + result.skipped).toBeGreaterThanOrEqual(1);
  });

  test("second importAll on same importer instance returns 0 imported (already done)", () => {
    writeHistoryFile([
      { sessionId: "double-import", timestamp: "2026-01-10T10:00:00Z", numTurns: 0, toolCounts: {} },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    importer.importAll();

    // Second call on fresh importer sees session as already imported
    delete require.cache[require.resolve("../scripts/history-import")];
    const { HistoryImporter: HistoryImporter2 } = require("../scripts/history-import");
    const importer2 = new HistoryImporter2(storageCtx.storage);
    storageCtx.storage.ensureFreshCache();
    const result2 = importer2.importAll();

    expect(result2.imported).toBe(0);
    expect(result2.skipped).toBe(1);
  });
});

describe("importAll() — mixed sources", () => {
  test("imports from both history.jsonl and sessions-index.json", () => {
    writeHistoryFile([
      { sessionId: "hist-sess", timestamp: "2026-01-10T10:00:00Z", numTurns: 1, toolCounts: { Read: 1 } },
    ]);
    writeProjectIndex("proj", [
      { sessionId: "proj-sess", startedAt: "2026-01-12T10:00:00Z", messageCount: 2, toolCounts: { Bash: 1 } },
    ]);

    const { HistoryImporter } = requireHistoryImport();
    const importer = new HistoryImporter(storageCtx.storage);
    const result = importer.importAll();

    expect(result.imported).toBe(2);

    const events = readEvents(storageCtx.tmpDir);
    const sessionStarts = events.filter((e) => e.type === "session_start");
    const ids = sessionStarts.map((e) => e.sid);
    expect(ids).toContain("hist-sess");
    expect(ids).toContain("proj-sess");
  });
});
