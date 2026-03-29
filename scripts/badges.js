#!/usr/bin/env node
/**
 * orank — Badge / Achievement Engine
 *
 * Evaluates user activity against badge criteria and awards achievements.
 * Think Xbox Achievements or GitHub badges — automatic, milestone-based.
 *
 * Badge tiers: bronze → silver → gold → platinum → diamond
 */

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
    const earnedBadges = this.storage.getBadges().earned;
    const earnedIds = new Set(earnedBadges.map((b) => b.id));
    const newlyEarned = [];

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
    return { earned, inProgress, locked, total: BADGE_DEFINITIONS.length };
  }
}

module.exports = { BadgeEngine, BADGE_DEFINITIONS, XP_RULES, TIERS, getTier };
