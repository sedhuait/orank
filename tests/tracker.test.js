"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

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
