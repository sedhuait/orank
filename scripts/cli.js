#!/usr/bin/env node
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

import { Storage } from "./storage.js";
import { BadgeEngine, getTier, TIERS } from "./badges.js";
import { HistoryImporter } from "./history-import.js";
import { runIntegrityReport, formatIntegrityReport, loadAllEvents } from "./integrity.js";
import { computeMetrics, computeTrends, getWeekKey } from "./metrics.js";
import { detectPatterns } from "./patterns.js";
import { getCurrentTier, TIER_NAMES, selectThresholds } from "./dynamic-badges.js";

// ── Formatting Helpers ─────────��────────────────────────────────────────────

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

// ── Commands ────────���───────────────────────────────��───────────────────────

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

  const weekKey = getWeekKey(new Date());
  const snapshots = storage.getWeeklySnapshots();

  storage.setWeeklySnapshot(weekKey, metrics);

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

function starRating(trackKey, dynamicTracks) {
  const track = dynamicTracks[trackKey];
  if (!track) return "";
  const thresholds = selectThresholds(track.count, 1);
  const tier = getCurrentTier(track.count, thresholds);
  if (!tier) return "";
  const idx = TIER_NAMES.indexOf(tier);
  return "\u2605".repeat(idx + 1);
}

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
    lines.push(
      `  \uD83D\uDCCA Last week: Efficiency ${prevGrade} \u2192 ${metrics.grade} (\u2191${Math.abs(metrics.composite - (prevWeek.composite || 0))}%), ${weekBadges} new badges, ${weekHours}h active`,
    );
    lines.push("");
    storage.setLastWeeklySummaryShown(weekKey);
  }

  lines.push("");
  lines.push("  orank \u2014 your open AI score");
  lines.push(
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  );
  lines.push("");

  lines.push(
    `  ${tier.icon}  ${tier.name}    ${fmt(stats.total_xp)} XP    Today: +${fmt(todayXP)} XP    Efficiency: ${metrics.grade} (${metrics.composite}) ${trends.composite.arrow}`,
  );
  if (tier.nextTier) {
    lines.push(`  \u2192 ${tier.nextTier}: ${bar(parseFloat(tier.progress))}  (${fmt(tier.nextTierXP - stats.total_xp)} to go)`);
  } else {
    lines.push("  Maximum tier reached!");
  }
  lines.push("");

  lines.push(
    "  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
  );
  lines.push(
    `  \u2502  Sessions: ${String(stats.total_sessions).padEnd(8)} Tools: ${String(fmt(stats.total_tool_uses)).padEnd(10)} Success: ${trendStr(stats.success_rate + "%", trends.success_rate)}`,
  );
  lines.push(
    `  \u2502  Turns:    ${String(fmt(stats.total_turns)).padEnd(8)} Time:  ${String(formatDuration(stats.total_seconds)).padEnd(10)} Breadth: ${stats.unique_tools}/${Object.keys(stats.tool_counts).length}`,
  );
  lines.push(
    `  \u2502  Streak:   ${String(stats.current_streak + "d").padEnd(8)} Best:  ${String(stats.longest_streak + "d").padEnd(10)} Retries: ${trendStr(metrics.retry_rate + "%", trends.retry_rate)}`,
  );
  lines.push(
    "  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
  );
  lines.push("");

  if (stats.top_tools.length > 0) {
    lines.push("  Top Tools:");
    for (const tool of stats.top_tools.slice(0, 6)) {
      const pct = stats.total_tool_uses > 0 ? ((tool.count / stats.total_tool_uses) * 100).toFixed(0) : 0;
      const stars = starRating("tool:" + tool.name, dynamicTracks);
      lines.push(`     ${tool.name.padEnd(16)} ${String(tool.count).padStart(6)} (${pct}%)  ${stars}`);
    }
    lines.push("");
  }

  if (badges.nextBadges && badges.nextBadges.length > 0) {
    lines.push("  Next Badges:");
    for (const b of badges.nextBadges.slice(0, 5)) {
      lines.push(`     ${b.name.padEnd(22)} ${bar(b.progress, 16)}`);
    }
    lines.push("");
  }

  lines.push(`  Badges: ${badges.earned.length}/${badges.total} earned    Pending: ${badges.total - badges.earned.length}`);
  if (newBadges.length > 0) {
    lines.push("");
    lines.push("  NEW BADGES:");
    for (const b of newBadges) {
      lines.push(`     ${b.icon || ""}  ${b.name} \u2014 ${b.description} [${b.tier}]`);
    }
  }
  lines.push("");

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
  lines.push(
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  );
  lines.push("");

  console.log(lines.join("\n"));
}

function cmdInsights(storage) {
  const stats = storage.getStats();
  const sessions = storage.getSessions();
  const { metrics, trends, weekKey } = getCurrentMetrics(storage);
  const patterns = detectPatterns(sessions);
  const snapshots = storage.getWeeklySnapshots();
  const allWeeks = Object.keys(snapshots).sort();
  const currentIdx = allWeeks.indexOf(weekKey);
  const prevWeek = currentIdx > 0 ? snapshots[allWeeks[currentIdx - 1]] : null;

  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const lines = [];
  lines.push("");
  lines.push(`  orank \u2014 Weekly Insights (${fmtDate(weekStart)}\u2013${fmtDate(weekEnd)})`);
  lines.push(
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  );
  lines.push("");

  if (prevWeek) {
    const delta = metrics.composite - prevWeek.composite;
    const arrow = delta >= 0 ? "\u2191" : "\u2193";
    lines.push(
      `  Efficiency: ${metrics.grade} (${metrics.composite})  \u2190 was ${prevWeek.grade} (${prevWeek.composite}) last week  ${arrow} ${Math.abs(delta).toFixed(1)}%`,
    );
  } else {
    lines.push(`  Efficiency: ${metrics.grade} (${metrics.composite})  (first week \u2014 no comparison yet)`);
  }
  lines.push("");

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

  if (patterns.length > 0) {
    lines.push("  Workflow patterns detected:");
    for (const p of patterns.slice(0, 5)) {
      lines.push(`     ${p.sequence.join(" \u2192 ").padEnd(28)} (${p.count} times \u2014 "${p.name}")`);
    }
    lines.push("");
  }

  const cmdCounts = stats.slash_command_counts || {};
  const cmds = Object.entries(cmdCounts).sort((a, b) => b[1] - a[1]);
  if (cmds.length > 0) {
    lines.push("  Slash commands this week:");
    lines.push("     " + cmds.slice(0, 6).map(([cmd, count]) => `/${cmd} (${count}x)`).join("  "));
    lines.push("");
  }

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

  lines.push(
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  );
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

  const engine = new BadgeEngine(storage);
  const newBadges = engine.evaluate();
  if (newBadges.length > 0) {
    console.log("\n  Badges unlocked:");
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

  lines.push(isPaused ? "  [PAUSED] Tracking is paused" : "  [ACTIVE] Tracking is active");
  lines.push("  All data stays on your machine. Sync is not yet available.\n");

  lines.push("  What orank collects:");
  lines.push("     Session timestamps (start/end)");
  lines.push("     Tool names and outcomes (success/failure)");
  lines.push("     Conversation turn counts");
  lines.push("     Working directory path");
  lines.push("     Git branch name\n");

  lines.push("  What orank NEVER collects:");
  lines.push("     Your prompts or messages");
  lines.push("     Claude's responses");
  lines.push("     File contents or source code");
  lines.push("     API keys or credentials");
  lines.push("     Personal information\n");

  lines.push("  Storage:");
  lines.push(`     Location:  ${dataDir}`);
  lines.push(`     Size:      ${(dataSize / 1024).toFixed(1)} KB`);
  lines.push(`     Sessions:  ${stats.total_sessions}`);
  lines.push(`     Events:    ${stats.total_tool_uses + stats.total_turns + stats.total_sessions}`);
  lines.push("     Network:   Offline only\n");

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

// ── Router ──��──────────────────────────���────────────────────────────────────

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
    case "insights":
      cmdInsights(storage);
      break;
    case "sync":
    case "login":
    case "logout":
    case "whoami":
      console.log(`\n  /orank ${command} — coming soon (requires orank.me backend)\n`);
      break;
    default:
      console.log(`\n  Unknown command: ${command}`);
      console.log("  Run /orank for stats or /orank --help for commands.\n");
  }
}

main();
