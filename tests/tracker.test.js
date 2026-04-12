import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRACKER_PATH = path.resolve(__dirname, "../scripts/tracker.js");

let tmpDir;

function runTracker(hookInput, extraEnv = {}) {
  const input = JSON.stringify(hookInput);
  try {
    execSync(`echo '${input.replace(/'/g, "'\\''")}' | node "${TRACKER_PATH}"`, {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: tmpDir,
        HOME: os.homedir(),
        PATH: process.env.PATH,
        ...extraEnv,
      },
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    // tracker may exit with code 0 or non-zero, both are fine
  }
}

function readEvents() {
  const eventsFile = path.join(tmpDir, "events.jsonl");
  if (!fs.existsSync(eventsFile)) return [];
  return fs
    .readFileSync(eventsFile, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orank-tracker-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Basic dispatch (all hook events) ─────────────────────────────────────────

describe("Basic dispatch", () => {
  test("SessionStart → creates session_start event", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-001",
      model: "claude-3-opus",
      source: "startup",
      cwd: "/tmp/project",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session_start");
  });

  test("SessionEnd → creates session_end event", () => {
    runTracker({
      hook_event_name: "SessionEnd",
      session_id: "sess-002",
      reason: "user_exit",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session_end");
  });

  test("PostToolUse → creates tool_use event", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-003",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/foo.txt" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_use");
  });

  test("PostToolUseFailure → creates tool_failure event", () => {
    runTracker({
      hook_event_name: "PostToolUseFailure",
      session_id: "sess-004",
      tool_name: "Bash",
      error: "Command failed with exit code 1",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_failure");
  });

  test("Stop → creates turn_complete event", () => {
    runTracker({
      hook_event_name: "Stop",
      session_id: "sess-005",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("turn_complete");
  });

  test("StopFailure → creates turn_error event", () => {
    runTracker({
      hook_event_name: "StopFailure",
      session_id: "sess-006",
      error_type: "context_window_exceeded",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("turn_error");
  });

  test("UserPromptSubmit with slash command → creates slash_command event", () => {
    runTracker({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-007",
      prompt: "/commit -m test",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("slash_command");
    expect(events[0].command).toBe("commit");
  });

  test("UserPromptSubmit without slash command → creates NO event", () => {
    runTracker({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-008",
      prompt: "what is the meaning of life?",
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("PreToolUse for Skill tool → creates slash_command event with skill name", () => {
    runTracker({
      hook_event_name: "PreToolUse",
      session_id: "sess-009",
      tool_name: "Skill",
      tool_input: { skill: "orank" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("slash_command");
    expect(events[0].command).toBe("orank");
  });

  test("PreToolUse for non-Skill tool → creates NO event", () => {
    runTracker({
      hook_event_name: "PreToolUse",
      session_id: "sess-010",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("SubagentStart → creates subagent_start event", () => {
    runTracker({
      hook_event_name: "SubagentStart",
      session_id: "sess-011",
      agent_type: "Explore",
      agent_id: "agent-abc123",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("subagent_start");
  });

  test("SubagentStop → creates subagent_stop event", () => {
    runTracker({
      hook_event_name: "SubagentStop",
      session_id: "sess-012",
      agent_type: "Explore",
      agent_id: "agent-abc123",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("subagent_stop");
  });
});

// ── Event field verification ─────────────────────────────────────────────────

describe("Event field verification", () => {
  test("All events have ts (valid ISO string), sid, and type", () => {
    runTracker({
      hook_event_name: "Stop",
      session_id: "sess-fields-001",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBeDefined();
    expect(ev.sid).toBeDefined();
    expect(ev.ts).toBeDefined();
    // Valid ISO string
    expect(new Date(ev.ts).toISOString()).toBe(ev.ts);
  });

  test("session_start: sid matches input session_id", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "my-unique-session-id",
    });
    const events = readEvents();
    expect(events[0].sid).toBe("my-unique-session-id");
  });

  test("session_start: model field set from input", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-model",
      model: "claude-3-haiku",
    });
    const events = readEvents();
    expect(events[0].model).toBe("claude-3-haiku");
  });

  test("session_start: source field set from input", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-source",
      source: "resume",
    });
    const events = readEvents();
    expect(events[0].source).toBe("resume");
  });

  test("session_start: cwd field set from input", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-cwd",
      cwd: "/home/user/myproject",
    });
    const events = readEvents();
    expect(events[0].cwd).toBe("/home/user/myproject");
  });

  test("session_end: reason field set from input", () => {
    runTracker({
      hook_event_name: "SessionEnd",
      session_id: "sess-reason",
      reason: "timeout",
    });
    const events = readEvents();
    expect(events[0].reason).toBe("timeout");
  });

  test("tool_use: tool field matches input tool_name", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-tool",
      tool_name: "Edit",
    });
    const events = readEvents();
    expect(events[0].tool).toBe("Edit");
  });

  test("tool_use: file_path extracted from tool_input.file_path", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-filepath",
      tool_name: "Read",
      tool_input: { file_path: "/src/index.js" },
    });
    const events = readEvents();
    expect(events[0].file_path).toBe("/src/index.js");
  });

  test("tool_use: file_path is null when tool_input has no file_path", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-nopath",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    const events = readEvents();
    expect(events[0].file_path).toBeNull();
  });

  test("tool_failure: error field from input", () => {
    runTracker({
      hook_event_name: "PostToolUseFailure",
      session_id: "sess-err",
      tool_name: "Bash",
      error: "Permission denied",
    });
    const events = readEvents();
    expect(events[0].error).toBe("Permission denied");
  });

  test("turn_error: error_type field from input", () => {
    runTracker({
      hook_event_name: "StopFailure",
      session_id: "sess-errtype",
      error_type: "rate_limit_exceeded",
    });
    const events = readEvents();
    expect(events[0].error_type).toBe("rate_limit_exceeded");
  });

  test("turn_error: falls back to reason when error_type missing", () => {
    runTracker({
      hook_event_name: "StopFailure",
      session_id: "sess-fallback",
      reason: "network_error",
    });
    const events = readEvents();
    expect(events[0].error_type).toBe("network_error");
  });

  test("slash_command: command field extracted correctly from UserPromptSubmit", () => {
    runTracker({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-slash",
      prompt: "/review-pr 42",
    });
    const events = readEvents();
    expect(events[0].command).toBe("review-pr");
  });

  test("slash_command: command extracted from PreToolUse Skill tool_input.skill", () => {
    runTracker({
      hook_event_name: "PreToolUse",
      session_id: "sess-skill",
      tool_name: "Skill",
      tool_input: { skill: "commit" },
    });
    const events = readEvents();
    expect(events[0].command).toBe("commit");
  });

  test("subagent_start: agent_type and agent_id from input", () => {
    runTracker({
      hook_event_name: "SubagentStart",
      session_id: "sess-agent",
      agent_type: "Research",
      agent_id: "agent-xyz789",
    });
    const events = readEvents();
    expect(events[0].agent_type).toBe("Research");
    expect(events[0].agent_id).toBe("agent-xyz789");
  });

  test("subagent_stop: agent_type and agent_id from input", () => {
    runTracker({
      hook_event_name: "SubagentStop",
      session_id: "sess-agentstop",
      agent_type: "Research",
      agent_id: "agent-xyz789",
    });
    const events = readEvents();
    expect(events[0].agent_type).toBe("Research");
    expect(events[0].agent_id).toBe("agent-xyz789");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("Unknown hook_event_name → no event written", () => {
    runTracker({
      hook_event_name: "SomeFutureEvent",
      session_id: "sess-unknown",
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("Empty stdin → no event written (no file created)", () => {
    try {
      execSync(`echo '' | node "${TRACKER_PATH}"`, {
        env: {
          ...process.env,
          CLAUDE_PLUGIN_DATA: tmpDir,
          HOME: os.homedir(),
          PATH: process.env.PATH,
        },
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // ignore
    }
    const eventsFile = path.join(tmpDir, "events.jsonl");
    const events = readEvents();
    // Either file doesn't exist or has no events
    if (fs.existsSync(eventsFile)) {
      expect(events).toHaveLength(0);
    } else {
      expect(fs.existsSync(eventsFile)).toBe(false);
    }
  });

  test("Missing session_id → sid is null", () => {
    runTracker({
      hook_event_name: "Stop",
      // no session_id
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].sid).toBeNull();
  });

  test("Missing tool_name on PostToolUse → defaults to 'unknown'", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-notool",
      // no tool_name
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].tool).toBe("unknown");
  });

  test("Missing tool_name on PostToolUseFailure → defaults to 'unknown'", () => {
    runTracker({
      hook_event_name: "PostToolUseFailure",
      session_id: "sess-notool-fail",
      // no tool_name
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].tool).toBe("unknown");
  });

  test("Paused state → no event written", () => {
    // Create .paused sentinel file
    fs.writeFileSync(path.join(tmpDir, ".paused"), "");
    runTracker({
      hook_event_name: "Stop",
      session_id: "sess-paused",
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("Missing hook_event_name field → no event written", () => {
    runTracker({
      session_id: "sess-noevent",
      // no hook_event_name
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("PreToolUse for Skill tool with no skill name → no event written", () => {
    runTracker({
      hook_event_name: "PreToolUse",
      session_id: "sess-noskill",
      tool_name: "Skill",
      tool_input: {
        // no skill field
      },
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("PreToolUse for Skill tool with no tool_input → no event written", () => {
    runTracker({
      hook_event_name: "PreToolUse",
      session_id: "sess-noinput",
      tool_name: "Skill",
      // no tool_input
    });
    const events = readEvents();
    expect(events).toHaveLength(0);
  });

  test("UserPromptSubmit with leading whitespace before slash → creates slash_command", () => {
    runTracker({
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-ws",
      prompt: "  /deploy production",
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].command).toBe("deploy");
  });

  test("SessionStart: missing model defaults to null", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-nomodel",
      // no model
    });
    const events = readEvents();
    expect(events[0].model).toBeNull();
  });

  test("SessionStart: missing source defaults to 'startup'", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-nosource",
      // no source
    });
    const events = readEvents();
    expect(events[0].source).toBe("startup");
  });

  test("SubagentStart: missing agent_type defaults to 'unknown'", () => {
    runTracker({
      hook_event_name: "SubagentStart",
      session_id: "sess-agenttype",
      agent_id: "id-1",
      // no agent_type
    });
    const events = readEvents();
    expect(events[0].agent_type).toBe("unknown");
  });

  test("StopFailure: missing error_type and reason defaults to 'unknown'", () => {
    runTracker({
      hook_event_name: "StopFailure",
      session_id: "sess-noerr",
      // no error_type or reason
    });
    const events = readEvents();
    expect(events[0].error_type).toBe("unknown");
  });

  test("Multiple events appended sequentially", () => {
    runTracker({ hook_event_name: "SessionStart", session_id: "sess-multi" });
    runTracker({ hook_event_name: "Stop", session_id: "sess-multi" });
    runTracker({ hook_event_name: "SessionEnd", session_id: "sess-multi", reason: "done" });
    const events = readEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(["session_start", "turn_complete", "session_end"]);
  });
});

// ── SessionStart rich data capture ──────────────────────────────────────────

describe("SessionStart rich data capture", () => {
  test("Captures platform and arch from os module", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-platform",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.platform).toBeDefined();
    expect(typeof ev.platform).toBe("string");
    expect(ev.arch).toBeDefined();
    expect(typeof ev.arch).toBe("string");
  });

  test("Captures node_version from process.version", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-node",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.node_version).toBeDefined();
    expect(ev.node_version).toMatch(/^v\d+\.\d+\.\d+/);
  });

  test("Detects javascript stack from package.json", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"test"}');
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-js-stack",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.project_stacks).toContain("javascript");
  });

  test("Detects typescript stack from tsconfig.json", () => {
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{}');
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-ts-stack",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.project_stacks).toContain("typescript");
  });

  test("Detects multiple stacks (javascript + typescript)", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"test"}');
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{}');
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-multi-stack",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.project_stacks).toContain("javascript");
    expect(ev.project_stacks).toContain("typescript");
  });

  test("Detects python stack from requirements.txt", () => {
    fs.writeFileSync(path.join(tmpDir, "requirements.txt"), "");
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-py-stack",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.project_stacks).toContain("python");
  });

  test("Detects rust stack from Cargo.toml", () => {
    fs.writeFileSync(path.join(tmpDir, "Cargo.toml"), "");
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-rust-stack",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.project_stacks).toContain("rust");
  });

  test("Returns empty project_stacks array when no markers found", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-no-markers",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.project_stacks).toEqual([]);
  });

  test("Captures repo from git (or null in non-git directory)", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-git",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    // In tmpDir (non-git), repo should be null
    expect(ev.repo).toBeNull();
  });

  test("Captures branch from git (or null in non-git directory)", () => {
    runTracker({
      hook_event_name: "SessionStart",
      session_id: "sess-branch",
      cwd: tmpDir,
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    // In tmpDir (non-git), branch should be null
    expect(ev.branch).toBeNull();
  });
});

// ── PostToolUse language detection ──────────────────────────────────────────

describe("PostToolUse language detection", () => {
  test("Detects typescript from .ts extension", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-ts-lang",
      tool_name: "Read",
      tool_input: { file_path: "/src/utils.ts" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("typescript");
  });

  test("Detects python from .py extension", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-py-lang",
      tool_name: "Read",
      tool_input: { file_path: "/src/main.py" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("python");
  });

  test("Detects rust from .rs extension", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-rs-lang",
      tool_name: "Read",
      tool_input: { file_path: "/src/lib.rs" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("rust");
  });

  test("Detects javascript from .js extension", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-js-lang",
      tool_name: "Read",
      tool_input: { file_path: "/src/index.js" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("javascript");
  });

  test("Detects docker from Dockerfile", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-docker-lang",
      tool_name: "Read",
      tool_input: { file_path: "/Dockerfile" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("docker");
  });

  test("Returns null lang for unknown extensions", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-unknown-lang",
      tool_name: "Read",
      tool_input: { file_path: "/config.unknown" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBeNull();
  });

  test("Returns null lang when file_path is missing", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-no-path-lang",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBeNull();
  });

  test("Detects react framework from .tsx file path", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-react-fw",
      tool_name: "Read",
      tool_input: { file_path: "/components/Button.tsx" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].frameworks).toContain("react");
  });

  test("Detects nextjs framework from /pages/ path", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-nextjs-fw",
      tool_name: "Read",
      tool_input: { file_path: "/pages/index.tsx" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].frameworks).toContain("nextjs");
  });

  test("Returns empty frameworks array when none detected", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-no-fw",
      tool_name: "Read",
      tool_input: { file_path: "/src/main.py" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    // frameworks should not be present if empty
    expect(events[0].frameworks).toBeUndefined();
  });

  test("Detects testing framework from .test.ts file path", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-test-fw",
      tool_name: "Read",
      tool_input: { file_path: "/src/main.test.ts" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].frameworks).toContain("testing");
  });
});

// ── PostToolUse edit size tracking ──────────────────────────────────────────

describe("PostToolUse edit size tracking", () => {
  test("Tracks write size for Write tool", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-write",
      tool_name: "Write",
      tool_input: { file_path: "/file.txt", content: "hello world" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].edit_size).toBeDefined();
    expect(events[0].edit_size.type).toBe("write");
    expect(events[0].edit_size.chars).toBe(11);
  });

  test("Tracks edit size for Edit tool", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-edit",
      tool_name: "Edit",
      tool_input: {
        file_path: "/file.txt",
        old_string: "hello",
        new_string: "goodbye world",
      },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].edit_size).toBeDefined();
    expect(events[0].edit_size.type).toBe("edit");
    expect(events[0].edit_size.chars_removed).toBe(5);
    expect(events[0].edit_size.chars_added).toBe(13);
  });

  test("Does not include edit_size for non-edit tools", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-no-edit",
      tool_name: "Read",
      tool_input: { file_path: "/file.txt" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].edit_size).toBeUndefined();
  });

  test("Handles empty content in Write tool", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-empty-write",
      tool_name: "Write",
      tool_input: { file_path: "/file.txt", content: "" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].edit_size).toBeUndefined();
  });

  test("Handles zero-length edit (only old_string)", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-deletion",
      tool_name: "Edit",
      tool_input: {
        file_path: "/file.txt",
        old_string: "hello",
        new_string: "",
      },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].edit_size.type).toBe("edit");
    expect(events[0].edit_size.chars_removed).toBe(5);
    expect(events[0].edit_size.chars_added).toBe(0);
  });

  test("Handles insertion in Edit tool (old_string empty)", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-insertion",
      tool_name: "Edit",
      tool_input: {
        file_path: "/file.txt",
        old_string: "",
        new_string: "new content",
      },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].edit_size.type).toBe("edit");
    expect(events[0].edit_size.chars_removed).toBe(0);
    expect(events[0].edit_size.chars_added).toBe(11);
  });
});

// ── PostToolUse bash command classification ──────────────────────────────────

describe("PostToolUse bash command classification", () => {
  test("Classifies npm install command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-npm",
      tool_name: "Bash",
      tool_input: { command: "npm install lodash" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("node");
    expect(events[0].bash.stack).toBe("javascript");
    expect(events[0].bash.command_preview).toBe("npm install lodash");
  });

  test("Classifies pip install command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-pip",
      tool_name: "Bash",
      tool_input: { command: "pip install pandas" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("python");
    expect(events[0].bash.stack).toBe("python");
  });

  test("Classifies git status command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-git-cmd",
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("git");
    expect(events[0].bash.stack).toBeNull();
  });

  test("Classifies docker build command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-docker-cmd",
      tool_name: "Bash",
      tool_input: { command: "docker build ." },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("docker");
    expect(events[0].bash.stack).toBe("devops");
  });

  test("Classifies cargo build command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-cargo",
      tool_name: "Bash",
      tool_input: { command: "cargo build --release" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("rust");
    expect(events[0].bash.stack).toBe("rust");
  });

  test("Returns null category for unknown command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-unknown-cmd",
      tool_name: "Bash",
      tool_input: { command: "echo hello" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBeNull();
    expect(events[0].bash.stack).toBeNull();
  });

  test("Does not include bash for non-Bash tools", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-no-bash",
      tool_name: "Read",
      tool_input: { file_path: "/file.txt" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash).toBeUndefined();
  });

  test("Truncates long command preview to 120 chars", () => {
    const longCmd = "npm install " + "package ".repeat(20);
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-long-cmd",
      tool_name: "Bash",
      tool_input: { command: longCmd },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.command_preview.length).toBeLessThanOrEqual(120);
  });

  test("Classifies yarn install command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-yarn",
      tool_name: "Bash",
      tool_input: { command: "yarn add react" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("node");
    expect(events[0].bash.stack).toBe("javascript");
  });

  test("Classifies go build command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-go",
      tool_name: "Bash",
      tool_input: { command: "go build ./..." },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("go");
    expect(events[0].bash.stack).toBe("go");
  });

  test("Classifies kubectl command", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-kubectl",
      tool_name: "Bash",
      tool_input: { command: "kubectl apply -f config.yaml" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].bash.category).toBe("kubernetes");
    expect(events[0].bash.stack).toBe("devops");
  });
});

// ── PostToolUse search pattern capture ──────────────────────────────────────

describe("PostToolUse search pattern capture", () => {
  test("Captures pattern from Grep tool", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-grep",
      tool_name: "Grep",
      tool_input: { pattern: "TODO|FIXME", glob: "*.js" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].search).toBeDefined();
    expect(events[0].search.pattern).toBe("TODO|FIXME");
    expect(events[0].search.glob).toBe("*.js");
  });

  test("Captures pattern from Glob tool", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-glob",
      tool_name: "Glob",
      tool_input: { pattern: "**/*.test.ts" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].search).toBeDefined();
    expect(events[0].search.pattern).toBe("**/*.test.ts");
  });

  test("Truncates long pattern to 100 chars", () => {
    const longPattern = "pattern".repeat(30);
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-long-pattern",
      tool_name: "Grep",
      tool_input: { pattern: longPattern },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].search.pattern.length).toBeLessThanOrEqual(100);
  });

  test("Does not include search for non-search tools", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-no-search",
      tool_name: "Read",
      tool_input: { file_path: "/file.txt" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].search).toBeUndefined();
  });

  test("Does not include search when pattern is missing", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-no-pattern",
      tool_name: "Grep",
      tool_input: { glob: "*.js" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].search).toBeUndefined();
  });
});

// ── PostToolUseFailure language detection ────────────────────────────────────

describe("PostToolUseFailure language detection", () => {
  test("Captures lang from file_path in PostToolUseFailure", () => {
    runTracker({
      hook_event_name: "PostToolUseFailure",
      session_id: "sess-fail-ts",
      tool_name: "Edit",
      error: "Could not read file",
      tool_input: { file_path: "/src/index.ts" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("typescript");
  });

  test("Captures lang from .py file in PostToolUseFailure", () => {
    runTracker({
      hook_event_name: "PostToolUseFailure",
      session_id: "sess-fail-py",
      tool_name: "Read",
      error: "Permission denied",
      tool_input: { file_path: "/main.py" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("python");
  });

  test("Returns null lang when file_path missing in PostToolUseFailure", () => {
    runTracker({
      hook_event_name: "PostToolUseFailure",
      session_id: "sess-fail-no-path",
      tool_name: "Bash",
      error: "Command failed",
      tool_input: { command: "ls" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBeNull();
  });
});

// ── PostToolUse file_path fallback to tool_input.path ──────────────────────

describe("PostToolUse file_path fallback", () => {
  test("Extracts file_path from tool_input.path when file_path missing", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-path-fallback",
      tool_name: "Read",
      tool_input: { path: "/src/main.js" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].file_path).toBe("/src/main.js");
  });

  test("Prefers file_path over path when both present", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-prefer-filepath",
      tool_name: "Read",
      tool_input: { file_path: "/preferred.ts", path: "/fallback.py" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].file_path).toBe("/preferred.ts");
    expect(events[0].lang).toBe("typescript");
  });

  test("Detects lang from path fallback", () => {
    runTracker({
      hook_event_name: "PostToolUse",
      session_id: "sess-lang-from-path",
      tool_name: "Read",
      tool_input: { path: "/script.py" },
    });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].lang).toBe("python");
  });
});
