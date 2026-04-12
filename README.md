# ⚡ orank — your AI score

**Gamification, badges, and ranking for Claude Code users.**

orank automatically tracks your Claude Code usage and turns it into XP, badges, streaks, and a shareable developer profile. Think Duolingo meets GitHub Achievements for the Claude ecosystem.

## Install

Inside Claude Code, run these two slash commands:

```
/plugin marketplace add sedhuait/orank
/plugin install orank@orank
```

Or open the plugin manager with `/plugin`, go to **Discover**, find **orank**, and click Install.

That's it. orank starts tracking automatically via Claude Code hooks.

## Usage

```bash
/orank              # Show your stats, XP, tier, and badges
/orank badges       # Detailed badge progress
/orank import       # Import historical Claude Code data
/orank sync         # Sync to orank.me (coming soon)
/orank export       # Export data as JSON
```

## What Gets Tracked

orank captures data automatically — zero configuration.

**Core events (from Claude Code hooks):**

| Data Point | How | Privacy |
| --- | --- | --- |
| Session start/end | SessionStart/End hooks | Local only |
| Tool usage | PostToolUse hook | Local only |
| Tool failures | PostToolUseFailure hook | Local only |
| Conversation turns | Stop hook | Local only |
| Historical sessions | \~/.claude/history.jsonl | Read-only |

**Rich context (inferred from tool inputs — what you built, not just how much):**

| Data Point | Source | Example |
| --- | --- | --- |
| Languages edited | File extensions on Edit/Write/Read | `typescript: 423`, `python: 89` |
| Frameworks detected | Path patterns (e.g. `/components/`, `/app/`) | `react`, `nextjs`, `django`, `sveltekit` |
| Project stack | Marker files at session start | `package.json → javascript`, `Cargo.toml → rust` |
| Bash categories | Command prefix (`npm`, `cargo`, `docker`, …) | `node`, `rust`, `docker`, `git`, `testing` |
| Edit size | `chars_added` / `chars_removed` per edit | Lines-of-code impact per session |
| Repo attribution | `git remote get-url origin` at session start | `sedhuait/orank: 5 sessions, 200 tools` |
| Model used | Model ID per session | `opus-4`, `sonnet-4` |
| Platform | `os.platform()` | `darwin`, `linux` |
| Daily language mix | Per-day language breakdown | `2026-04-12: { typescript: 10, python: 3 }` |

All of this is computed locally on your machine from data Claude Code already sends to hooks. Nothing leaves your machine unless you explicitly enable sync. File *contents* are never stored — only file extensions, path patterns, and character counts.

## Gamification

### Tiers

🥉 Bronze → 🥈 Silver (2K XP) → 🥇 Gold (5K XP) → 🏆 Platinum (10K XP) → 💎 Diamond (20K XP)

### Badges

25+ badges across categories: Usage Milestones, Tool Mastery, Streaks, Efficiency, Time Invested, and XP Milestones.

### XP

Earn XP from daily sessions (+50), tool milestones (+200), streaks (+500-5000), and badge unlocks (+100-2500).

## Architecture

```
orank/
├── .claude-plugin/plugin.json   # Plugin manifest
├── hooks/hooks.json             # Auto-capture config
├── scripts/
│   ├── cli.js                   # Main CLI
│   ├── tracker.js               # Hook entry point
│   ├── storage.js               # JSONL + cache storage
│   ├── badges.js                # Achievement engine
│   ├── integrity.js             # Anti-gaming checks
│   └── history-import.js        # History import
├── skills/orank/SKILL.md        # /orank slash command
└── package.json
```

## Privacy

- All data stored locally in `~/.claude/plugins/data/orank/`
- No data sent anywhere without explicit opt-in
- Remote sync to orank.me is optional and requires API key
- You own your data — export anytime with `/orank export`

## Coming Soon

- 🤖 Support for more AI coding tools — Codex, Gemini CLI, Cursor, Aider, Windsurf, Copilot CLI
- 🌐 orank.me web dashboard with shareable profiles
- 🏆 Global leaderboard (cross-tool — one score across every AI you use)
- 🔗 Embeddable SVG badges for GitHub READMEs
- 📊 Token usage tracking (via Anthropic API)
- 👥 Team dashboards

## License

MIT — Built by [Sedhu](https://Sedhu.me)