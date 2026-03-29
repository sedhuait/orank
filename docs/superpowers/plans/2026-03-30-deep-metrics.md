# Deep Metrics & Dynamic Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform orank from an activity counter into a value demonstrator with efficiency scoring, dynamic badges, workflow pattern detection, trend tracking, and a three-layer display system.

**Architecture:** Rewrite the tracker to read JSON from stdin (correct Claude Code hook API), expand from 5 to 10 hooks, add three new pure-function modules (metrics, patterns, dynamic-badges), and enhance the CLI with efficiency scores, trends, insights command, and pending badge display. All data flows linearly: hooks → tracker → storage → metrics/patterns/badges → CLI.

**Tech Stack:** Node.js 18+ (CommonJS), zero npm dependencies, JSONL append-only storage with incremental JSON cache.

**Design Spec:** `docs/superpowers/specs/2026-03-30-deep-metrics-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `scripts/metrics.js` | 5 efficiency dimensions + composite score + letter grade + weekly trends |
| `scripts/patterns.js` | Sliding-window workflow pattern detection with built-in and auto-generated names |
| `scripts/dynamic-badges.js` | Auto-discovers tools/commands, computes adaptive tier thresholds, generates badge definitions |

### Files to rewrite
| File | Why |
|------|-----|
| `scripts/tracker.js` | Switch from env vars + CLI args to stdin JSON; handle 10 hook events instead of 5 |
| `hooks/hooks.json` | Add 5 new hook entries (UserPromptSubmit, PreToolUse, SubagentStart, SubagentStop, StopFailure) |

### Files to modify
| File | Changes |
|------|---------|
| `scripts/storage.js` | New `_emptyCache()` fields, new event types in `_processEvent()`, new public read methods |
| `scripts/badges.js` | Import dynamic-badges, merge curated + dynamic in `evaluate()` and `getSummary()`, add 6 new curated badges |
| `scripts/cli.js` | Enhanced dashboard, new `insights` command, weekly summary, pending badges section |
| `scripts/history-import.js` | Emit new event schema field names (`ts`/`sid`/`tool` instead of `timestamp`/`session_id`/`tool_name`) |
| `scripts/integrity.js` | Update field references (`timestamp`→`ts`, `tool_name`→`tool`, `session_id`→`sid`) |
| `skills/orank/SKILL.md` | Add `insights` to available commands |

---

### Task 1: Expand hooks.json

**Files:**
- Modify: `hooks/hooks.json`

This task adds 5 new hook entries and updates existing hooks to use stdin JSON (removing `$CLAUDE_TOOL_NAME` from command strings since tracker.js will read from stdin instead).

- [ ] **Step 1: Replace hooks.json with expanded version**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/tracker.js"
          }
        ]
      }
    ]
  }
}
```

Note: Every hook now calls the same command (`node tracker.js`) with no arguments. The tracker reads `hook_event_name` from stdin JSON to determine the event type. `PreToolUse` only matches the `Skill` tool (to detect slash commands); `PostToolUse` and `PostToolUseFailure` match all tools.

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('Valid')"`
Expected: `Valid`

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: expand hooks.json from 5 to 10 hook events"
```

---

### Task 2: Rewrite tracker.js (stdin JSON)

**Files:**
- Rewrite: `scripts/tracker.js`

The tracker reads JSON from stdin, determines the hook event type from `hook_event_name`, and emits events to storage using the new short-field schema (`ts`/`sid`/`tool`).

- [ ] **Step 1: Rewrite tracker.js**

```js
#!/usr/bin/env node
/**
 * tracker.js — Hook entry point for orank event tracking
 *
 * Reads JSON from stdin (Claude Code hook API).
 * Determines event type from hook_event_name field.
 * Must be fast — runs on every hook event.
 */

"use strict";

const { Storage } = require("./storage");
const { execSync } = require("child_process");

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGitBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    const fd = require("fs").openSync("/dev/stdin", "r");
    const buf = Buffer.alloc(65536);
    const bytesRead = require("fs").readSync(fd, buf, 0, buf.length);
    require("fs").closeSync(fd);
    if (bytesRead === 0) return null;
    return JSON.parse(buf.toString("utf8", 0, bytesRead));
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
      const filePath = input.tool_input
        ? input.tool_input.file_path || null
        : null;
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
      const errorType = input.error_type
        || input.reason
        || "unknown";
      storage.appendEvent({
        type: "turn_error",
        ts,
        sid,
        error_type: errorType,
      });
      break;
    }

    case "UserPromptSubmit": {
      // Privacy: only extract slash command name, never store prompt
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
      // Only fires for Skill tool (matcher in hooks.json).
      // Extract the skill name being invoked.
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
      // Unknown hook event — exit silently
      break;
  }
}

main();
```

- [ ] **Step 2: Verify syntax**

Run: `node -c scripts/tracker.js`
Expected: `scripts/tracker.js` (no errors)

- [ ] **Step 3: Test with piped JSON**

Run: `echo '{"hook_event_name":"SessionStart","session_id":"test123","cwd":"/tmp","model":"opus"}' | node scripts/tracker.js`

Then verify the event was written:
Run: `tail -1 ~/.claude/plugins/data/orank/events.jsonl`
Expected: A JSON line with `"type":"session_start","sid":"test123"` and `"model":"opus"`

- [ ] **Step 4: Clean up test data**

Run: `rm -f ~/.claude/plugins/data/orank/events.jsonl ~/.claude/plugins/data/orank/cache.json`

- [ ] **Step 5: Commit**

```bash
git add scripts/tracker.js
git commit -m "feat: rewrite tracker.js to read stdin JSON, handle 10 hook events"
```

---

### Task 3: Update storage.js for new event schema

**Files:**
- Modify: `scripts/storage.js`

Update `_emptyCache()` with new fields, rewrite `_processEvent()` for new event types and short field names, add new public read methods, remove self-generated session ID management.

- [ ] **Step 1: Replace _emptyCache() method**

Replace the existing `_emptyCache()` method (around line 101–122) with:

```js
  _emptyCache() {
    return {
      total_xp: 0,
      tier: "Bronze",
      total_sessions: 0,
      total_tools: 0,
      total_tool_failures: 0,
      total_turns: 0,
      total_seconds: 0,
      total_turn_errors: 0,
      total_subagents: 0,
      current_streak: 0,
      longest_streak: 0,
      last_active_date: null,
      tool_counts: {},
      slash_command_counts: {},
      subagent_counts: {},
      turn_errors: {},
      daily_sessions: {},
      hourly_activity: Array(24).fill(0),
      badges_earned: [],
      imported_session_ids: [],
      xp_log: [],
      // Per-session tracking for metrics computation
      sessions: {},
      // Workflow pattern sequences: array of {sid, tools: [tool names in order]}
      tool_sequences: [],
      // Weekly efficiency snapshots: { "2026-W13": { success_rate, throughput, ... } }
      weekly_snapshots: {},
      // Dynamic badge tracks: { "tool:Edit": { count, earned_tiers: [] }, ... }
      dynamic_badge_tracks: {},
      // ISO date string of last weekly summary display
      last_weekly_summary_shown: null,
      events_offset: 0,
      last_rebuilt: null,
    };
  }
```

- [ ] **Step 2: Replace _processEvent() method**

Replace the existing `_processEvent()` method (around line 194–267) with:

```js
  _processEvent(cache, event) {
    const { type, ts, sid } = event;

    switch (type) {
      case "session_start": {
        cache.total_sessions += 1;
        const date = ts.split("T")[0];
        cache.daily_sessions[date] = (cache.daily_sessions[date] || 0) + 1;
        const hour = new Date(ts).getHours();
        cache.hourly_activity[hour] += 1;
        // Initialize per-session tracking
        cache.sessions[sid] = {
          start_ts: ts,
          end_ts: null,
          tool_count: 0,
          failure_count: 0,
          tools_ordered: [],
        };
        break;
      }

      case "session_end": {
        if (cache.sessions[sid]) {
          cache.sessions[sid].end_ts = ts;
          const start = new Date(cache.sessions[sid].start_ts).getTime();
          const end = new Date(ts).getTime();
          const durationSec = Math.floor((end - start) / 1000);
          if (durationSec > 0 && durationSec < 86400) {
            cache.total_seconds += durationSec;
          }
        }
        break;
      }

      case "tool_use": {
        const { tool } = event;
        cache.total_tools += 1;
        cache.tool_counts[tool] = (cache.tool_counts[tool] || 0) + 1;
        // Track per-session tool order for pattern detection
        if (cache.sessions[sid]) {
          cache.sessions[sid].tool_count += 1;
          cache.sessions[sid].tools_ordered.push({ tool, ts });
        }
        // Update dynamic badge track
        const trackKey = "tool:" + tool;
        if (!cache.dynamic_badge_tracks[trackKey]) {
          cache.dynamic_badge_tracks[trackKey] = { count: 0, earned_tiers: [] };
        }
        cache.dynamic_badge_tracks[trackKey].count += 1;
        break;
      }

      case "tool_failure": {
        const { tool } = event;
        cache.total_tools += 1;
        cache.total_tool_failures += 1;
        cache.tool_counts[tool] = (cache.tool_counts[tool] || 0) + 1;
        if (cache.sessions[sid]) {
          cache.sessions[sid].failure_count += 1;
          cache.sessions[sid].tool_count += 1;
          cache.sessions[sid].tools_ordered.push({ tool, ts });
        }
        const trackKey = "tool:" + tool;
        if (!cache.dynamic_badge_tracks[trackKey]) {
          cache.dynamic_badge_tracks[trackKey] = { count: 0, earned_tiers: [] };
        }
        cache.dynamic_badge_tracks[trackKey].count += 1;
        break;
      }

      case "turn_complete": {
        cache.total_turns += 1;
        break;
      }

      case "turn_error": {
        cache.total_turn_errors += 1;
        const errType = event.error_type || "unknown";
        cache.turn_errors[errType] = (cache.turn_errors[errType] || 0) + 1;
        break;
      }

      case "slash_command": {
        const { command } = event;
        cache.slash_command_counts[command] =
          (cache.slash_command_counts[command] || 0) + 1;
        // Update dynamic badge track for commands
        const trackKey = "cmd:" + command;
        if (!cache.dynamic_badge_tracks[trackKey]) {
          cache.dynamic_badge_tracks[trackKey] = { count: 0, earned_tiers: [] };
        }
        cache.dynamic_badge_tracks[trackKey].count += 1;
        break;
      }

      case "subagent_start": {
        cache.total_subagents += 1;
        const agentType = event.agent_type || "unknown";
        cache.subagent_counts[agentType] =
          (cache.subagent_counts[agentType] || 0) + 1;
        break;
      }

      case "subagent_stop": {
        // Currently just tracked for badge counting; duration can be added later
        break;
      }

      case "xp_award": {
        cache.total_xp += event.amount;
        cache.xp_log.push({
          ts,
          amount: event.amount,
          reason: event.reason,
          running_total: cache.total_xp,
        });
        break;
      }

      case "badge_earned": {
        if (!cache.badges_earned.find((b) => b.badge_id === event.badge_id)) {
          cache.badges_earned.push({
            badge_id: event.badge_id,
            badge_name: event.badge_name,
            badge_tier: event.badge_tier,
            earned_at: ts,
          });
        }
        break;
      }

      case "history_import": {
        if (!cache.imported_session_ids.includes(sid)) {
          cache.imported_session_ids.push(sid);
        }
        break;
      }
    }
  }
```

- [ ] **Step 3: Update getStats() to include new fields**

Replace the existing `getStats()` method (around line 347–380) with:

```js
  getStats() {
    const cache = this.ensureFreshCache();

    const successRate =
      cache.total_tools > 0
        ? (((cache.total_tools - cache.total_tool_failures) / cache.total_tools) * 100).toFixed(1)
        : 0;

    const uniqueTools = Object.keys(cache.tool_counts).length;

    const topTools = Object.entries(cache.tool_counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    return {
      total_xp: cache.total_xp,
      tier: cache.tier,
      total_sessions: cache.total_sessions,
      total_tool_uses: cache.total_tools,
      total_tool_failures: cache.total_tool_failures,
      total_turns: cache.total_turns,
      total_seconds: cache.total_seconds,
      total_turn_errors: cache.total_turn_errors,
      total_subagents: cache.total_subagents,
      current_streak: cache.current_streak,
      longest_streak: cache.longest_streak,
      last_active_date: cache.last_active_date,
      success_rate: successRate,
      unique_tools: uniqueTools,
      top_tools: topTools,
      slash_command_counts: cache.slash_command_counts,
      subagent_counts: cache.subagent_counts,
      turn_errors: cache.turn_errors,
      tool_counts: cache.tool_counts,
    };
  }
```

- [ ] **Step 4: Add new public read methods**

Add these methods to the Storage class, right before the `// XP Methods` section (around line 434):

```js
  getSessions() {
    return this.ensureFreshCache().sessions;
  }

  getWeeklySnapshots() {
    return this.ensureFreshCache().weekly_snapshots;
  }

  setWeeklySnapshot(weekKey, snapshot) {
    const cache = this.ensureFreshCache();
    cache.weekly_snapshots[weekKey] = snapshot;
    this._saveCache(cache);
  }

  getDynamicBadgeTracks() {
    return this.ensureFreshCache().dynamic_badge_tracks;
  }

  getLastWeeklySummaryShown() {
    return this.ensureFreshCache().last_weekly_summary_shown;
  }

  setLastWeeklySummaryShown(dateStr) {
    const cache = this.ensureFreshCache();
    cache.last_weekly_summary_shown = dateStr;
    this._saveCache(cache);
  }

  getSlashCommandCounts() {
    return this.ensureFreshCache().slash_command_counts;
  }
```

- [ ] **Step 5: Remove setCurrentSession / getCurrentSession / clearCurrentSession methods**

Delete these three methods (around lines 55–70) — we no longer generate our own session IDs. The native `session_id` from stdin JSON is used directly.

- [ ] **Step 6: Remove the currentSessionFile references**

Remove `this.currentSessionFile = path.join(this.dataDir, '.current-session');` from the constructor (line 27).

Remove the `.current-session` file from the `purge()` method's file list (around line 549).

- [ ] **Step 7: Update addXP and recordBadge to use new field names**

Replace `addXP` (around line 438):

```js
  addXP(amount, reason = "general") {
    this.appendEvent({
      type: "xp_award",
      ts: new Date().toISOString(),
      sid: null,
      amount,
      reason,
    });
  }
```

Replace `recordBadge` (around line 464):

```js
  recordBadge(badgeId, badgeName, badgeTier) {
    this.appendEvent({
      type: "badge_earned",
      ts: new Date().toISOString(),
      sid: null,
      badge_id: badgeId,
      badge_name: badgeName,
      badge_tier: badgeTier,
    });
  }
```

Replace `markSessionImported` (around line 565):

```js
  markSessionImported(id) {
    this.appendEvent({
      type: "history_import",
      ts: new Date().toISOString(),
      sid: id,
    });
  }
```

- [ ] **Step 8: Verify syntax**

Run: `node -c scripts/storage.js`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add scripts/storage.js
git commit -m "feat: update storage.js for new event schema and cache fields"
```

---

### Task 4: Create patterns.js (workflow pattern detection)

**Files:**
- Create: `scripts/patterns.js`

Pure-function module that detects recurring multi-tool sequences from per-session tool ordering data.

- [ ] **Step 1: Create patterns.js**

```js
#!/usr/bin/env node
/**
 * patterns.js — Workflow Pattern Detection
 *
 * Detects recurring multi-tool sequences from session data.
 * Returns named patterns with occurrence counts.
 */

"use strict";

// ── Built-in Pattern Names ──────────────────────────────────────────────────

const NAMED_PATTERNS = {
  "Read,Edit,Bash": "Code-Test",
  "Grep,Read,Edit": "Find-and-Fix",
  "Agent,Read,Edit": "Delegate-then-Refine",
  "Read,Edit,Read": "Iterative Edit",
  "Grep,Read": "Search-and-Review",
  "Bash,Read,Edit": "Debug Cycle",
};

// ── Pattern Detection ───────────────────────────────────────────────────────

/**
 * Detect workflow patterns from session data.
 *
 * @param {Object} sessions — cache.sessions object: { sid: { tools_ordered: [{tool, ts}] } }
 * @param {number} minOccurrences — minimum times a sequence must appear to be a pattern (default 5)
 * @returns {Array<{sequence: string[], name: string, count: number}>} — sorted by count desc
 */
function detectPatterns(sessions, minOccurrences = 5) {
  const sequenceCounts = {};

  for (const session of Object.values(sessions)) {
    const tools = (session.tools_ordered || []).map((t) => t.tool);
    if (tools.length < 2) continue;

    // Slide windows of size 2, 3, and 4
    for (let windowSize = 2; windowSize <= Math.min(4, tools.length); windowSize++) {
      for (let i = 0; i <= tools.length - windowSize; i++) {
        const seq = tools.slice(i, i + windowSize);
        const key = seq.join(",");
        sequenceCounts[key] = (sequenceCounts[key] || 0) + 1;
      }
    }
  }

  // Filter to sequences occurring at least minOccurrences times
  const patterns = [];
  for (const [key, count] of Object.entries(sequenceCounts)) {
    if (count >= minOccurrences) {
      const sequence = key.split(",");
      const name = NAMED_PATTERNS[key] || sequence.join(" \u2192 ") + " flow";
      patterns.push({ sequence, name, count });
    }
  }

  // Sort by count descending
  patterns.sort((a, b) => b.count - a.count);
  return patterns;
}

/**
 * Compute workflow score: percentage of tool uses that fall within detected patterns.
 *
 * @param {Object} sessions — cache.sessions object
 * @param {number} totalTools — total tool uses
 * @returns {number} — 0 to 100
 */
function computeWorkflowScore(sessions, totalTools) {
  if (totalTools === 0) return 0;

  const patterns = detectPatterns(sessions);
  if (patterns.length === 0) return 0;

  // Count tool uses that are part of any pattern
  // Use the longest patterns first to avoid double-counting
  let coveredUses = 0;
  const sortedByLength = [...patterns].sort(
    (a, b) => b.sequence.length - a.sequence.length
  );

  for (const session of Object.values(sessions)) {
    const tools = (session.tools_ordered || []).map((t) => t.tool);
    const covered = new Set();

    for (const pattern of sortedByLength) {
      const seq = pattern.sequence;
      for (let i = 0; i <= tools.length - seq.length; i++) {
        const match = seq.every((s, j) => tools[i + j] === s);
        if (match) {
          for (let j = 0; j < seq.length; j++) {
            covered.add(i + j);
          }
        }
      }
    }

    coveredUses += covered.size;
  }

  return Math.min(100, Math.round((coveredUses / totalTools) * 100));
}

module.exports = { detectPatterns, computeWorkflowScore, NAMED_PATTERNS };
```

- [ ] **Step 2: Verify syntax**

Run: `node -c scripts/patterns.js`
Expected: No errors

- [ ] **Step 3: Quick smoke test**

Run:
```bash
node -e "
const { detectPatterns, computeWorkflowScore } = require('./scripts/patterns');
const sessions = {
  s1: { tools_ordered: [
    {tool:'Read',ts:'t'},{tool:'Edit',ts:'t'},{tool:'Bash',ts:'t'},
    {tool:'Read',ts:'t'},{tool:'Edit',ts:'t'},{tool:'Bash',ts:'t'},
    {tool:'Read',ts:'t'},{tool:'Edit',ts:'t'},{tool:'Bash',ts:'t'},
    {tool:'Read',ts:'t'},{tool:'Edit',ts:'t'},{tool:'Bash',ts:'t'},
    {tool:'Read',ts:'t'},{tool:'Edit',ts:'t'},{tool:'Bash',ts:'t'},
  ]}
};
const p = detectPatterns(sessions);
console.log('Patterns found:', p.length);
console.log('Code-Test:', p.find(x => x.name === 'Code-Test')?.count);
const ws = computeWorkflowScore(sessions, 15);
console.log('Workflow score:', ws);
"
```
Expected: `Patterns found:` > 0, `Code-Test: 5`, `Workflow score:` > 0

- [ ] **Step 4: Commit**

```bash
git add scripts/patterns.js
git commit -m "feat: add patterns.js for workflow pattern detection"
```

---

### Task 5: Create metrics.js (efficiency engine)

**Files:**
- Create: `scripts/metrics.js`

Pure-function module that computes 5 efficiency dimensions, composite score, letter grade, and weekly trend comparisons.

- [ ] **Step 1: Create metrics.js**

```js
#!/usr/bin/env node
/**
 * metrics.js — Efficiency Metrics Engine
 *
 * Computes 5 efficiency dimensions + composite score + letter grade.
 * All functions are pure — take data in, return scores out.
 */

"use strict";

const { computeWorkflowScore } = require("./patterns");

// ── Grade Mapping ───────────────────────────────────────────────────────────

const GRADES = [
  { min: 95, grade: "A+" },
  { min: 90, grade: "A" },
  { min: 85, grade: "A-" },
  { min: 80, grade: "B+" },
  { min: 75, grade: "B" },
  { min: 70, grade: "B-" },
  { min: 65, grade: "C+" },
  { min: 60, grade: "C" },
  { min: 55, grade: "C-" },
  { min: 40, grade: "D" },
  { min: 0, grade: "F" },
];

function getGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g.grade;
  }
  return "F";
}

// ── Individual Metrics ──────────────────────────────────────────────────────

/**
 * Success Rate: (total_tools - total_failures) / total_tools * 100
 * Returns 0–100
 */
function computeSuccessRate(totalTools, totalFailures) {
  if (totalTools === 0) return 100;
  return ((totalTools - totalFailures) / totalTools) * 100;
}

/**
 * Throughput: tools per active session minute.
 * Returns raw value (not 0–100). Normalized later.
 */
function computeThroughput(totalTools, totalSeconds) {
  if (totalSeconds === 0) return 0;
  const minutes = totalSeconds / 60;
  return totalTools / minutes;
}

/**
 * Breadth: unique tools used / total distinct tools ever seen.
 * For weekly: unique tools this week / all tools ever seen.
 * Returns 0–100.
 */
function computeBreadth(uniqueToolsInWindow, totalDistinctToolsEver) {
  if (totalDistinctToolsEver === 0) return 0;
  return (uniqueToolsInWindow / totalDistinctToolsEver) * 100;
}

/**
 * Retry Rate: consecutive same-tool calls within 30s / total tool calls.
 * Returns 0–100 (lower is better).
 */
function computeRetryRate(sessions) {
  let totalTools = 0;
  let retries = 0;

  for (const session of Object.values(sessions)) {
    const tools = session.tools_ordered || [];
    totalTools += tools.length;

    for (let i = 1; i < tools.length; i++) {
      if (tools[i].tool === tools[i - 1].tool) {
        const gap = new Date(tools[i].ts).getTime() - new Date(tools[i - 1].ts).getTime();
        if (gap < 30000) {
          retries += 1;
        }
      }
    }
  }

  if (totalTools === 0) return 0;
  return (retries / totalTools) * 100;
}

// ── Composite Score ─────────────────────────────────────────────────────────

// Weights for each dimension
const WEIGHTS = {
  success_rate: 0.25,
  throughput: 0.20,
  breadth: 0.15,
  retry_rate: 0.20,
  workflow_score: 0.20,
};

/**
 * Normalize throughput to 0–100 scale.
 * 0 tools/min = 0, 10+ tools/min = 100 (capped).
 */
function normalizeThroughput(rawThroughput) {
  return Math.min(100, (rawThroughput / 10) * 100);
}

/**
 * Compute all 5 metrics + composite + grade.
 *
 * @param {Object} params
 * @param {number} params.totalTools
 * @param {number} params.totalFailures
 * @param {number} params.totalSeconds
 * @param {number} params.uniqueToolsInWindow
 * @param {number} params.totalDistinctToolsEver
 * @param {Object} params.sessions — cache.sessions
 * @returns {Object} { success_rate, throughput, breadth, retry_rate, workflow_score, composite, grade }
 */
function computeMetrics({
  totalTools,
  totalFailures,
  totalSeconds,
  uniqueToolsInWindow,
  totalDistinctToolsEver,
  sessions,
}) {
  const success_rate = computeSuccessRate(totalTools, totalFailures);
  const rawThroughput = computeThroughput(totalTools, totalSeconds);
  const throughput = normalizeThroughput(rawThroughput);
  const breadth = computeBreadth(uniqueToolsInWindow, totalDistinctToolsEver);
  const retry_rate = computeRetryRate(sessions);
  const workflow_score = computeWorkflowScore(sessions, totalTools);

  // Composite: weighted average. Retry rate is inverted (lower is better).
  const composite = Math.round(
    success_rate * WEIGHTS.success_rate +
    throughput * WEIGHTS.throughput +
    breadth * WEIGHTS.breadth +
    (100 - retry_rate) * WEIGHTS.retry_rate +
    workflow_score * WEIGHTS.workflow_score
  );

  const grade = getGrade(composite);

  return {
    success_rate: Math.round(success_rate * 10) / 10,
    throughput: Math.round(rawThroughput * 10) / 10,
    breadth: Math.round(breadth * 10) / 10,
    retry_rate: Math.round(retry_rate * 10) / 10,
    workflow_score: Math.round(workflow_score * 10) / 10,
    composite,
    grade,
  };
}

// ── Trend Computation ───────────────────────────────────────────────────────

/**
 * Get the ISO week key for a date (e.g., "2026-W13").
 */
function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Compute trend arrows for each metric.
 *
 * @param {Object} current — current week's metrics
 * @param {Object|null} previous — previous week's metrics (null if no data)
 * @returns {Object} — { metric_name: { delta: number, arrow: "↑"|"↓"|"" } }
 */
function computeTrends(current, previous) {
  if (!previous) {
    return {
      success_rate: { delta: 0, arrow: "" },
      throughput: { delta: 0, arrow: "" },
      breadth: { delta: 0, arrow: "" },
      retry_rate: { delta: 0, arrow: "" },
      workflow_score: { delta: 0, arrow: "" },
      composite: { delta: 0, arrow: "" },
    };
  }

  const result = {};
  for (const key of ["success_rate", "throughput", "breadth", "retry_rate", "workflow_score", "composite"]) {
    const delta = current[key] - (previous[key] || 0);
    let arrow = "";
    if (Math.abs(delta) >= 0.5) {
      if (key === "retry_rate") {
        // For retry rate, lower is better, so arrow is inverted
        arrow = delta > 0 ? "\u2193" : "\u2191";
      } else {
        arrow = delta > 0 ? "\u2191" : "\u2193";
      }
    }
    result[key] = { delta: Math.round(delta * 10) / 10, arrow };
  }

  return result;
}

module.exports = {
  computeMetrics,
  computeTrends,
  getWeekKey,
  getGrade,
  WEIGHTS,
};
```

- [ ] **Step 2: Verify syntax**

Run: `node -c scripts/metrics.js`
Expected: No errors

- [ ] **Step 3: Quick smoke test**

Run:
```bash
node -e "
const { computeMetrics, getWeekKey, computeTrends } = require('./scripts/metrics');
const m = computeMetrics({
  totalTools: 100,
  totalFailures: 5,
  totalSeconds: 3600,
  uniqueToolsInWindow: 8,
  totalDistinctToolsEver: 10,
  sessions: {
    s1: { tools_ordered: [
      {tool:'Read',ts:'2026-03-30T10:00:00Z'},{tool:'Edit',ts:'2026-03-30T10:00:05Z'},
      {tool:'Bash',ts:'2026-03-30T10:00:10Z'},{tool:'Read',ts:'2026-03-30T10:00:15Z'},
    ]}
  }
});
console.log('Grade:', m.grade, 'Composite:', m.composite);
console.log('Week key:', getWeekKey('2026-03-30'));
const trends = computeTrends(m, { ...m, composite: m.composite - 5 });
console.log('Composite trend:', trends.composite.arrow);
"
```
Expected: A grade and composite score, a week key like `2026-W14`, and a trend arrow.

- [ ] **Step 4: Commit**

```bash
git add scripts/metrics.js
git commit -m "feat: add metrics.js for efficiency scoring and trends"
```

---

### Task 6: Create dynamic-badges.js

**Files:**
- Create: `scripts/dynamic-badges.js`

Auto-discovers tools/commands, computes adaptive tier thresholds based on usage share, generates badge definitions on the fly.

- [ ] **Step 1: Create dynamic-badges.js**

```js
#!/usr/bin/env node
/**
 * dynamic-badges.js — Auto-Discovered Badge System
 *
 * Creates badge tracks for every tool and slash command.
 * Adaptive tier thresholds based on usage share.
 */

"use strict";

// ── Tier Threshold Tables ───────────────────────────────────────────────────

// Thresholds: [Bronze, Silver, Gold, Platinum, Diamond]
const THRESHOLD_COMMON = [10, 100, 500, 1000, 5000];   // >10% usage share
const THRESHOLD_MODERATE = [5, 50, 200, 500, 2000];     // 1–10% usage share
const THRESHOLD_RARE = [1, 10, 50, 100, 500];           // <1% usage share

const TIER_NAMES = ["bronze", "silver", "gold", "platinum", "diamond"];
const TIER_LABELS = ["Novice", "Adept", "Master", "Virtuoso", "Legend"];
const TIER_ICONS = {
  bronze: "\uD83E\uDD49",
  silver: "\uD83E\uDD48",
  gold: "\uD83E\uDD47",
  platinum: "\uD83C\uDFC6",
  diamond: "\uD83D\uDC8E",
};

// ── Threshold Selection ─────────────────────────────────────────────────────

/**
 * Select thresholds based on usage share.
 * @param {number} count — this tool/command's count
 * @param {number} totalCount — total across all tools/commands of same type
 * @returns {number[]} — [Bronze, Silver, Gold, Platinum, Diamond] thresholds
 */
function selectThresholds(count, totalCount) {
  if (totalCount === 0) return THRESHOLD_RARE;
  const share = (count / totalCount) * 100;
  if (share > 10) return THRESHOLD_COMMON;
  if (share >= 1) return THRESHOLD_MODERATE;
  return THRESHOLD_RARE;
}

/**
 * Determine current earned tier for a track.
 * @param {number} count — current count
 * @param {number[]} thresholds — tier thresholds
 * @returns {string|null} — tier name or null if no tier earned
 */
function getCurrentTier(count, thresholds) {
  let tier = null;
  for (let i = 0; i < thresholds.length; i++) {
    if (count >= thresholds[i]) {
      tier = TIER_NAMES[i];
    }
  }
  return tier;
}

/**
 * Get the next tier and progress toward it.
 * @param {number} count — current count
 * @param {number[]} thresholds — tier thresholds
 * @returns {{ nextTier: string|null, progress: number, needed: number }}
 */
function getNextTierProgress(count, thresholds) {
  for (let i = 0; i < thresholds.length; i++) {
    if (count < thresholds[i]) {
      const prevThreshold = i > 0 ? thresholds[i - 1] : 0;
      const range = thresholds[i] - prevThreshold;
      const progress = range > 0 ? ((count - prevThreshold) / range) * 100 : 0;
      return {
        nextTier: TIER_NAMES[i],
        progress: Math.min(100, Math.round(progress)),
        needed: thresholds[i] - count,
      };
    }
  }
  // All tiers earned
  return { nextTier: null, progress: 100, needed: 0 };
}

// ── Badge Generation ────────────────────────────────────────────────────────

/**
 * Generate dynamic badge definitions from badge tracks in cache.
 *
 * @param {Object} dynamicBadgeTracks — cache.dynamic_badge_tracks
 * @param {number} totalToolCount — cache.total_tools
 * @param {number} totalCommandCount — sum of all slash_command_counts
 * @returns {Array<Object>} — badge objects compatible with BadgeEngine
 */
function generateDynamicBadges(dynamicBadgeTracks, totalToolCount, totalCommandCount) {
  const badges = [];

  for (const [trackKey, track] of Object.entries(dynamicBadgeTracks)) {
    const isCommand = trackKey.startsWith("cmd:");
    const rawName = trackKey.split(":")[1];
    const displayName = isCommand ? "/" + rawName : rawName;
    const totalCount = isCommand ? totalCommandCount : totalToolCount;
    const thresholds = selectThresholds(track.count, totalCount);
    const currentTier = getCurrentTier(track.count, thresholds);
    const nextProgress = getNextTierProgress(track.count, thresholds);

    // Generate one badge per tier
    for (let i = 0; i < TIER_NAMES.length; i++) {
      const tier = TIER_NAMES[i];
      const threshold = thresholds[i];
      const earned = track.count >= threshold;
      const badgeId = `dynamic:${trackKey}:${tier}`;

      // Progress for this specific tier
      let progress = 0;
      if (earned) {
        progress = 100;
      } else if (i === 0) {
        progress = Math.min(100, (track.count / threshold) * 100);
      } else if (track.count >= thresholds[i - 1]) {
        // In range for this tier
        const prevThreshold = thresholds[i - 1];
        const range = threshold - prevThreshold;
        progress = range > 0 ? ((track.count - prevThreshold) / range) * 100 : 0;
      }

      badges.push({
        id: badgeId,
        name: `${displayName} ${TIER_LABELS[i]}`,
        description: `Use ${displayName} ${threshold} times`,
        icon: TIER_ICONS[tier],
        tier,
        isDynamic: true,
        trackKey,
        count: track.count,
        threshold,
        progress: Math.min(100, Math.round(progress)),
        earned,
        needed: earned ? 0 : threshold - track.count,
      });
    }
  }

  return badges;
}

/**
 * Get the top N badges closest to being earned (not yet earned, highest progress).
 *
 * @param {Array<Object>} allBadges — combined curated + dynamic badges with progress
 * @param {number} n — number to return
 * @returns {Array<Object>}
 */
function getNextBadges(allBadges, n = 5) {
  return allBadges
    .filter((b) => !b.earned && b.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, n);
}

module.exports = {
  generateDynamicBadges,
  getNextBadges,
  selectThresholds,
  getCurrentTier,
  getNextTierProgress,
  TIER_NAMES,
  TIER_LABELS,
  TIER_ICONS,
  THRESHOLD_COMMON,
  THRESHOLD_MODERATE,
  THRESHOLD_RARE,
};
```

- [ ] **Step 2: Verify syntax**

Run: `node -c scripts/dynamic-badges.js`
Expected: No errors

- [ ] **Step 3: Quick smoke test**

Run:
```bash
node -e "
const { generateDynamicBadges, getNextBadges } = require('./scripts/dynamic-badges');
const tracks = {
  'tool:Edit': { count: 842, earned_tiers: [] },
  'tool:Bash': { count: 5, earned_tiers: [] },
  'cmd:commit': { count: 14, earned_tiers: [] },
};
const badges = generateDynamicBadges(tracks, 1000, 20);
console.log('Total dynamic badges:', badges.length);
const earned = badges.filter(b => b.earned);
console.log('Earned:', earned.length);
const next = getNextBadges(badges, 3);
console.log('Next badges:', next.map(b => b.name + ' (' + b.progress + '%)').join(', '));
"
```
Expected: 15 total dynamic badges (3 tracks x 5 tiers), several earned, and 3 next badges with progress.

- [ ] **Step 4: Commit**

```bash
git add scripts/dynamic-badges.js
git commit -m "feat: add dynamic-badges.js for auto-discovered badge tracks"
```

---

### Task 7: Update badges.js (merge curated + dynamic + new badges)

**Files:**
- Modify: `scripts/badges.js`

Add 6 new curated badges, integrate dynamic badge system, update `evaluate()` and `getSummary()` to merge both.

- [ ] **Step 1: Add new curated badge definitions**

Add these 6 badges to the end of the `BADGE_DEFINITIONS` array (before the closing `];` around line 235):

```js
  // ── Efficiency & Depth Badges ──────────────────────────────────────────
  {
    id: "efficiency-expert",
    name: "Efficiency Expert",
    description: "Maintain A+ efficiency score for 7 days",
    icon: "\uD83C\uDF1F",
    tier: "gold",
    check: (stats) => {
      // Checked via weekly snapshots — requires external data
      // Will be evaluated by the CLI when snapshot data is available
      return { earned: false, progress: 0 };
    },
  },
  {
    id: "pattern-builder",
    name: "Pattern Builder",
    description: "Develop 5 recognized workflow patterns",
    icon: "\uD83D\uDD04",
    tier: "silver",
    check: (stats) => {
      const count = stats._pattern_count || 0;
      return { earned: count >= 5, progress: Math.min(100, (count / 5) * 100) };
    },
  },
  {
    id: "parallel-thinker",
    name: "Parallel Thinker",
    description: "Use 10+ subagent sessions",
    icon: "\uD83E\uDDE0",
    tier: "silver",
    check: (stats) => {
      const count = stats.total_subagents || 0;
      return { earned: count >= 10, progress: Math.min(100, (count / 10) * 100) };
    },
  },
  {
    id: "zero-failures",
    name: "Zero Failures",
    description: "Complete a 50+ tool session with 0 failures",
    icon: "\uD83D\uDEE1\uFE0F",
    tier: "gold",
    check: (stats) => {
      // Checked via per-session data — requires external evaluation
      const achieved = stats._zero_failure_session || false;
      return { earned: achieved, progress: achieved ? 100 : 0 };
    },
  },
  {
    id: "command-explorer",
    name: "Command Explorer",
    description: "Use 20 different slash commands",
    icon: "\u2328\uFE0F",
    tier: "silver",
    check: (stats) => {
      const count = Object.keys(stats.slash_command_counts || {}).length;
      return { earned: count >= 20, progress: Math.min(100, (count / 20) * 100) };
    },
  },
  {
    id: "trend-setter",
    name: "Trend Setter",
    description: "Improve efficiency score 4 weeks in a row",
    icon: "\uD83D\uDCC8",
    tier: "platinum",
    check: (stats) => {
      // Checked via weekly snapshots — requires external data
      const weeks = stats._improving_weeks || 0;
      return { earned: weeks >= 4, progress: Math.min(100, (weeks / 4) * 100) };
    },
  },
```

- [ ] **Step 2: Add dynamic badges import at the top of the file**

Add after the existing `"use strict";` declaration (line 8 area):

```js
const { generateDynamicBadges, getNextBadges } = require("./dynamic-badges");
```

- [ ] **Step 3: Update getSummary() to merge dynamic badges**

Replace the existing `getSummary()` method (around line 329–353) with:

```js
  getSummary() {
    const earnedBadges = this.storage.getBadges().earned;
    const earnedIds = new Set(earnedBadges.map((b) => b.badge_id));
    const stats = this.storage.getStats();
    stats.total_xp = this.storage.getTotalXP();

    // Enrich stats with pattern and session data for new badge checks
    const { detectPatterns } = require("./patterns");
    const sessions = this.storage.getSessions();
    const patterns = detectPatterns(sessions);
    stats._pattern_count = patterns.length;
    stats._zero_failure_session = Object.values(sessions).some(
      (s) => s.tool_count >= 50 && s.failure_count === 0
    );

    // Check weekly snapshots for trend-setter badge
    const snapshots = this.storage.getWeeklySnapshots();
    const weekKeys = Object.keys(snapshots).sort();
    let improvingWeeks = 0;
    for (let i = 1; i < weekKeys.length; i++) {
      if (snapshots[weekKeys[i]].composite > snapshots[weekKeys[i - 1]].composite) {
        improvingWeeks += 1;
      } else {
        improvingWeeks = 0;
      }
    }
    stats._improving_weeks = improvingWeeks;

    // Evaluate curated badges
    const earned = [];
    const inProgress = [];
    const locked = [];

    for (const badge of BADGE_DEFINITIONS) {
      if (earnedIds.has(badge.id)) {
        const eb = earnedBadges.find((b) => b.badge_id === badge.id);
        earned.push({ ...badge, earned_at: eb ? eb.earned_at : null, progress: 100 });
      } else {
        const result = badge.check(stats);
        if (result.progress > 0) {
          inProgress.push({ ...badge, progress: result.progress });
        } else {
          locked.push({ ...badge, progress: 0 });
        }
      }
    }

    // Generate and merge dynamic badges
    const tracks = this.storage.getDynamicBadgeTracks();
    const totalCmdCount = Object.values(stats.slash_command_counts || {}).reduce((a, b) => a + b, 0);
    const dynamicBadges = generateDynamicBadges(tracks, stats.total_tool_uses, totalCmdCount);

    for (const db of dynamicBadges) {
      if (db.earned) {
        // Check if already recorded in storage
        if (!earnedIds.has(db.id)) {
          earned.push({ ...db, earned_at: null });
        } else {
          const eb = earnedBadges.find((b) => b.badge_id === db.id);
          earned.push({ ...db, earned_at: eb ? eb.earned_at : null });
        }
      } else if (db.progress > 0) {
        inProgress.push(db);
      } else {
        locked.push(db);
      }
    }

    const allBadges = [...earned, ...inProgress, ...locked];
    const nextBadges = getNextBadges(allBadges);

    return {
      earned,
      inProgress,
      locked,
      total: BADGE_DEFINITIONS.length + dynamicBadges.length,
      nextBadges,
    };
  }
```

- [ ] **Step 4: Update evaluate() to handle dynamic badges**

Replace the existing `evaluate()` method (around line 282–300) with:

```js
  evaluate() {
    const stats = this.storage.getStats();
    stats.total_xp = this.storage.getTotalXP();

    // Enrich stats for new badge checks
    const { detectPatterns } = require("./patterns");
    const sessions = this.storage.getSessions();
    const patterns = detectPatterns(sessions);
    stats._pattern_count = patterns.length;
    stats._zero_failure_session = Object.values(sessions).some(
      (s) => s.tool_count >= 50 && s.failure_count === 0
    );

    const snapshots = this.storage.getWeeklySnapshots();
    const weekKeys = Object.keys(snapshots).sort();
    let improvingWeeks = 0;
    for (let i = 1; i < weekKeys.length; i++) {
      if (snapshots[weekKeys[i]].composite > snapshots[weekKeys[i - 1]].composite) {
        improvingWeeks += 1;
      } else {
        improvingWeeks = 0;
      }
    }
    stats._improving_weeks = improvingWeeks;

    const earnedBadges = this.storage.getBadges().earned;
    const earnedIds = new Set(earnedBadges.map((b) => b.badge_id));
    const newlyEarned = [];

    // Evaluate curated badges
    for (const badge of BADGE_DEFINITIONS) {
      if (earnedIds.has(badge.id)) continue;
      const result = badge.check(stats);
      if (result.earned) {
        newlyEarned.push(badge);
        this.storage.recordBadge(badge.id, badge.name, badge.tier);
        const xpKey = `BADGE_EARNED_${badge.tier.toUpperCase()}`;
        const xpAmount = XP_RULES[xpKey] || 100;
        this.storage.addXP(xpAmount, `Badge earned: ${badge.name}`);
      }
    }

    // Evaluate dynamic badges
    const tracks = this.storage.getDynamicBadgeTracks();
    const totalCmdCount = Object.values(stats.slash_command_counts || {}).reduce((a, b) => a + b, 0);
    const dynamicBadges = generateDynamicBadges(tracks, stats.total_tool_uses, totalCmdCount);

    for (const db of dynamicBadges) {
      if (!db.earned) continue;
      if (earnedIds.has(db.id)) continue;
      newlyEarned.push(db);
      this.storage.recordBadge(db.id, db.name, db.tier);
      const xpKey = `BADGE_EARNED_${db.tier.toUpperCase()}`;
      const xpAmount = XP_RULES[xpKey] || 100;
      this.storage.addXP(xpAmount, `Badge earned: ${db.name}`);
    }

    return newlyEarned;
  }
```

- [ ] **Step 5: Verify syntax**

Run: `node -c scripts/badges.js`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add scripts/badges.js
git commit -m "feat: add 6 new curated badges, integrate dynamic badge system"
```

---

### Task 8: Update cli.js (enhanced dashboard + insights)

**Files:**
- Modify: `scripts/cli.js`

Enhanced main dashboard with efficiency score, trends, pending badges. New `insights` command. Weekly summary.

- [ ] **Step 1: Add new imports at the top of cli.js**

Replace the existing imports (lines 22–29) with:

```js
const { Storage } = require("./storage");
const { BadgeEngine, getTier, TIERS } = require("./badges");
const { HistoryImporter } = require("./history-import");
const {
  runIntegrityReport,
  formatIntegrityReport,
  loadAllEvents,
} = require("./integrity");
const { computeMetrics, computeTrends, getWeekKey } = require("./metrics");
const { detectPatterns } = require("./patterns");
```

- [ ] **Step 2: Add helper function for computing current metrics**

Add after the `bar()` function (around line 50):

```js
function getCurrentMetrics(storage) {
  const stats = storage.getStats();
  const sessions = storage.getSessions();
  const totalDistinctTools = Object.keys(stats.tool_counts).length;

  const metrics = computeMetrics({
    totalTools: stats.total_tool_uses,
    totalFailures: stats.total_tool_failures,
    totalSeconds: stats.total_seconds,
    uniqueToolsInWindow: totalDistinctTools,
    totalDistinctToolsEver: totalDistinctTools,
    sessions,
  });

  // Get previous week's snapshot for trends
  const weekKey = getWeekKey(new Date());
  const snapshots = storage.getWeeklySnapshots();

  // Save current week's snapshot
  storage.setWeeklySnapshot(weekKey, metrics);

  // Find previous week
  const allWeeks = Object.keys(snapshots).sort();
  const currentIdx = allWeeks.indexOf(weekKey);
  const prevWeek = currentIdx > 0 ? snapshots[allWeeks[currentIdx - 1]] : null;
  const trends = computeTrends(metrics, prevWeek);

  return { metrics, trends, weekKey };
}

function trendStr(value, trend) {
  if (!trend || !trend.arrow) return String(value);
  return `${value}  ${trend.arrow}`;
}

function trendPctStr(value, trend) {
  if (!trend || !trend.arrow || trend.delta === 0) return String(value);
  return `${value}  ${trend.arrow}${Math.abs(trend.delta)}%`;
}

function starRating(trackKey, dynamicTracks) {
  const track = dynamicTracks[trackKey];
  if (!track) return "";
  const { getCurrentTier, TIER_NAMES } = require("./dynamic-badges");
  const { selectThresholds } = require("./dynamic-badges");
  const thresholds = selectThresholds(track.count, 1);
  const tier = getCurrentTier(track.count, thresholds);
  if (!tier) return "";
  const idx = TIER_NAMES.indexOf(tier);
  return "\u2605".repeat(idx + 1);
}
```

- [ ] **Step 3: Replace cmdStats function**

Replace the entire `cmdStats` function (around lines 54–136) with:

```js
function cmdStats(storage) {
  const engine = new BadgeEngine(storage);
  const newBadges = engine.evaluate();
  const stats = storage.getStats();
  const tier = getTier(stats.total_xp);
  const badges = engine.getSummary();
  const todayXP = storage.getTodayXP();
  const { metrics, trends } = getCurrentMetrics(storage);
  const dynamicTracks = storage.getDynamicBadgeTracks();

  const lines = [];

  // Weekly summary (passive — first call of the week)
  const weekKey = getWeekKey(new Date());
  const lastSummary = storage.getLastWeeklySummaryShown();
  const snapshots = storage.getWeeklySnapshots();
  const allWeeks = Object.keys(snapshots).sort();
  const currentIdx = allWeeks.indexOf(weekKey);

  if (lastSummary !== weekKey && currentIdx > 0) {
    const prevWeek = snapshots[allWeeks[currentIdx - 1]];
    const prevGrade = prevWeek.grade || "?";
    const weekBadges = newBadges.length;
    const weekHours = Math.round(stats.total_seconds / 3600);
    lines.push(`  \uD83D\uDCCA Last week: Efficiency ${prevGrade} \u2192 ${metrics.grade} (\u2191${Math.abs(metrics.composite - (prevWeek.composite || 0))}%), ${weekBadges} new badges, ${weekHours}h active`);
    lines.push("");
    storage.setLastWeeklySummaryShown(weekKey);
  }

  lines.push("");
  lines.push("  orank \u2014 your open AI score");
  lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push("");

  // Header with efficiency
  lines.push(`  ${tier.icon}  ${tier.name}    ${fmt(stats.total_xp)} XP    Today: +${fmt(todayXP)} XP    Efficiency: ${metrics.grade} (${metrics.composite}) ${trends.composite.arrow}`);
  if (tier.nextTier) {
    lines.push(`  \u2192 ${tier.nextTier}: ${bar(parseFloat(tier.progress))}  (${fmt(tier.nextTierXP - stats.total_xp)} to go)`);
  } else {
    lines.push("  Maximum tier reached!");
  }
  lines.push("");

  // Key Stats with trends
  lines.push("  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
  lines.push(`  \u2502  Sessions: ${String(stats.total_sessions).padEnd(8)} Tools: ${String(fmt(stats.total_tool_uses)).padEnd(10)} Success: ${trendStr(stats.success_rate + "%", trends.success_rate)}`);
  lines.push(`  \u2502  Turns:    ${String(fmt(stats.total_turns)).padEnd(8)} Time:  ${String(formatDuration(stats.total_seconds)).padEnd(10)} Breadth: ${stats.unique_tools}/${Object.keys(stats.tool_counts).length}`);
  lines.push(`  \u2502  Streak:   ${String(stats.current_streak + "d").padEnd(8)} Best:  ${String(stats.longest_streak + "d").padEnd(10)} Retries: ${trendStr(metrics.retry_rate + "%", trends.retry_rate)}`);
  lines.push("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
  lines.push("");

  // Top Tools with star ratings
  if (stats.top_tools.length > 0) {
    lines.push("  Top Tools:");
    for (const tool of stats.top_tools.slice(0, 6)) {
      const pct = stats.total_tool_uses > 0 ? ((tool.count / stats.total_tool_uses) * 100).toFixed(0) : 0;
      const stars = starRating("tool:" + tool.name, dynamicTracks);
      lines.push(`     ${tool.name.padEnd(16)} ${String(tool.count).padStart(6)} (${pct}%)  ${stars}`);
    }
    lines.push("");
  }

  // Next Badges (pending)
  if (badges.nextBadges && badges.nextBadges.length > 0) {
    lines.push("  Next Badges:");
    for (const b of badges.nextBadges.slice(0, 5)) {
      lines.push(`     ${b.name.padEnd(22)} ${bar(b.progress, 16)}`);
    }
    lines.push("");
  }

  // Badge summary
  lines.push(`  Badges: ${badges.earned.length}/${badges.total} earned    Pending: ${badges.total - badges.earned.length}`);
  if (newBadges.length > 0) {
    lines.push("");
    lines.push("  NEW BADGES:");
    for (const b of newBadges) {
      lines.push(`     ${b.icon || ""}  ${b.name} \u2014 ${b.description} [${b.tier}]`);
    }
  }
  lines.push("");

  // Activity heatmap
  const contribution = storage.getContributionData(4);
  if (contribution.some((d) => d.count > 0)) {
    lines.push("  Activity (last 28 days):");
    const maxC = Math.max(...contribution.map((d) => d.count), 1);
    const blocks = ["\u2591", "\u2592", "\u2593", "\u2588"];
    let heatmap = "     ";
    for (const day of contribution) {
      const intensity = Math.min(3, Math.floor((day.count / maxC) * 4));
      heatmap += blocks[intensity];
    }
    lines.push(heatmap);
    lines.push("");
  }

  lines.push("  orank.me \u2014 share your profile (coming soon)");
  lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push("");

  console.log(lines.join("\n"));
}
```

- [ ] **Step 4: Add cmdInsights function**

Add after the `cmdStats` function:

```js
function cmdInsights(storage) {
  const stats = storage.getStats();
  const sessions = storage.getSessions();
  const { metrics, trends, weekKey } = getCurrentMetrics(storage);
  const patterns = detectPatterns(sessions);
  const snapshots = storage.getWeeklySnapshots();
  const allWeeks = Object.keys(snapshots).sort();
  const currentIdx = allWeeks.indexOf(weekKey);
  const prevWeek = currentIdx > 0 ? snapshots[allWeeks[currentIdx - 1]] : null;

  // Determine week date range
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const lines = [];
  lines.push("");
  lines.push(`  orank \u2014 Weekly Insights (${fmtDate(weekStart)}\u2013${fmtDate(weekEnd)})`);
  lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push("");

  // Efficiency headline
  if (prevWeek) {
    const delta = metrics.composite - prevWeek.composite;
    const arrow = delta >= 0 ? "\u2191" : "\u2193";
    lines.push(`  Efficiency: ${metrics.grade} (${metrics.composite})  \u2190 was ${prevWeek.grade} (${prevWeek.composite}) last week  ${arrow} ${Math.abs(delta).toFixed(1)}%`);
  } else {
    lines.push(`  Efficiency: ${metrics.grade} (${metrics.composite})  (first week \u2014 no comparison yet)`);
  }
  lines.push("");

  // What improved
  if (prevWeek) {
    const improvements = [];
    const warnings = [];

    if (metrics.success_rate > prevWeek.success_rate) {
      improvements.push(`Success rate up ${(metrics.success_rate - prevWeek.success_rate).toFixed(1)}%`);
    } else if (metrics.success_rate < prevWeek.success_rate) {
      warnings.push(`Success rate down ${(prevWeek.success_rate - metrics.success_rate).toFixed(1)}%`);
    }

    if (metrics.throughput > prevWeek.throughput) {
      improvements.push(`Throughput up \u2014 ${metrics.throughput} tools/min avg vs ${prevWeek.throughput} last week`);
    } else if (metrics.throughput < prevWeek.throughput) {
      warnings.push(`Throughput down \u2014 ${metrics.throughput} tools/min avg vs ${prevWeek.throughput} last week`);
    }

    if (metrics.retry_rate < prevWeek.retry_rate) {
      improvements.push(`Retry rate improved ${(prevWeek.retry_rate - metrics.retry_rate).toFixed(1)}%`);
    } else if (metrics.retry_rate > prevWeek.retry_rate) {
      warnings.push(`Retry rate crept up ${(metrics.retry_rate - prevWeek.retry_rate).toFixed(1)}%`);
    }

    if (improvements.length > 0) {
      lines.push("  What improved:");
      for (const imp of improvements) {
        lines.push(`     \u2713 ${imp}`);
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("  Watch out:");
      for (const w of warnings) {
        lines.push(`     \u26A0 ${w}`);
      }
      lines.push("");
    }
  }

  // Workflow patterns
  if (patterns.length > 0) {
    lines.push("  Workflow patterns detected:");
    for (const p of patterns.slice(0, 5)) {
      lines.push(`     ${p.sequence.join(" \u2192 ").padEnd(28)} (${p.count} times \u2014 "${p.name}")`);
    }
    lines.push("");
  }

  // Slash commands
  const cmdCounts = stats.slash_command_counts || {};
  const cmds = Object.entries(cmdCounts).sort((a, b) => b[1] - a[1]);
  if (cmds.length > 0) {
    lines.push("  Slash commands this week:");
    lines.push("     " + cmds.slice(0, 6).map(([cmd, count]) => `/${cmd} (${count}x)`).join("  "));
    lines.push("");
  }

  // Milestone alerts (next badges)
  const engine = new BadgeEngine(storage);
  engine.evaluate();
  const badges = engine.getSummary();
  if (badges.nextBadges && badges.nextBadges.length > 0) {
    lines.push("  Milestone alert:");
    for (const b of badges.nextBadges.slice(0, 3)) {
      const needed = b.needed || "?";
      lines.push(`     \uD83D\uDD1C ${needed} more \u2192 "${b.name}" badge`);
    }
    lines.push("");
  }

  lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push("");

  console.log(lines.join("\n"));
}
```

- [ ] **Step 5: Add insights to the command router**

In the `main()` function's switch statement (around line 301), add after the `integrity` case:

```js
    case "insights":
      cmdInsights(storage);
      break;
```

- [ ] **Step 6: Verify syntax**

Run: `node -c scripts/cli.js`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add scripts/cli.js
git commit -m "feat: enhanced dashboard with efficiency, trends, insights command"
```

---

### Task 9: Update history-import.js for new event schema

**Files:**
- Modify: `scripts/history-import.js`

Update emitted events to use new short field names (`ts`/`sid`/`tool`).

- [ ] **Step 1: Update importAll() event emissions**

Replace the event-emitting section of `importAll()` (lines 177–218) with:

```js
        const startTime = session.startTime || new Date().toISOString();

        this.storage.appendEvent({
          type: "session_start",
          ts: startTime,
          sid: session.id,
          cwd: session.cwd,
          branch: session.branch,
          model: null,
          source: "import",
        });

        if (session.toolCounts && typeof session.toolCounts === "object") {
          for (const [toolName, count] of Object.entries(session.toolCounts)) {
            for (let i = 0; i < count; i++) {
              this.storage.appendEvent({
                type: "tool_use",
                ts: startTime,
                sid: session.id,
                tool: toolName,
                file_path: null,
              });
            }
          }
        }

        const turns = session.turns || 0;
        for (let i = 0; i < turns; i++) {
          this.storage.appendEvent({
            type: "turn_complete",
            ts: startTime,
            sid: session.id,
          });
        }

        this.storage.appendEvent({
          type: "session_end",
          ts: startTime,
          sid: session.id,
          reason: "import",
        });

        this.storage.markSessionImported(session.id);
        this.storage.addXP(50, "History import: session " + session.id);
```

- [ ] **Step 2: Verify syntax**

Run: `node -c scripts/history-import.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add scripts/history-import.js
git commit -m "feat: update history-import.js for new event schema"
```

---

### Task 10: Update integrity.js field names

**Files:**
- Modify: `scripts/integrity.js`

Mechanical find-and-replace: `timestamp` → `ts`, `tool_name` → `tool`, `session_id` → `sid`.

- [ ] **Step 1: Update field references**

In the `loadAllEvents()` function — no changes needed (it just parses JSON lines).

In `ANOMALY_RULES`, update all field references:

1. **impossible-speed rule** (around line 79): Change `event.timestamp.slice(0, 16)` to `event.ts.slice(0, 16)`

2. **session-spam rule** (around line 103): Change `event.timestamp.slice(0, 10)` to `event.ts.slice(0, 10)`

3. **xp-spike rule** (around line 127): Change `event.timestamp.slice(0, 10)` to `event.ts.slice(0, 10)`

4. **midnight-marathon rule** (around lines 151–153): Change `event.session_id` to `event.sid`, and `sessions[event.session_id]` to `sessions[event.sid]`. Change `event.timestamp` to `event.ts`. Change `start_ts` and `end_ts` references to use `event.ts`. Update the `for...of` destructuring: change `[sid, { start_ts, end_ts }]` — the `sid` variable name is fine since it's a local variable.

5. **monotone-tools rule** (around line 191): Change `toolEvents[i].tool_name` to `toolEvents[i].tool` and `toolEvents[0].tool_name` to `toolEvents[0].tool`. Also in the streak push: change `{ tool: currentTool, streak }` — `tool` is already the correct field name for the evidence object.

In `checkRateLimit()` (around line 230): Change `e.ts` references — actually these reference `e.ts` after the rename so: change `new Date(e.ts)` — wait, the current code uses `e.ts` but the existing code at line 232 uses `new Date(e.ts)`. Let me re-check. The current code uses `new Date(e.ts)` — no, it uses `new Date(e.timestamp)`. Change `e.timestamp` to `e.ts` in the `checkRateLimit()` function at lines 232 and 247.

- [ ] **Step 2: Verify syntax**

Run: `node -c scripts/integrity.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add scripts/integrity.js
git commit -m "refactor: update integrity.js field names for new event schema"
```

---

### Task 11: Update SKILL.md

**Files:**
- Modify: `skills/orank/SKILL.md`

Add `insights` to the available commands list.

- [ ] **Step 1: Add insights command**

After the line `- \`/orank integrity\` — Run anomaly check and trust score`, add:

```markdown
- `/orank insights` — Weekly deep-dive: efficiency breakdown, patterns, milestones
```

- [ ] **Step 2: Commit**

```bash
git add skills/orank/SKILL.md
git commit -m "docs: add insights command to SKILL.md"
```

---

### Task 12: Clean data and integration test

**Files:**
- No file changes — validation only

- [ ] **Step 1: Delete old data files**

```bash
rm -f ~/.claude/plugins/data/orank/events.jsonl ~/.claude/plugins/data/orank/cache.json ~/.claude/plugins/data/orank/.current-session
```

- [ ] **Step 2: Test tracker with piped stdin JSON**

Run:
```bash
echo '{"hook_event_name":"SessionStart","session_id":"int-test-1","cwd":"/tmp","model":"opus","source":"startup"}' | node scripts/tracker.js
echo '{"hook_event_name":"PostToolUse","session_id":"int-test-1","tool_name":"Read","tool_input":{"file_path":"/tmp/foo.js"}}' | node scripts/tracker.js
echo '{"hook_event_name":"PostToolUse","session_id":"int-test-1","tool_name":"Edit","tool_input":{"file_path":"/tmp/foo.js"}}' | node scripts/tracker.js
echo '{"hook_event_name":"PostToolUse","session_id":"int-test-1","tool_name":"Bash","tool_input":{"command":"npm test"}}' | node scripts/tracker.js
echo '{"hook_event_name":"UserPromptSubmit","session_id":"int-test-1","prompt":"/commit -m test"}' | node scripts/tracker.js
echo '{"hook_event_name":"Stop","session_id":"int-test-1"}' | node scripts/tracker.js
echo '{"hook_event_name":"SessionEnd","session_id":"int-test-1","reason":"prompt_input_exit"}' | node scripts/tracker.js
```

Then verify:
Run: `cat ~/.claude/plugins/data/orank/events.jsonl`
Expected: 7 JSON lines with types: session_start, tool_use (x3), slash_command, turn_complete, session_end. All using `ts`/`sid`/`tool` field names.

- [ ] **Step 3: Test stats dashboard**

Run: `node scripts/cli.js stats`
Expected: Dashboard output with efficiency score, grade, and stats. No errors.

- [ ] **Step 4: Test insights command**

Run: `node scripts/cli.js insights`
Expected: Weekly insights output with efficiency score (first week — no comparison). No errors.

- [ ] **Step 5: Test badges command**

Run: `node scripts/cli.js badges`
Expected: Badge list showing curated + dynamic badges. Dynamic badges for Read, Edit, Bash, and /commit should appear.

- [ ] **Step 6: Clean up test data**

```bash
rm -f ~/.claude/plugins/data/orank/events.jsonl ~/.claude/plugins/data/orank/cache.json
```

- [ ] **Step 7: Commit plan as done**

```bash
git add -f docs/superpowers/plans/2026-03-30-deep-metrics.md
git commit -m "docs: add deep metrics implementation plan"
```
