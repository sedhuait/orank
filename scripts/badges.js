#!/usr/bin/env node
/**
 * orank — Badge / Achievement Engine
 *
 * Evaluates user activity against badge criteria and awards achievements.
 * Think Xbox Achievements or GitHub badges — automatic, milestone-based.
 *
 * Badge tiers: bronze → silver → gold → platinum → diamond
 */

const { generateDynamicBadges, getNextBadges } = require("./dynamic-badges");

// ── Badge Definitions ────────────────────────────────────────────────────────
const BADGE_DEFINITIONS = [
  // ── Usage Milestones ────────────────────────────────────────────────────
  {
    id: "first-session",
    name: "Hello Claude",
    description: "Complete your first Claude Code session",
    icon: "👋",
    tier: "bronze",
    check: (stats) => ({ earned: stats.total_sessions >= 1, progress: Math.min(100, (stats.total_sessions / 1) * 100) }),
  },
  {
    id: "sessions-10",
    name: "Getting Started",
    description: "Complete 10 Claude Code sessions",
    icon: "🌱",
    tier: "bronze",
    check: (stats) => ({ earned: stats.total_sessions >= 10, progress: Math.min(100, (stats.total_sessions / 10) * 100) }),
  },
  {
    id: "sessions-100",
    name: "Power User",
    description: "Complete 100 Claude Code sessions",
    icon: "⚡",
    tier: "silver",
    check: (stats) => ({ earned: stats.total_sessions >= 100, progress: Math.min(100, (stats.total_sessions / 100) * 100) }),
  },
  {
    id: "sessions-500",
    name: "Claude Veteran",
    description: "Complete 500 Claude Code sessions",
    icon: "🎖️",
    tier: "gold",
    check: (stats) => ({ earned: stats.total_sessions >= 500, progress: Math.min(100, (stats.total_sessions / 500) * 100) }),
  },
  {
    id: "sessions-1000",
    name: "Claude Legend",
    description: "Complete 1,000 Claude Code sessions",
    icon: "👑",
    tier: "platinum",
    check: (stats) => ({ earned: stats.total_sessions >= 1000, progress: Math.min(100, (stats.total_sessions / 1000) * 100) }),
  },

  // ── Tool Mastery ────────────────────────────────────────────────────────
  {
    id: "tool-uses-100",
    name: "Tool Tinkerer",
    description: "Use 100 tools across all sessions",
    icon: "🔧",
    tier: "bronze",
    check: (stats) => ({ earned: stats.total_tool_uses >= 100, progress: Math.min(100, (stats.total_tool_uses / 100) * 100) }),
  },
  {
    id: "tool-uses-1000",
    name: "Tool Master",
    description: "Use 1,000 tools across all sessions",
    icon: "⚙️",
    tier: "silver",
    check: (stats) => ({ earned: stats.total_tool_uses >= 1000, progress: Math.min(100, (stats.total_tool_uses / 1000) * 100) }),
  },
  {
    id: "tool-uses-10000",
    name: "Tool Titan",
    description: "Use 10,000 tools across all sessions",
    icon: "🏗️",
    tier: "gold",
    check: (stats) => ({ earned: stats.total_tool_uses >= 10000, progress: Math.min(100, (stats.total_tool_uses / 10000) * 100) }),
  },
  {
    id: "unique-tools-5",
    name: "Swiss Army Knife",
    description: "Use 5 different tool types",
    icon: "🗡️",
    tier: "bronze",
    check: (stats) => ({ earned: stats.unique_tools >= 5, progress: Math.min(100, (stats.unique_tools / 5) * 100) }),
  },
  {
    id: "unique-tools-15",
    name: "Tool Explorer",
    description: "Use 15 different tool types",
    icon: "🧭",
    tier: "silver",
    check: (stats) => ({ earned: stats.unique_tools >= 15, progress: Math.min(100, (stats.unique_tools / 15) * 100) }),
  },

  // ── Streak Badges ───────────────────────────────────────────────────────
  {
    id: "streak-3",
    name: "Getting Consistent",
    description: "Maintain a 3-day usage streak",
    icon: "🔥",
    tier: "bronze",
    check: (stats) => ({ earned: stats.longest_streak >= 3, progress: Math.min(100, (stats.longest_streak / 3) * 100) }),
  },
  {
    id: "streak-7",
    name: "Weekly Warrior",
    description: "Maintain a 7-day usage streak",
    icon: "🔥",
    tier: "silver",
    check: (stats) => ({ earned: stats.longest_streak >= 7, progress: Math.min(100, (stats.longest_streak / 7) * 100) }),
  },
  {
    id: "streak-30",
    name: "Streak Master",
    description: "Maintain a 30-day usage streak",
    icon: "🔥",
    tier: "gold",
    check: (stats) => ({ earned: stats.longest_streak >= 30, progress: Math.min(100, (stats.longest_streak / 30) * 100) }),
  },
  {
    id: "streak-100",
    name: "Unstoppable",
    description: "Maintain a 100-day usage streak",
    icon: "💎",
    tier: "platinum",
    check: (stats) => ({ earned: stats.longest_streak >= 100, progress: Math.min(100, (stats.longest_streak / 100) * 100) }),
  },

  // ── Efficiency Badges ───────────────────────────────────────────────────
  {
    id: "success-rate-90",
    name: "Precision Coder",
    description: "Maintain 90%+ tool success rate (min 100 uses)",
    icon: "🎯",
    tier: "silver",
    check: (stats) => {
      if (stats.total_tool_uses < 100) return { earned: false, progress: (stats.total_tool_uses / 100) * 50 };
      const rate = parseFloat(stats.success_rate);
      return { earned: rate >= 90, progress: Math.min(100, (rate / 90) * 100) };
    },
  },
  {
    id: "success-rate-98",
    name: "Flawless Executor",
    description: "Maintain 98%+ tool success rate (min 500 uses)",
    icon: "💎",
    tier: "platinum",
    check: (stats) => {
      if (stats.total_tool_uses < 500) return { earned: false, progress: (stats.total_tool_uses / 500) * 50 };
      const rate = parseFloat(stats.success_rate);
      return { earned: rate >= 98, progress: Math.min(100, (rate / 98) * 100) };
    },
  },

  // ── Time Badges ─────────────────────────────────────────────────────────
  {
    id: "hours-10",
    name: "Time Invested",
    description: "Spend 10+ hours with Claude Code",
    icon: "⏱️",
    tier: "bronze",
    check: (stats) => {
      const hours = stats.total_seconds / 3600;
      return { earned: hours >= 10, progress: Math.min(100, (hours / 10) * 100) };
    },
  },
  {
    id: "hours-100",
    name: "Dedicated Developer",
    description: "Spend 100+ hours with Claude Code",
    icon: "⏰",
    tier: "silver",
    check: (stats) => {
      const hours = stats.total_seconds / 3600;
      return { earned: hours >= 100, progress: Math.min(100, (hours / 100) * 100) };
    },
  },
  {
    id: "hours-500",
    name: "Marathon Coder",
    description: "Spend 500+ hours with Claude Code",
    icon: "🏃",
    tier: "gold",
    check: (stats) => {
      const hours = stats.total_seconds / 3600;
      return { earned: hours >= 500, progress: Math.min(100, (hours / 500) * 100) };
    },
  },

  // ── XP Milestones ───────────────────────────────────────────────────────
  {
    id: "xp-1000",
    name: "Rising Star",
    description: "Earn 1,000 XP",
    icon: "⭐",
    tier: "bronze",
    check: (stats) => ({ earned: stats.total_xp >= 1000, progress: Math.min(100, (stats.total_xp / 1000) * 100) }),
  },
  {
    id: "xp-5000",
    name: "Gold Standard",
    description: "Earn 5,000 XP",
    icon: "🥇",
    tier: "gold",
    check: (stats) => ({ earned: stats.total_xp >= 5000, progress: Math.min(100, (stats.total_xp / 5000) * 100) }),
  },
  {
    id: "xp-20000",
    name: "Diamond Elite",
    description: "Earn 20,000 XP",
    icon: "💎",
    tier: "diamond",
    check: (stats) => ({ earned: stats.total_xp >= 20000, progress: Math.min(100, (stats.total_xp / 20000) * 100) }),
  },

  // ── Turns / Conversation Depth ──────────────────────────────────────────
  {
    id: "turns-500",
    name: "Conversationalist",
    description: "Complete 500 conversation turns",
    icon: "💬",
    tier: "bronze",
    check: (stats) => ({ earned: stats.total_turns >= 500, progress: Math.min(100, (stats.total_turns / 500) * 100) }),
  },
  {
    id: "turns-5000",
    name: "Deep Thinker",
    description: "Complete 5,000 conversation turns",
    icon: "🧠",
    tier: "silver",
    check: (stats) => ({ earned: stats.total_turns >= 5000, progress: Math.min(100, (stats.total_turns / 5000) * 100) }),
  },

  // ── Efficiency & Depth Badges ──────────────────────────────────────────
  {
    id: "efficiency-expert",
    name: "Efficiency Expert",
    description: "Maintain A+ efficiency score for 7 days",
    icon: "\uD83C\uDF1F",
    tier: "gold",
    check: (stats) => {
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
      const weeks = stats._improving_weeks || 0;
      return { earned: weeks >= 4, progress: Math.min(100, (weeks / 4) * 100) };
    },
  },
];

// ── XP Award Rules ───────────────────────────────────────────────────────────
const XP_RULES = {
  SESSION_COMPLETE: 50,          // Completing a session
  TOOL_USE_MILESTONE_100: 200,   // Every 100 tool uses
  STREAK_MILESTONE_7: 500,       // 7-day streak
  STREAK_MILESTONE_30: 2000,     // 30-day streak
  STREAK_MILESTONE_100: 5000,    // 100-day streak
  BADGE_EARNED_BRONZE: 100,      // Earning a bronze badge
  BADGE_EARNED_SILVER: 250,      // Earning a silver badge
  BADGE_EARNED_GOLD: 500,        // Earning a gold badge
  BADGE_EARNED_PLATINUM: 1000,   // Earning a platinum badge
  BADGE_EARNED_DIAMOND: 2500,    // Earning a diamond badge
};

// ── Tier Calculation ─────────────────────────────────────────────────────────
const TIERS = [
  { name: "Bronze", min: 0, icon: "🥉" },
  { name: "Silver", min: 2000, icon: "🥈" },
  { name: "Gold", min: 5000, icon: "🥇" },
  { name: "Platinum", min: 10000, icon: "🏆" },
  { name: "Diamond", min: 20000, icon: "💎" },
];

function getTier(xp) {
  let tier = TIERS[0];
  for (const t of TIERS) {
    if (xp >= t.min) tier = t;
  }
  const nextTier = TIERS[TIERS.indexOf(tier) + 1] || null;
  return {
    name: tier.name,
    icon: tier.icon,
    xp,
    nextTier: nextTier ? nextTier.name : null,
    nextTierXP: nextTier ? nextTier.min : null,
    progress: nextTier ? ((xp - tier.min) / (nextTier.min - tier.min) * 100).toFixed(1) : 100,
  };
}

// ── Badge Evaluation Engine ──────────────────────────────────────────────────
class BadgeEngine {
  constructor(storage) {
    this.storage = storage;
  }

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

  awardSessionXP() {
    const storage = this.storage;
    storage.addXP(XP_RULES.SESSION_COMPLETE, "Session completed");

    const stats = storage.getStats();
    const toolMilestone = Math.floor(stats.total_tool_uses / 100);
    const existingMilestones = (storage.ensureFreshCache().xp_log || [])
      .filter((e) => e.reason && e.reason.startsWith("Tool milestone"))
      .length;
    if (toolMilestone > existingMilestones) {
      storage.addXP(XP_RULES.TOOL_USE_MILESTONE_100, `Tool milestone: ${toolMilestone * 100} uses`);
    }

    const streak = storage.getStreakInfo().current;
    const milestones = [
      { days: 7, xp: XP_RULES.STREAK_MILESTONE_7, label: "7-day" },
      { days: 30, xp: XP_RULES.STREAK_MILESTONE_30, label: "30-day" },
      { days: 100, xp: XP_RULES.STREAK_MILESTONE_100, label: "100-day" },
    ];
    for (const m of milestones) {
      if (streak === m.days) {
        storage.addXP(m.xp, `Streak milestone: ${m.label}`);
      }
    }
  }

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
}

module.exports = { BadgeEngine, BADGE_DEFINITIONS, XP_RULES, TIERS, getTier };
