#!/usr/bin/env node
/**
 * tracker.js — Hook entry point for orank event tracking
 *
 * Reads JSON from stdin (Claude Code hook API).
 * Determines event type from hook_event_name field.
 * Must be fast — runs on every hook event.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import { Storage } from "./storage.js";

// ── Helpers ────────────────────���─────────────────────────────────────────────

function getGitBranch() {
  try {
    return (
      execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    const fd = fs.openSync("/dev/stdin", "r");
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length);
    fs.closeSync(fd);
    if (bytesRead === 0) return null;
    return JSON.parse(buf.toString("utf8", 0, bytesRead));
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────��────────────────────────────────────────

function main() {
  const input = readStdin();
  if (!input || !input.hook_event_name) return;

  const storage = new Storage();
  if (storage.isPaused()) return;

  const sid = input.session_id || null;
  const ts = new Date().toISOString();

  switch (input.hook_event_name) {
    case "SessionStart": {
      storage.appendEvent({
        type: "session_start",
        ts,
        sid,
        model: input.model || null,
        source: input.source || "startup",
        cwd: input.cwd || process.cwd(),
        branch: getGitBranch(),
      });
      break;
    }

    case "SessionEnd": {
      storage.appendEvent({
        type: "session_end",
        ts,
        sid,
        reason: input.reason || null,
      });
      break;
    }

    case "PostToolUse": {
      const toolName = input.tool_name || "unknown";
      const filePath = input.tool_input ? input.tool_input.file_path || null : null;
      storage.appendEvent({
        type: "tool_use",
        ts,
        sid,
        tool: toolName,
        file_path: filePath,
      });
      break;
    }

    case "PostToolUseFailure": {
      const toolName = input.tool_name || "unknown";
      const error = input.error || null;
      storage.appendEvent({
        type: "tool_failure",
        ts,
        sid,
        tool: toolName,
        error,
      });
      break;
    }

    case "Stop": {
      storage.appendEvent({
        type: "turn_complete",
        ts,
        sid,
      });
      break;
    }

    case "StopFailure": {
      const errorType = input.error_type || input.reason || "unknown";
      storage.appendEvent({
        type: "turn_error",
        ts,
        sid,
        error_type: errorType,
      });
      break;
    }

    case "UserPromptSubmit": {
      const prompt = input.prompt || "";
      const match = prompt.match(/^\s*\/(\S+)/);
      if (match) {
        storage.appendEvent({
          type: "slash_command",
          ts,
          sid,
          command: match[1],
        });
      }
      break;
    }

    case "PreToolUse": {
      if (input.tool_name === "Skill" && input.tool_input) {
        const skillName = input.tool_input.skill || null;
        if (skillName) {
          storage.appendEvent({
            type: "slash_command",
            ts,
            sid,
            command: skillName,
          });
        }
      }
      break;
    }

    case "SubagentStart": {
      storage.appendEvent({
        type: "subagent_start",
        ts,
        sid,
        agent_type: input.agent_type || "unknown",
        agent_id: input.agent_id || null,
      });
      break;
    }

    case "SubagentStop": {
      storage.appendEvent({
        type: "subagent_stop",
        ts,
        sid,
        agent_type: input.agent_type || "unknown",
        agent_id: input.agent_id || null,
      });
      break;
    }

    default:
      break;
  }
}

main();
