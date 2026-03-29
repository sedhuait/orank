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
