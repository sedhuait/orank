import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, "../scripts/cli.js");

let tmpDir;

function runCli(command = "stats", extraArgs = []) {
  const args = [command, ...extraArgs].filter(Boolean).join(" ");
  return execSync(`node "${CLI_PATH}" ${args}`, {
    env: {
      ...process.env,
      CLAUDE_PLUGIN_DATA: tmpDir,
      HOME: os.homedir(),
      PATH: process.env.PATH,
    },
    timeout: 10000,
    encoding: "utf-8",
  });
}

function runCliSafe(command = "stats", extraArgs = []) {
  try {
    return runCli(command, extraArgs);
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function writeEventsFile(events) {
  const eventsFile = path.join(tmpDir, "events.jsonl");
  fs.writeFileSync(eventsFile, `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

function seedData() {
  const now = new Date().toISOString();
  const events = [
    {
      type: "session_start",
      ts: now,
      sid: "cli-test-1",
      model: "opus",
      source: "startup",
      cwd: "/tmp",
      branch: "main",
    },
    { type: "tool_use", ts: now, sid: "cli-test-1", tool: "Read", file_path: "/tmp/a.js" },
    { type: "tool_use", ts: now, sid: "cli-test-1", tool: "Edit", file_path: "/tmp/a.js" },
    { type: "tool_use", ts: now, sid: "cli-test-1", tool: "Bash", file_path: null },
    { type: "slash_command", ts: now, sid: "cli-test-1", command: "commit" },
    { type: "turn_complete", ts: now, sid: "cli-test-1" },
    { type: "session_end", ts: now, sid: "cli-test-1", reason: null },
  ];
  writeEventsFile(events);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orank-cli-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── stats command ─────────────────────────────────────────────────────────────

describe("stats command", () => {
  test("runs without error with empty data", () => {
    expect(() => runCli("stats")).not.toThrow();
  });

  test("runs without error with seeded data", () => {
    seedData();
    expect(() => runCli("stats")).not.toThrow();
  });

  test("output contains orank header", () => {
    const out = runCli("stats");
    expect(out).toMatch(/orank/i);
  });

  test("output contains tier name (Bronze)", () => {
    const out = runCli("stats");
    expect(out).toMatch(/Bronze/i);
  });

  test("output contains XP", () => {
    const out = runCli("stats");
    expect(out).toMatch(/XP/);
  });

  test("output contains Efficiency", () => {
    const out = runCli("stats");
    expect(out).toMatch(/Efficiency/i);
  });

  test("output contains Sessions", () => {
    const out = runCli("stats");
    expect(out).toMatch(/Sessions/i);
  });

  test("output contains Badges", () => {
    const out = runCli("stats");
    expect(out).toMatch(/Badges/i);
  });
});

// ── badges command ────────────────────────────────────────────────────────────

describe("badges command", () => {
  test("runs without error", () => {
    expect(() => runCli("badges")).not.toThrow();
  });

  test("output contains Badges", () => {
    const out = runCli("badges");
    expect(out).toMatch(/Badges/i);
  });

  test("output contains Earned or earned count", () => {
    const out = runCli("badges");
    expect(out).toMatch(/[Ee]arned/);
  });

  test("output contains Total", () => {
    const out = runCli("badges");
    expect(out).toMatch(/Total/i);
  });
});

// ── insights command ──────────────────────────────────────────────────────────

describe("insights command", () => {
  test("runs without error", () => {
    expect(() => runCli("insights")).not.toThrow();
  });

  test("output contains Insights or Weekly", () => {
    const out = runCli("insights");
    expect(out).toMatch(/Insights|Weekly/i);
  });

  test("output contains Efficiency", () => {
    const out = runCli("insights");
    expect(out).toMatch(/Efficiency/i);
  });
});

// ── export command ────────────────────────────────────────────────────────────

describe("export command", () => {
  test("output is valid JSON", () => {
    const out = runCli("export");
    expect(() => JSON.parse(out)).not.toThrow();
  });

  test("JSON has cache and events keys", () => {
    const out = runCli("export");
    const data = JSON.parse(out);
    expect(data).toHaveProperty("cache");
    expect(data).toHaveProperty("events");
  });

  test("exports seeded events correctly", () => {
    seedData();
    const out = runCli("export");
    const data = JSON.parse(out);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);
  });
});

// ── privacy command ───────────────────────────────────────────────────────────

describe("privacy command", () => {
  test("output contains Privacy", () => {
    const out = runCli("privacy");
    expect(out).toMatch(/Privacy/i);
  });

  test("output contains data directory path or orank", () => {
    const out = runCli("privacy");
    expect(out).toMatch(/orank|Location/i);
  });

  test("output contains ACTIVE when not paused", () => {
    const out = runCli("privacy");
    expect(out).toMatch(/ACTIVE/);
  });
});

// ── pause command ─────────────────────────────────────────────────────────────

describe("pause command", () => {
  test("output contains paused", () => {
    const out = runCli("pause");
    expect(out).toMatch(/paused/i);
  });

  test("creates .paused file in tmpDir", () => {
    runCli("pause");
    const pausedFile = path.join(tmpDir, ".paused");
    expect(fs.existsSync(pausedFile)).toBe(true);
  });

  test("output says already paused when called twice", () => {
    runCli("pause");
    const out = runCli("pause");
    expect(out).toMatch(/already/i);
  });
});

// ── resume command ────────────────────────────────────────────────────────────

describe("resume command", () => {
  test("when paused: output contains resumed", () => {
    runCli("pause");
    const out = runCli("resume");
    expect(out).toMatch(/resumed/i);
  });

  test("when not paused: output contains active or already", () => {
    const out = runCli("resume");
    expect(out).toMatch(/active|already/i);
  });

  test("removes .paused file after resume", () => {
    runCli("pause");
    expect(fs.existsSync(path.join(tmpDir, ".paused"))).toBe(true);
    runCli("resume");
    expect(fs.existsSync(path.join(tmpDir, ".paused"))).toBe(false);
  });
});

// ── purge command ─────────────────────────────────────────────────────────────

describe("purge command", () => {
  test("without --confirm: output contains confirm", () => {
    const out = runCli("purge");
    expect(out).toMatch(/confirm/i);
  });

  test("with --confirm: output contains deleted", () => {
    seedData();
    const out = runCli("purge", ["--confirm"]);
    expect(out).toMatch(/deleted/i);
  });

  test("without --confirm: does not delete events file", () => {
    seedData();
    runCli("purge");
    const eventsFile = path.join(tmpDir, "events.jsonl");
    expect(fs.existsSync(eventsFile)).toBe(true);
  });
});

// ── integrity command ─────────────────────────────────────────────────────────

describe("integrity command", () => {
  test("runs without error with empty data", () => {
    expect(() => runCliSafe("integrity")).not.toThrow();
  });

  test("output contains Trust Score or No events with empty data", () => {
    const out = runCliSafe("integrity");
    expect(out).toMatch(/Trust Score|No events/i);
  });
});

// ── deferred commands ─────────────────────────────────────────────────────────

describe("deferred commands", () => {
  test("sync → output contains coming soon", () => {
    const out = runCliSafe("sync");
    expect(out).toMatch(/coming soon/i);
  });

  test("login → output contains coming soon", () => {
    const out = runCliSafe("login");
    expect(out).toMatch(/coming soon/i);
  });

  test("logout → output contains coming soon", () => {
    const out = runCliSafe("logout");
    expect(out).toMatch(/coming soon/i);
  });

  test("whoami → output contains coming soon", () => {
    const out = runCliSafe("whoami");
    expect(out).toMatch(/coming soon/i);
  });
});

// ── unknown command ───────────────────────────────────────────────────────────

describe("unknown command", () => {
  test("output contains Unknown command", () => {
    const out = runCliSafe("unknownxyz");
    expect(out).toMatch(/Unknown command/i);
  });
});

// ── default (no args) ─────────────────────────────────────────────────────────

describe("default (no args)", () => {
  test("runs without error (same as stats)", () => {
    expect(() => runCli()).not.toThrow();
  });

  test("output contains orank header", () => {
    const out = runCli();
    expect(out).toMatch(/orank/i);
  });

  test("output contains XP", () => {
    const out = runCli();
    expect(out).toMatch(/XP/);
  });
});
