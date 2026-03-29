#!/usr/bin/env node
/**
 * patterns.js — Workflow Pattern Detection
 *
 * Detects recurring multi-tool sequences from session data.
 * Returns named patterns with occurrence counts.
 */

"use strict";

// ── Built-in Pattern Names ──────────────────────────────────────────────────

const NAMED_PATTERNS = {
  "Read,Edit,Bash": "Code-Test",
  "Grep,Read,Edit": "Find-and-Fix",
  "Agent,Read,Edit": "Delegate-then-Refine",
  "Read,Edit,Read": "Iterative Edit",
  "Grep,Read": "Search-and-Review",
  "Bash,Read,Edit": "Debug Cycle",
};

// ── Pattern Detection ───────────────────────────────────────────────────────

/**
 * Detect workflow patterns from session data.
 *
 * @param {Object} sessions — cache.sessions object: { sid: { tools_ordered: [{tool, ts}] } }
 * @param {number} minOccurrences — minimum times a sequence must appear to be a pattern (default 5)
 * @returns {Array<{sequence: string[], name: string, count: number}>} — sorted by count desc
 */
function detectPatterns(sessions, minOccurrences = 5) {
  const sequenceCounts = {};

  for (const session of Object.values(sessions)) {
    const tools = (session.tools_ordered || []).map((t) => t.tool);
    if (tools.length < 2) continue;

    // Slide windows of size 2, 3, and 4
    for (let windowSize = 2; windowSize <= Math.min(4, tools.length); windowSize++) {
      for (let i = 0; i <= tools.length - windowSize; i++) {
        const seq = tools.slice(i, i + windowSize);
        const key = seq.join(",");
        sequenceCounts[key] = (sequenceCounts[key] || 0) + 1;
      }
    }
  }

  // Filter to sequences occurring at least minOccurrences times
  const patterns = [];
  for (const [key, count] of Object.entries(sequenceCounts)) {
    if (count >= minOccurrences) {
      const sequence = key.split(",");
      const name = NAMED_PATTERNS[key] || sequence.join(" \u2192 ") + " flow";
      patterns.push({ sequence, name, count });
    }
  }

  // Sort by count descending
  patterns.sort((a, b) => b.count - a.count);
  return patterns;
}

/**
 * Compute workflow score: percentage of tool uses that fall within detected patterns.
 *
 * @param {Object} sessions — cache.sessions object
 * @param {number} totalTools — total tool uses
 * @returns {number} — 0 to 100
 */
function computeWorkflowScore(sessions, totalTools) {
  if (totalTools === 0) return 0;

  const patterns = detectPatterns(sessions);
  if (patterns.length === 0) return 0;

  // Count tool uses that are part of any pattern
  // Use the longest patterns first to avoid double-counting
  let coveredUses = 0;
  const sortedByLength = [...patterns].sort(
    (a, b) => b.sequence.length - a.sequence.length
  );

  for (const session of Object.values(sessions)) {
    const tools = (session.tools_ordered || []).map((t) => t.tool);
    const covered = new Set();

    for (const pattern of sortedByLength) {
      const seq = pattern.sequence;
      for (let i = 0; i <= tools.length - seq.length; i++) {
        const match = seq.every((s, j) => tools[i + j] === s);
        if (match) {
          for (let j = 0; j < seq.length; j++) {
            covered.add(i + j);
          }
        }
      }
    }

    coveredUses += covered.size;
  }

  return Math.min(100, Math.round((coveredUses / totalTools) * 100));
}

module.exports = { detectPatterns, computeWorkflowScore, NAMED_PATTERNS };
