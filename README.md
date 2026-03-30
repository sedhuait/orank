# ⚡ orank — your open AI score

**Gamification, badges, and ranking for Claude Code users.**

orank automatically tracks your Claude Code usage and turns it into XP, badges, streaks, and a shareable developer profile. Think Duolingo meets GitHub Achievements for the Claude ecosystem.

## Install

```bash
claude plugin install github:sedhuait/orank
```

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

orank captures data automatically — zero configuration:

| Data Point | How | Privacy |
| --- | --- | --- |
| Session start/end | SessionStart/End hooks | Local only |
| Tool usage | PostToolUse hook | Local only |
| Tool failures | PostToolUseFailure hook | Local only |
| Conversation turns | Stop hook | Local only |
| Historical sessions | \~/.claude/history.jsonl | Read-only |

All data is stored locally in JSONL. Nothing leaves your machine unless you enable sync.

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

- 🌐 orank.me web dashboard with shareable profiles
- 🏆 Global leaderboard
- 🔗 Embeddable SVG badges for GitHub READMEs
- 📊 Token usage tracking (via Anthropic API)
- 👥 Team dashboards

## License

MIT — Built by [Sedhu](https://orank.me)