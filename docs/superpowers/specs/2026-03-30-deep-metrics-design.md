# orank Deep Metrics & Dynamic Badges — Design Spec

**Date:** 2026-03-30
**Scope:** Deeper efficiency metrics, dynamic badge system, enhanced dashboard, insights command
**Goal:** Transform orank from an activity counter into a value demonstrator — showing not just how much you use Claude Code, but how well you use it and how it's helping you improve.

---

## 1. Motivation

The current orank dashboard shows surface-level stats: session counts, tool counts, streaks. Users see "how much" but not "how well" or "how it's evolving." This redesign adds:

- **Efficiency scoring** — multi-dimensional measurement of how productively you use Claude Code
- **Dynamic badges** — auto-discovered badge tracks for every tool and slash command, with adaptive thresholds
- **Trend tracking** — week-over-week comparisons showing improvement or regression
- **Workflow pattern detection** — recognizing recurring tool sequences as named workflows
- **Three-layer display** — dashboard trends at a glance, `/orank insights` for deep narrative, passive weekly summaries

---

## 2. Constraints

- **Zero npm dependencies.** Still pure Node.js stdlib.
- **Privacy preserved.** `UserPromptSubmit` hook only extracts slash command names via regex. Prompt text is never stored.
- **Clean slate.** No backward compatibility with v0.1.0 event schema — existing `events.jsonl` will be deleted and re-imported.
- **Node 18+.** Minimum version unchanged.

---

## 3. Hook Expansion

Expand from 5 hooks to 10. The tracker is rewritten to read **JSON from stdin** (the correct Claude Code hook API), replacing the unreliable `$CLAUDE_TOOL_NAME` environment variable approach.

| Hook | What it gives us | Status |
|------|-----------------|--------|
| `SessionStart` | Session ID (native), model, source (startup/resume/clear), cwd, branch | Enhanced |
| `SessionEnd` | Reason for ending | Enhanced |
| `PostToolUse` | Tool name, tool input (file paths, commands), tool_use_id | Enhanced (stdin JSON) |
| `PostToolUseFailure` | Tool name, error details | Enhanced (stdin JSON) |
| `Stop` | Turn complete signal | Existing |
| `UserPromptSubmit` | Slash command detection only (regex `/^\s*\/(\S+)/`) | **New** |
| `PreToolUse` | Skill tool invocations (reveals which slash command triggered tools) | **New** |
| `SubagentStart` | Agent type, agent ID | **New** |
| `SubagentStop` | Agent type, agent ID | **New** |
| `StopFailure` | Error type (rate_limit, billing_error, server_error, etc.) | **New** |

### How hooks receive data

All hooks receive JSON on stdin with common fields:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "hook_event_name": "PostToolUse",
  "permission_mode": "default"
}
```

Event-specific fields:
- `PreToolUse` / `PostToolUse` / `PostToolUseFailure`: adds `tool_name`, `tool_input`, `tool_use_id`
- `UserPromptSubmit`: adds `prompt` (we only regex-match, never store)
- `SubagentStart` / `SubagentStop`: adds `agent_type`, `agent_id`
- `StopFailure`: adds error type info
- `SessionStart`: adds `source`, `model`
- `SessionEnd`: adds `reason`

### Privacy rule for UserPromptSubmit

The hook receives the full prompt text. The tracker:
1. Runs `prompt.match(/^\s*\/(\S+)/)` to extract a slash command name
2. If matched, emits a `slash_command` event with just the command name
3. The prompt text is **never written to disk**

---

## 4. Event Schema

All events in `events.jsonl` share short common field names (saves bytes at scale).

### Common fields (every event)

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO 8601 timestamp |
| `type` | string | Event type |
| `sid` | string | Claude Code's native session ID |

### Event types

| Type | Extra Fields | Source Hook |
|------|-------------|-------------|
| `session_start` | `model`, `source`, `cwd`, `branch` | SessionStart |
| `session_end` | `reason` | SessionEnd |
| `tool_use` | `tool`, `file_path` | PostToolUse |
| `tool_failure` | `tool`, `error` | PostToolUseFailure |
| `turn_complete` | (none) | Stop |
| `turn_error` | `error_type` | StopFailure |
| `slash_command` | `command` | UserPromptSubmit |
| `subagent_start` | `agent_type`, `agent_id` | SubagentStart |
| `subagent_stop` | `agent_type`, `agent_id` | SubagentStop |
| `xp_award` | `amount`, `reason` | Internal (badge engine) |
| `badge_earned` | `badge_id`, `badge_name`, `badge_tier` | Internal (badge engine) |

---

## 5. Efficiency Metrics Engine

A new module `metrics.js` computes five efficiency dimensions from raw events.

### Five dimensions

| Metric | Formula | What it tells you |
|--------|---------|-------------------|
| **Success Rate** | `(tool_use - tool_failure) / tool_use` per time window | Are you/Claude getting it right the first time? |
| **Throughput** | Tools used per active session minute | Are sessions productive or idle? |
| **Breadth** | Unique tools used / total distinct tools ever seen | Are you leveraging the full toolkit? |
| **Retry Rate** | Consecutive same-tool calls within 30s / total tool calls | How often is a tool re-run (likely a failed attempt)? |
| **Workflow Score** | Count of detected multi-tool patterns / total tool calls | Are you doing structured work or random one-offs? |

### Composite Efficiency Score

Weighted average of all five dimensions, normalized to 0–100:

- Success Rate: 25% weight
- Throughput: 20% weight
- Breadth: 15% weight
- Retry Rate (inverted): 20% weight
- Workflow Score: 20% weight

Letter grade mapping: A+ (95–100), A (90–94), A- (85–89), B+ (80–84), B (75–79), B- (70–74), C+ (65–69), C (60–64), C- (55–59), D (40–54), F (0–39).

### Trend computation

Each metric is computed for the current week and the previous week. The delta is stored in the cache as:

```json
{
  "weekly_snapshots": {
    "2026-W13": {
      "success_rate": 96.2,
      "throughput": 8.2,
      "breadth": 0.78,
      "retry_rate": 3.1,
      "workflow_score": 62,
      "composite": 82,
      "grade": "A"
    }
  }
}
```

Arrows (↑↓) on the dashboard are derived by comparing the current week's snapshot to the previous week's.

### Time windows

- **Session-level** — per individual session (stored per session in cache)
- **Daily** — rolling 24h (computed on demand)
- **Weekly** — rolling 7 days (primary display unit, snapshot stored in cache)

---

## 6. Workflow Pattern Detection

A new module `patterns.js` detects recurring multi-tool sequences.

### How it works

1. For each session, extract the ordered list of tool names
2. Slide a window of 2–4 tools and count each unique sequence
3. Sequences occurring 5+ times across all sessions become "named patterns"

### Built-in pattern names

| Sequence | Name |
|----------|------|
| Read → Edit → Bash | "Code-Test" |
| Grep → Read → Edit | "Find-and-Fix" |
| Agent → Read → Edit | "Delegate-then-Refine" |
| Read → Edit → Read | "Iterative Edit" |
| Grep → Read | "Search-and-Review" |
| Bash → Read → Edit | "Debug Cycle" |

Sequences not matching a built-in name get auto-generated names: "Tool1 → Tool2 → Tool3 flow".

### Workflow Score

`workflow_score = (tool_uses_within_patterns / total_tool_uses) * 100`

Higher score means more structured, pattern-driven work.

---

## 7. Dynamic Badge System

Hybrid system: curated milestone badges + auto-discovered tool/command badges.

### A) Curated badges (expanded from current 25)

All existing 25 badges remain. New curated badges added:

| Badge | Trigger | Tier |
|-------|---------|------|
| Efficiency Expert | Maintain A+ efficiency score for 7 days | Gold |
| Pattern Builder | Develop 5 recognized workflow patterns | Silver |
| Parallel Thinker | Use 10+ subagent sessions | Silver |
| Zero Failures | Complete a 50+ tool session with 0 failures | Gold |
| Command Explorer | Use 20 different slash commands | Silver |
| Trend Setter | Improve efficiency score 4 weeks in a row | Platinum |

### B) Dynamic tool/command badges (auto-discovered)

When orank sees a tool or slash command for the first time, it creates a badge track with 5 tiers.

**Adaptive tier thresholds** based on the tool's usage share:

| Usage Share | Bronze | Silver | Gold | Platinum | Diamond |
|-------------|--------|--------|------|----------|---------|
| >10% (common: Edit, Read, Bash) | 10 | 100 | 500 | 1,000 | 5,000 |
| 1–10% (moderate: Grep, Glob) | 5 | 50 | 200 | 500 | 2,000 |
| <1% (rare: NotebookEdit, MCP tools) | 1 | 10 | 50 | 100 | 500 |

Thresholds recalculate on each cache rebuild. Already-earned badges are never revoked.

**Badge naming convention:**
- Tools: `{Tool} Novice` (Bronze), `{Tool} Adept` (Silver), `{Tool} Master` (Gold), `{Tool} Virtuoso` (Platinum), `{Tool} Legend` (Diamond)
- Slash commands: `/{command} Novice`, `/{command} Adept`, etc.

### Badge storage in cache

```json
{
  "dynamic_badge_tracks": {
    "tool:Edit": { "count": 842, "tier": "gold", "thresholds": [10, 100, 500, 1000, 5000] },
    "tool:Bash": { "count": 234, "tier": "silver", "thresholds": [10, 100, 500, 1000, 5000] },
    "cmd:commit": { "count": 14, "tier": "silver", "thresholds": [5, 10, 50, 100, 500] }
  }
}
```

---

## 8. Dashboard & Display Layers

Three layers of information depth.

### Layer 1: `/orank` (main dashboard — enhanced)

```
  orank — your open AI score
  ─────────────────────────────────────────────────

  🥇  Gold    5.2K XP    Today: +180 XP    Efficiency: A (82) ↑

  ┌─────────────────────────────────────────────────┐
  │  Sessions: 142  ↑12%   Tools: 4.8K  ↑8%    Success: 96.2%  ↑
  │  Turns:    1.2K ↑5%    Time:  48h   ↑      Breadth: 14/18
  │  Streak:   12d         Best:  23d           Retries: 3.1%  ↓
  └─────────────────────────────────────────────────┘

  Top Tools:
     Edit             1,842 (38%)  ★★★★★
     Read               921 (19%)  ★★★★
     Bash               687 (14%)  ★★★

  Next Badges:
     Edit Adept          ████████████░░░░ 78%
     /commit Silver      █████████████░░░ 88%
     Streak Master       ██████░░░░░░░░░░ 40%

  Badges: 18/43 earned    Pending: 25

  Activity (last 28 days):
     ░▒▓█▓▒░░▒▓██▓▒▒▓███▓▒▒▓██▓▒

  orank.me — share your profile (coming soon)
  ─────────────────────────────────────────────────
```

**New vs current:** Efficiency score + letter grade, ↑↓ trend arrows, Breadth and Retries metrics, "Next Badges" with progress bars, star ratings on top tools (reflects dynamic badge tier).

### Layer 2: `/orank insights` (new command)

```
  orank — Weekly Insights (Mar 24–30)
  ─────────────────────────────────────────────────

  Efficiency: A (82)  ← was B+ (76) last week  ↑ 7.9%

  What improved:
     ✓ Success rate up 2.4% — fewer Bash failures this week
     ✓ Throughput up 15% — 8.2 tools/min avg vs 7.1 last week
     ✓ New tool discovered: Agent (used 12 times)

  Watch out:
     ⚠ Retry rate crept up 0.8% — mostly Edit retries on Tues
     ⚠ No sessions on Saturday — streak at risk

  Workflow patterns detected:
     Read → Edit → Bash    (42 times — "Code-Test" cycle)
     Grep → Read → Edit    (18 times — "Find-and-Fix")
     Agent → Read → Edit   (8 times  — "Delegate-then-Refine")

  Slash commands this week:
     /commit (14x)  /orank (8x)  /review-pr (3x)

  Milestone alert:
     🔜 3 more /commit uses → "/commit Silver" badge
     🔜 2 more sessions → 150 sessions milestone
  ─────────────────────────────────────────────────
```

### Layer 3: Passive weekly summary

On the first `/orank` call of a new week, if there's a full prior week of data, a 2-line summary is prepended to the dashboard:

```
  📊 Last week: Efficiency B+ → A (↑7.9%), 3 new badges, 12h active
```

Not a separate command — appears automatically, then isn't shown again until next week.

---

## 9. Cache Schema Changes

New fields added to `cache.json`:

```json
{
  "total_xp": 5200,
  "tier": "Gold",
  "total_sessions": 142,
  "total_tools": 4800,
  "total_tool_failures": 182,
  "total_turns": 1200,
  "total_seconds": 172800,
  "current_streak": 12,
  "longest_streak": 23,
  "last_active_date": "2026-03-30",
  "tool_counts": {},
  "daily_sessions": {},
  "hourly_activity": [],
  "badges_earned": [],
  "xp_log": [],
  "events_offset": 0,
  "last_rebuilt": null,

  "slash_command_counts": {
    "commit": 14,
    "orank": 8,
    "review-pr": 3
  },
  "subagent_counts": {
    "Explore": 5,
    "general-purpose": 12
  },
  "turn_errors": {
    "rate_limit": 2,
    "server_error": 1
  },
  "tool_sequences": [],
  "weekly_snapshots": {},
  "dynamic_badge_tracks": {},
  "last_weekly_summary_shown": null,
  "session_metrics": {}
}
```

---

## 10. Module Structure

### New files

| File | Responsibility |
|------|---------------|
| `scripts/metrics.js` | Computes 5 efficiency dimensions + composite score + trends. Pure functions. |
| `scripts/patterns.js` | Detects workflow patterns from tool sequences. Returns named patterns with counts. |
| `scripts/dynamic-badges.js` | Auto-discovers tools/commands, computes adaptive thresholds, generates badge definitions. |

### Modified files

| File | Changes |
|------|---------|
| `scripts/tracker.js` | Full rewrite — reads stdin JSON, handles 10 hook events |
| `scripts/storage.js` | New event types in `_processEvent()`, new cache fields, drop old schema compat |
| `scripts/badges.js` | Imports from `dynamic-badges.js`, merges curated + dynamic badges in `evaluate()` |
| `scripts/cli.js` | New `insights` command, enhanced dashboard, weekly summary, pending badges display |
| `scripts/history-import.js` | Emit new event schema field names (`ts`/`sid`/`tool`) |
| `hooks/hooks.json` | Add 5 new hook entries |
| `skills/orank/SKILL.md` | Add `insights` to available commands |

### Unchanged files

| File | Reason |
|------|--------|
| `install.sh` | No changes needed |
| `.claude-plugin/plugin.json` | No changes needed |

**Note:** `scripts/integrity.js` will need field name updates (`timestamp` → `ts`, `tool_name` → `tool`, `session_id` → `sid`) to match the new event schema. This is a mechanical find-and-replace, not a logic change.

---

## 11. CLI Commands (updated)

| Command | Description |
|---------|-------------|
| `/orank` | Enhanced stats dashboard with efficiency score, trends, pending badges |
| `/orank badges` | All badges — curated + dynamic, earned + in-progress + locked |
| `/orank insights` | **New.** Weekly deep-dive: efficiency breakdown, improvements, warnings, patterns, milestones |
| `/orank import` | Import Claude Code history (emits new schema) |
| `/orank export` | Dump all data as JSON |
| `/orank privacy` | What's collected, what's not, storage info |
| `/orank pause` | Stop tracking |
| `/orank resume` | Resume tracking |
| `/orank purge --confirm` | Delete all data |
| `/orank integrity` | Anomaly check + trust score |

---

## 12. What's NOT in scope

- ASCII art mascot (parked for later)
- Web dashboard backend (orank.me)
- Remote sync
- Transcript parsing (privacy violation)
- Device auth / leaderboard API
