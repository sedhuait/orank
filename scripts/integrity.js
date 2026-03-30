/**
 * orank — Integrity & Anti-Gaming Engine
 *
 * Rewired for JSONL storage (events.jsonl).
 * Anomaly detection and rate limiting to prevent gaming.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── EVENTS_FILE from storage.js ─────────────────────────────────────────────
const DATA_DIR =
  process.env.CLAUDE_PLUGIN_DATA ||
  path.join(os.homedir(), ".claude", "plugins", "data", "orank");

const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");

// ── Rate Limits ─────────────────────────────────────────────────────────────

const RATE_LIMITS = {
  tool_uses_per_minute: 60,
  sessions_per_day: 50,
  xp_per_day: 5000,
};

// ── Anomaly Detection Rules ─────────────────────────────────────────────────

function loadAllEvents() {
  if (!fs.existsSync(EVENTS_FILE)) {
    return [];
  }

  const content = fs.readFileSync(EVENTS_FILE, "utf-8");
  if (!content.trim()) {
    return [];
  }

  const events = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

const ANOMALY_RULES = [
  {
    id: "impossible-speed",
    name: "Impossible Speed",
    description: "More than 60 tool uses per minute",
    check: (events) => {
      const minuteWindows = {};
      for (const event of events) {
        if (event.type !== "tool_use") continue;
        const minute = event.ts.slice(0, 16);
        minuteWindows[minute] = (minuteWindows[minute] || 0) + 1;
      }

      const violating = Object.entries(minuteWindows)
        .filter(([, count]) => count > 60)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      return {
        flagged: violating.length > 0,
        evidence: violating.map(([minute, count]) => ({ minute, count })),
      };
    },
  },
  {
    id: "session-spam",
    name: "Session Spam",
    description: "More than 50 session_start events in a single day",
    check: (events) => {
      const dayWindows = {};
      for (const event of events) {
        if (event.type !== "session_start") continue;
        const day = event.ts.slice(0, 10);
        dayWindows[day] = (dayWindows[day] || 0) + 1;
      }

      const violating = Object.entries(dayWindows)
        .filter(([, count]) => count > 50)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      return {
        flagged: violating.length > 0,
        evidence: violating.map(([day, count]) => ({ day, count })),
      };
    },
  },
  {
    id: "xp-spike",
    name: "XP Spike",
    description: "More than 5000 total XP earned in a single day",
    check: (events) => {
      const dayXP = {};
      for (const event of events) {
        if (event.type !== "xp_award") continue;
        const day = event.ts.slice(0, 10);
        dayXP[day] = (dayXP[day] || 0) + (event.amount || 0);
      }

      const violating = Object.entries(dayXP)
        .filter(([, total]) => total > 5000)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      return {
        flagged: violating.length > 0,
        evidence: violating.map(([day, total]) => ({ day, total_xp: total })),
      };
    },
  },
  {
    id: "midnight-marathon",
    name: "Midnight Marathon",
    description: "Any session with start→end duration >20 hours",
    check: (events) => {
      const sessions = {};
      for (const event of events) {
        if (event.type === "session_start") {
          sessions[event.sid] = { start_ts: event.ts };
        } else if (event.type === "session_end") {
          if (sessions[event.sid]) {
            sessions[event.sid].end_ts = event.ts;
          }
        }
      }

      const violating = [];
      for (const [sid, { start_ts, end_ts }] of Object.entries(sessions)) {
        if (!end_ts) continue;
        const durationMs = new Date(end_ts) - new Date(start_ts);
        const hours = durationMs / (1000 * 60 * 60);
        if (hours > 20) {
          violating.push({ session_id: sid, hours: Math.round(hours * 100) / 100 });
        }
      }

      violating.sort((a, b) => b.hours - a.hours);
      return {
        flagged: violating.length > 0,
        evidence: violating.slice(0, 5),
      };
    },
  },
  {
    id: "monotone-tools",
    name: "Monotone Tools",
    description: "1000+ identical consecutive tool_use events",
    check: (events) => {
      const toolEvents = events.filter((e) => e.type === "tool_use");
      if (toolEvents.length === 0) {
        return { flagged: false, evidence: [] };
      }

      const violating = [];
      let currentTool = toolEvents[0].tool;
      let streak = 1;

      for (let i = 1; i < toolEvents.length; i++) {
        if (toolEvents[i].tool === currentTool) {
          streak++;
        } else {
          if (streak > 1000) {
            violating.push({ tool: currentTool, streak });
          }
          currentTool = toolEvents[i].tool;
          streak = 1;
        }
      }

      if (streak > 1000) {
        violating.push({ tool: currentTool, streak });
      }

      violating.sort((a, b) => b.streak - a.streak);
      return {
        flagged: violating.length > 0,
        evidence: violating.slice(0, 5),
      };
    },
  },
];

function checkRateLimit(events, eventType) {
  const now = new Date();

  if (eventType === "tool_use" || eventType === "tool_failure") {
    const oneMinuteAgo = new Date(now - 60000);
    const recentCount = events.filter((e) => {
      if (e.type !== "tool_use") return false;
      return new Date(e.ts) > oneMinuteAgo;
    }).length;

    if (recentCount >= RATE_LIMITS.tool_uses_per_minute) {
      return {
        allowed: false,
        reason: `Rate limit: ${RATE_LIMITS.tool_uses_per_minute} tool uses/min`,
      };
    }
    return { allowed: true };
  }

  if (eventType === "session_start") {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayCount = events.filter((e) => {
      if (e.type !== "session_start") return false;
      return new Date(e.ts) >= todayStart;
    }).length;

    if (todayCount >= RATE_LIMITS.sessions_per_day) {
      return {
        allowed: false,
        reason: `Rate limit: ${RATE_LIMITS.sessions_per_day} sessions/day`,
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

function runIntegrityReport(events) {
  const results = [];

  for (const rule of ANOMALY_RULES) {
    try {
      const checkResult = rule.check(events);
      results.push({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        flagged: checkResult.flagged || false,
        evidence: checkResult.evidence || [],
      });
    } catch (e) {
      results.push({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        flagged: false,
        error: e.message,
      });
    }
  }

  const flaggedCount = results.filter((r) => r.flagged).length;
  const trustScore = Math.max(0, 100 - flaggedCount * 15);

  return {
    trustScore,
    totalEvents: events.length,
    flags: flaggedCount,
    checkedAt: new Date().toISOString(),
    results,
  };
}

function formatIntegrityReport(report) {
  const lines = [];

  lines.push("╔══════════════════════════════════════════════════════════╗");
  lines.push("║          orank — Data Integrity Report                  ║");
  lines.push("╚══════════════════════════════════════════════════════════╝");
  lines.push("");

  const scoreIcon = report.trustScore >= 80 ? "✓" : report.trustScore >= 50 ? "!" : "✗";
  lines.push(`  Trust Score: [${scoreIcon}] ${report.trustScore}/100`);
  lines.push(`  Total Events: ${report.totalEvents}    Flags: ${report.flags}`);
  lines.push("");

  lines.push("  ┌─────────────────────────────────────────────────────────┐");
  lines.push("  │  INTEGRITY CHECKS                                      │");
  lines.push("  └─────────────────────────────────────────────────────────┘");
  lines.push("");

  for (const r of report.results) {
    const status = r.flagged ? "[!]" : "[✓]";
    lines.push(`  ${status} ${r.name}`);
    if (r.flagged && r.evidence && r.evidence.length > 0) {
      lines.push(`      Evidence: ${JSON.stringify(r.evidence[0])}`);
    }
    if (r.error) {
      lines.push(`      Error: ${r.error}`);
    }
    lines.push("");
  }

  lines.push("  Checked at: " + report.checkedAt);
  lines.push("");

  return lines.join("\n");
}

export { checkRateLimit, runIntegrityReport, formatIntegrityReport, loadAllEvents, RATE_LIMITS, ANOMALY_RULES };
