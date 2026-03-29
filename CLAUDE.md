# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is orank?

orank is a Claude Code plugin that gamifies usage -- tracking sessions, tool use, streaks, and conversation turns, then awarding XP, badges, and tier rankings. It's distributed as a Claude Code plugin and uses hooks for automatic data capture. All data is local (JSONL + JSON cache); optional remote sync to orank.me is planned but not yet implemented.

## Commands

```bash
npm run stats          # Show stats dashboard
npm run badges         # Show badge progress
npm run import         # Import historical Claude Code data
npm run export         # Export data as JSON
npm run privacy        # Show privacy info
npm run integrity      # Run anomaly check and trust score
```

There are no tests, no linter, and no build step. The project is plain Node.js (CommonJS, zero npm dependencies). Requires Node >= 18.

## Architecture

**Plugin system**: `.claude-plugin/plugin.json` is the plugin manifest. `hooks/hooks.json` defines Claude Code lifecycle hooks (SessionStart, PostToolUse, PostToolUseFailure, Stop, SessionEnd) that call `tracker.js`. `skills/orank/SKILL.md` defines the `/orank` slash command. `install.sh` creates a symlink from `~/.claude/plugins/orank` to the repo root.

**Two entry points** -- hooks call `tracker.js` (fast, write-only), users interact via `cli.js` (reads, displays, manages data):

```
Hook events --> tracker.js --> storage.appendEvent() --> events.jsonl
/orank      --> cli.js     --> storage.ensureFreshCache() --> cache.json --> display
```

**Core modules** (all in `scripts/`):
- `cli.js` -- User-facing CLI. Subcommands: `stats` (default), `badges`, `import`, `export`, `privacy`, `pause`, `resume`, `purge --confirm`, `integrity`. Deferred: `sync`, `login`, `logout`, `whoami`.
- `tracker.js` -- Hook entry point. Called on every Claude Code event. Must be fast. Handles: `session-start`, `session-end`, `tool-use`, `tool-failure`, `turn-complete`. Checks pause state, appends events, manages `.current-session` file.
- `storage.js` -- JSONL + cache storage layer. Append-only event log (`events.jsonl`) with derived cache (`cache.json`) rebuilt incrementally from last known byte offset. No external dependencies (no SQLite).
- `badges.js` -- Achievement engine. `BADGE_DEFINITIONS` array with check functions evaluated against stats. `BadgeEngine.evaluate()` awards XP for newly earned badges. Tier system: Bronze/Silver(2K)/Gold(5K)/Platinum(10K)/Diamond(20K).
- `history-import.js` -- Imports retroactive data from `~/.claude/history.jsonl` and `~/.claude/projects/*/sessions-index.json`.
- `integrity.js` -- Anti-gaming: anomaly detection rules (impossible speed, session spam, XP spikes, midnight marathons, monotone tools), rate limiting. Produces trust score (100 minus 15 per flag).

**Dashboard prototypes**: `dashboard.jsx` and `dashboard-v1.jsx` are React component mockups for the orank.me web dashboard (Recharts). Not part of the plugin runtime.

## Key data flows

1. **Hook event capture**: Claude Code fires hook -> `hooks.json` routes to `tracker.js <event>` -> pause check -> append to `events.jsonl` via `storage.js`
2. **Stats display**: `/orank` skill -> `cli.js stats` -> `storage.ensureFreshCache()` rebuilds cache from new events since last offset -> renders ASCII dashboard
3. **Badge evaluation**: On stats display, `BadgeEngine.evaluate()` checks all badge definitions against current stats, awards XP and records newly earned badges as events

## Storage model

All data lives in `~/.claude/plugins/data/orank/` (or `$CLAUDE_PLUGIN_DATA`):
- `events.jsonl` -- Append-only event log (source of truth). Event types: `session_start`, `session_end`, `tool_use`, `tool_failure`, `turn_complete`, `xp_award`, `badge_earned`, `history_import`.
- `cache.json` -- Derived stats rebuilt incrementally from events. Tracks `events_offset` (byte position) to only process new events. Contains: totals, tool counts, daily sessions, hourly activity, streaks, badges earned, XP log.
- `.paused` -- Sentinel file; when present, `tracker.js` exits silently.
- `.current-session` -- Contains active session ID.
- `sync-cursor.json` -- Last sync byte offset (for future remote sync).

## Environment variables used by hooks

- `CLAUDE_SESSION_ID` -- Current session identifier
- `CLAUDE_TOOL_NAME` -- Name of the tool that was used
- `CLAUDE_TOOL_INPUT_FILE_PATH` -- Path to tool input file
- `CLAUDE_PLUGIN_ROOT` -- Plugin installation directory
- `CLAUDE_PLUGIN_DATA` -- Plugin data directory (fallback: `~/.claude/plugins/data/orank`)
- `CLAUDE_PROJECT_DIR` -- Current project directory
