---
name: orank
description: View your Claude Code stats, badges, and ranking
argument-hint: "[stats|badges|privacy|import|export|pause|resume|purge|integrity]"
allowed-tools:
  - Bash
---

# /orank

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.js <command>` where command is the argument provided.

If no argument given, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.js stats`.

## Available commands

- `/orank` — Show full stats dashboard
- `/orank badges` — Show badge progress (earned, in progress, locked)
- `/orank import` — Import historical Claude Code data
- `/orank export` — Export all data as JSON
- `/orank privacy` — Show what's collected and data controls
- `/orank pause` — Stop tracking
- `/orank resume` — Resume tracking
- `/orank purge --confirm` — Delete all orank data permanently
- `/orank integrity` — Run anomaly check and trust score
- `/orank insights` — Weekly deep-dive: efficiency breakdown, patterns, milestones

## First run

If the user hasn't used orank before, suggest running `/orank import` first to pull in historical data.
