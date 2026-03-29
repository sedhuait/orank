#!/usr/bin/env node
"use strict";

/**
 * orank CLI — main entry point for /orank commands
 *
 * Usage:
 *   node cli.js [command]
 *
 * Commands:
 *   (default)   — Show stats dashboard
 *   badges      — Show badge progress
 *   import      — Import Claude Code history
 *   export      — Export all data as JSON
 *   privacy     — Show privacy info
 *   pause       — Pause tracking
 *   resume      — Resume tracking
 *   purge       — Delete all data (requires --confirm)
 *   integrity   — Run anomaly check
 */

const { Storage } = require("./storage");
const { BadgeEngine, getTier, TIERS } = require("./badges");
const { HistoryImporter } = require("./history-import");
const {
  runIntegrityReport,
  formatIntegrityReport,
  loadAllEvents,
} = require("./integrity");

// ── Formatting Helpers ──────────────────────────────────────────────────────

function fmt(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function bar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${Math.round(pct)}%`;
}

// ── Commands ────────────────────────────────────────────────────────────────

function cmdStats(storage) {
  const engine = new BadgeEngine(storage);
  const newBadges = engine.evaluate();
  const stats = storage.getStats();
  const tier = getTier(stats.total_xp);
  const badges = engine.getSummary();
  const todayXP = storage.getTodayXP();

  const lines = [];
  lines.push("");
  lines.push("  orank — your open AI score");
  lines.push("  ─────────────────────────────────────────────────");
  lines.push("");

  // Tier & XP
  lines.push(`  ${tier.icon}  ${tier.name}    ${fmt(stats.total_xp)} XP    Today: +${fmt(todayXP)} XP`);
  if (tier.nextTier) {
    lines.push(`  → ${tier.nextTier}: ${bar(parseFloat(tier.progress))}  (${fmt(tier.nextTierXP - stats.total_xp)} to go)`);
  } else {
    lines.push("  Maximum tier reached!");
  }
  lines.push("");

  // Key Stats
  lines.push("  ┌─────────────────────────────────────────────────┐");
  lines.push(`  │  Sessions: ${String(stats.total_sessions).padEnd(8)} Tools: ${String(fmt(stats.total_tool_uses)).padEnd(10)} Success: ${stats.success_rate}%`);
  lines.push(`  │  Turns:    ${String(fmt(stats.total_turns)).padEnd(8)} Time:  ${String(formatDuration(stats.total_seconds)).padEnd(10)} Types:   ${stats.unique_tools}`);
  lines.push(`  │  Streak:   ${String(stats.current_streak + "d").padEnd(8)} Best:  ${String(stats.longest_streak + "d").padEnd(10)}`);
  lines.push("  └─────────────────────────────────────────────────┘");
  lines.push("");

  // Top Tools
  if (stats.top_tools.length > 0) {
    lines.push("  Top Tools:");
    for (const tool of stats.top_tools.slice(0, 6)) {
      const pct = stats.total_tool_uses > 0 ? ((tool.count / stats.total_tool_uses) * 100).toFixed(0) : 0;
      lines.push(`     ${tool.name.padEnd(16)} ${String(tool.count).padStart(6)} (${pct}%)`);
    }
    lines.push("");
  }

  // Badges
  lines.push(`  Badges: ${badges.earned.length}/${badges.total}`);
  if (badges.earned.length > 0) {
    const recent = badges.earned.slice(-5);
    lines.push(`  Earned: ${recent.map((b) => b.name).join(" · ")}`);
  }
  if (badges.inProgress.length > 0) {
    const top = badges.inProgress.sort((a, b) => b.progress - a.progress).slice(0, 3);
    lines.push(`  Next:   ${top.map((b) => `${b.name} (${Math.round(b.progress)}%)`).join(" · ")}`);
  }
  lines.push("");

  // New badges
  if (newBadges.length > 0) {
    lines.push("  NEW BADGES:");
    for (const b of newBadges) {
      lines.push(`     ${b.name} — ${b.description} [${b.tier}]`);
    }
    lines.push("");
  }

  // Activity heatmap (last 28 days)
  const contribution = storage.getContributionData(4);
  if (contribution.some((d) => d.count > 0)) {
    lines.push("  Activity (last 28 days):");
    const maxC = Math.max(...contribution.map((d) => d.count), 1);
    const blocks = ["░", "▒", "▓", "█"];
    let heatmap = "     ";
    for (const day of contribution) {
      const intensity = Math.min(3, Math.floor((day.count / maxC) * 4));
      heatmap += blocks[intensity];
    }
    lines.push(heatmap);
    lines.push("");
  }

  lines.push("  orank.me — share your profile (coming soon)");
  lines.push("  ─────────────────────────────────────────────────");
  lines.push("");

  console.log(lines.join("\n"));
}

function cmdBadges(storage) {
  const engine = new BadgeEngine(storage);
  engine.evaluate();
  const badges = engine.getSummary();

  console.log("\n  orank Badges\n");

  if (badges.earned.length > 0) {
    console.log(`  Earned (${badges.earned.length}):`);
    for (const b of badges.earned) {
      console.log(`     ${b.icon}  ${b.name.padEnd(22)} [${b.tier}]  ${b.description}`);
    }
    console.log("");
  }

  if (badges.inProgress.length > 0) {
    console.log(`  In Progress (${badges.inProgress.length}):`);
    for (const b of badges.inProgress.sort((a, b) => b.progress - a.progress)) {
      console.log(`     ${b.icon}  ${b.name.padEnd(22)} [${b.tier}]  ${bar(b.progress, 15)}  ${b.description}`);
    }
    console.log("");
  }

  if (badges.locked.length > 0) {
    console.log(`  Locked (${badges.locked.length}):`);
    for (const b of badges.locked) {
      console.log(`     ${b.icon}  ${b.name.padEnd(22)} [${b.tier}]  ${b.description}`);
    }
  }

  console.log(`\n  Total: ${badges.earned.length}/${badges.total} earned\n`);
}

function cmdImport(storage) {
  const importer = new HistoryImporter(storage);

  console.log("\n  orank — Importing Claude Code History\n");

  const preview = importer.preview();
  console.log(`  Found: ${preview.totalFound} sessions`);
  console.log(`  Already imported: ${preview.alreadyImported}`);
  console.log(`  To import: ${preview.toImport}`);

  if (preview.toImport === 0) {
    console.log("\n  Nothing new to import.\n");
    return;
  }

  console.log("\n  Importing...");
  const result = importer.importAll();
  console.log(`  Imported: ${result.imported} sessions (+${result.imported * 50} XP)`);

  // Evaluate badges after import
  const engine = new BadgeEngine(storage);
  const newBadges = engine.evaluate();
  if (newBadges.length > 0) {
    console.log(`\n  Badges unlocked:`);
    for (const b of newBadges) {
      console.log(`     ${b.icon}  ${b.name} — ${b.description}`);
    }
  }

  const tier = getTier(storage.getTotalXP());
  console.log(`\n  ${tier.icon} You're now ${tier.name} tier with ${fmt(storage.getTotalXP())} XP\n`);
}

function cmdExport(storage) {
  const data = storage.exportAll();
  console.log(JSON.stringify(data, null, 2));
}

function cmdPrivacy(storage) {
  const stats = storage.getStats();
  const dataDir = storage.getDataDir();
  const dataSize = storage.getDataSize();
  const isPaused = storage.isPaused();

  const lines = [];
  lines.push("\n  orank — Privacy & Data\n");

  // Status
  lines.push(isPaused ? "  [PAUSED] Tracking is paused" : "  [ACTIVE] Tracking is active");
  lines.push("  All data stays on your machine. Sync is not yet available.\n");

  // What we collect
  lines.push("  What orank collects:");
  lines.push("     Session timestamps (start/end)");
  lines.push("     Tool names and outcomes (success/failure)");
  lines.push("     Conversation turn counts");
  lines.push("     Working directory path");
  lines.push("     Git branch name\n");

  // What we never collect
  lines.push("  What orank NEVER collects:");
  lines.push("     Your prompts or messages");
  lines.push("     Claude's responses");
  lines.push("     File contents or source code");
  lines.push("     API keys or credentials");
  lines.push("     Personal information\n");

  // Storage
  lines.push("  Storage:");
  lines.push(`     Location:  ${dataDir}`);
  lines.push(`     Size:      ${(dataSize / 1024).toFixed(1)} KB`);
  lines.push(`     Sessions:  ${stats.total_sessions}`);
  lines.push(`     Events:    ${stats.total_tool_uses + stats.total_turns + stats.total_sessions}`);
  lines.push(`     Network:   Offline only\n`);

  // Commands
  lines.push("  Data controls:");
  lines.push("     /orank export   — full JSON dump");
  lines.push("     /orank pause    — stop recording");
  lines.push("     /orank resume   — start again");
  lines.push("     /orank purge    — delete everything\n");

  console.log(lines.join("\n"));
}

function cmdPause(storage) {
  if (storage.isPaused()) {
    console.log("\n  Already paused.\n");
    return;
  }
  storage.pause();
  console.log("\n  Tracking paused. Run /orank resume to start again.\n");
}

function cmdResume(storage) {
  if (!storage.isPaused()) {
    console.log("\n  Tracking is already active.\n");
    return;
  }
  storage.resume();
  console.log("\n  Tracking resumed.\n");
}

function cmdPurge(storage, args) {
  if (!args.includes("--confirm")) {
    console.log("\n  This will permanently delete all orank data.");
    console.log("  Run with --confirm to proceed.\n");
    return;
  }
  storage.purge();
  console.log("\n  All data deleted.\n");
}

function cmdIntegrity() {
  const events = loadAllEvents();
  if (events.length === 0) {
    console.log("\n  No events to analyze.\n");
    return;
  }
  const report = runIntegrityReport(events);
  console.log(formatIntegrityReport(report));
}

// ── Router ──────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "stats";
  const storage = new Storage();

  switch (command) {
    case "stats":
      cmdStats(storage);
      break;
    case "badges":
      cmdBadges(storage);
      break;
    case "import":
      cmdImport(storage);
      break;
    case "export":
      cmdExport(storage);
      break;
    case "privacy":
      cmdPrivacy(storage);
      break;
    case "pause":
      cmdPause(storage);
      break;
    case "resume":
      cmdResume(storage);
      break;
    case "purge":
      cmdPurge(storage, args);
      break;
    case "integrity":
      cmdIntegrity();
      break;
    // Deferred commands
    case "sync":
    case "login":
    case "logout":
    case "whoami":
      console.log(`\n  /orank ${command} — coming soon (requires orank.me backend)\n`);
      break;
    default:
      console.log(`\n  Unknown command: ${command}`);
      console.log("  Run /orang for stats or /orank --help for commands.\n");
  }
}

main();
