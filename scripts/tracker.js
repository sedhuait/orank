#!/usr/bin/env node
/**
 * tracker.js — Hook entry point for orank event tracking
 *
 * This is a thin, fast script called by Claude Code hooks on every event.
 * It must be quick — runs on every tool use, session start/end, and turn complete.
 *
 * Usage:
 *   tracker.js session-start
 *   tracker.js session-end
 *   tracker.js tool-use --tool <name>
 *   tracker.js tool-failure --tool <name>
 *   tracker.js turn-complete
 */

"use strict";

const { Storage } = require("./storage");
const { execSync } = require("child_process");
const { cwd } = require("process");

// ── Event Type Mapping ───────────────────────────────────────────────────────
const EVENT_TYPE_MAP = {
  "session-start": "session_start",
  "session-end": "session_end",
  "tool-use": "tool_use",
  "tool-failure": "tool_failure",
  "turn-complete": "turn_complete",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get current git branch with 2s timeout
 * Returns null on error
 */
function getGitBranch() {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"], // Suppress stderr
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

/**
 * Generate a session ID
 * Format: ses_{timestamp}_{random}
 */
function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ses_${ts}_${rand}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No event type provided — exit silently
    return;
  }

  const eventName = args[0];
  const eventType = EVENT_TYPE_MAP[eventName];

  if (!eventType) {
    // Unknown event type — exit silently
    return;
  }

  const storage = new Storage();

  // Check if paused
  if (storage.isPaused()) {
    return; // Exit silently
  }

  // Handle each event type
  switch (eventType) {
    case "session_start": {
      const sessionId = generateSessionId();
      const projectPath = process.env.CLAUDE_PROJECT_DIR || cwd();
      const branch = getGitBranch();

      storage.setCurrentSession(sessionId);
      storage.appendEvent({
        type: "session_start",
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        cwd: projectPath,
        branch,
      });
      break;
    }

    case "session_end": {
      const sessionId = storage.getCurrentSession();
      if (sessionId) {
        storage.appendEvent({
          type: "session_end",
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        });
      }
      storage.clearCurrentSession();
      break;
    }

    case "tool_use": {
      const sessionId = storage.getCurrentSession();
      if (sessionId) {
        const toolIdx = args.indexOf("--tool");
        const fileIdx = args.indexOf("--input-file");
        const toolName = toolIdx >= 0 ? args[toolIdx + 1] : process.env.CLAUDE_TOOL_NAME || "unknown";
        const filePath = fileIdx >= 0 ? args[fileIdx + 1] : process.env.CLAUDE_TOOL_INPUT_FILE_PATH || null;

        storage.appendEvent({
          type: "tool_use",
          session_id: sessionId,
          tool_name: toolName,
          file_path: filePath,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case "tool_failure": {
      const sessionId = storage.getCurrentSession();
      if (sessionId) {
        const toolIdx = args.indexOf("--tool");
        const toolName = toolIdx >= 0 ? args[toolIdx + 1] : process.env.CLAUDE_TOOL_NAME || "unknown";

        storage.appendEvent({
          type: "tool_failure",
          session_id: sessionId,
          tool_name: toolName,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case "turn_complete": {
      const sessionId = storage.getCurrentSession();
      if (sessionId) {
        storage.appendEvent({
          type: "turn_complete",
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    default:
      // Should not reach here due to earlier check, but be safe
      break;
  }
}

// ── Entry Point ──────────────────────────────────────────────────────────────
main();
