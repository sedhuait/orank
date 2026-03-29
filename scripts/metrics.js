#!/usr/bin/env node
/**
 * metrics.js — Efficiency Metrics Engine
 *
 * Computes 5 efficiency dimensions + composite score + letter grade.
 * All functions are pure — take data in, return scores out.
 */

"use strict";

const { computeWorkflowScore } = require("./patterns");

// ── Grade Mapping ───────────────────────────────────────────────────────────

const GRADES = [
  { min: 95, grade: "A+" },
  { min: 90, grade: "A" },
  { min: 85, grade: "A-" },
  { min: 80, grade: "B+" },
  { min: 75, grade: "B" },
  { min: 70, grade: "B-" },
  { min: 65, grade: "C+" },
  { min: 60, grade: "C" },
  { min: 55, grade: "C-" },
  { min: 40, grade: "D" },
  { min: 0, grade: "F" },
];

function getGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g.grade;
  }
  return "F";
}

// ── Individual Metrics ──────────────────────────────────────────────────────

/**
 * Success Rate: (total_tools - total_failures) / total_tools * 100
 * Returns 0–100
 */
function computeSuccessRate(totalTools, totalFailures) {
  if (totalTools === 0) return 100;
  return ((totalTools - totalFailures) / totalTools) * 100;
}

/**
 * Throughput: tools per active session minute.
 * Returns raw value (not 0–100). Normalized later.
 */
function computeThroughput(totalTools, totalSeconds) {
  if (totalSeconds === 0) return 0;
  const minutes = totalSeconds / 60;
  return totalTools / minutes;
}

/**
 * Breadth: unique tools used / total distinct tools ever seen.
 * For weekly: unique tools this week / all tools ever seen.
 * Returns 0–100.
 */
function computeBreadth(uniqueToolsInWindow, totalDistinctToolsEver) {
  if (totalDistinctToolsEver === 0) return 0;
  return (uniqueToolsInWindow / totalDistinctToolsEver) * 100;
}

/**
 * Retry Rate: consecutive same-tool calls within 30s / total tool calls.
 * Returns 0–100 (lower is better).
 */
function computeRetryRate(sessions) {
  let totalTools = 0;
  let retries = 0;

  for (const session of Object.values(sessions)) {
    const tools = session.tools_ordered || [];
    totalTools += tools.length;

    for (let i = 1; i < tools.length; i++) {
      if (tools[i].tool === tools[i - 1].tool) {
        const gap = new Date(tools[i].ts).getTime() - new Date(tools[i - 1].ts).getTime();
        if (gap < 30000) {
          retries += 1;
        }
      }
    }
  }

  if (totalTools === 0) return 0;
  return (retries / totalTools) * 100;
}

// ── Composite Score ─────────────────────────────────────────────────────────

// Weights for each dimension
const WEIGHTS = {
  success_rate: 0.25,
  throughput: 0.20,
  breadth: 0.15,
  retry_rate: 0.20,
  workflow_score: 0.20,
};

/**
 * Normalize throughput to 0–100 scale.
 * 0 tools/min = 0, 10+ tools/min = 100 (capped).
 */
function normalizeThroughput(rawThroughput) {
  return Math.min(100, (rawThroughput / 10) * 100);
}

/**
 * Compute all 5 metrics + composite + grade.
 *
 * @param {Object} params
 * @param {number} params.totalTools
 * @param {number} params.totalFailures
 * @param {number} params.totalSeconds
 * @param {number} params.uniqueToolsInWindow
 * @param {number} params.totalDistinctToolsEver
 * @param {Object} params.sessions — cache.sessions
 * @returns {Object} { success_rate, throughput, breadth, retry_rate, workflow_score, composite, grade }
 */
function computeMetrics({
  totalTools,
  totalFailures,
  totalSeconds,
  uniqueToolsInWindow,
  totalDistinctToolsEver,
  sessions,
}) {
  const success_rate = computeSuccessRate(totalTools, totalFailures);
  const rawThroughput = computeThroughput(totalTools, totalSeconds);
  const throughput = normalizeThroughput(rawThroughput);
  const breadth = computeBreadth(uniqueToolsInWindow, totalDistinctToolsEver);
  const retry_rate = computeRetryRate(sessions);
  const workflow_score = computeWorkflowScore(sessions, totalTools);

  // Composite: weighted average. Retry rate is inverted (lower is better).
  const composite = Math.round(
    success_rate * WEIGHTS.success_rate +
    throughput * WEIGHTS.throughput +
    breadth * WEIGHTS.breadth +
    (100 - retry_rate) * WEIGHTS.retry_rate +
    workflow_score * WEIGHTS.workflow_score
  );

  const grade = getGrade(composite);

  return {
    success_rate: Math.round(success_rate * 10) / 10,
    throughput: Math.round(rawThroughput * 10) / 10,
    breadth: Math.round(breadth * 10) / 10,
    retry_rate: Math.round(retry_rate * 10) / 10,
    workflow_score: Math.round(workflow_score * 10) / 10,
    composite,
    grade,
  };
}

// ── Trend Computation ───────────────────────────────────────────────────────

/**
 * Get the ISO week key for a date (e.g., "2026-W13").
 */
function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Compute trend arrows for each metric.
 *
 * @param {Object} current — current week's metrics
 * @param {Object|null} previous — previous week's metrics (null if no data)
 * @returns {Object} — { metric_name: { delta: number, arrow: "↑"|"↓"|"" } }
 */
function computeTrends(current, previous) {
  if (!previous) {
    return {
      success_rate: { delta: 0, arrow: "" },
      throughput: { delta: 0, arrow: "" },
      breadth: { delta: 0, arrow: "" },
      retry_rate: { delta: 0, arrow: "" },
      workflow_score: { delta: 0, arrow: "" },
      composite: { delta: 0, arrow: "" },
    };
  }

  const result = {};
  for (const key of ["success_rate", "throughput", "breadth", "retry_rate", "workflow_score", "composite"]) {
    const delta = current[key] - (previous[key] || 0);
    let arrow = "";
    if (Math.abs(delta) >= 0.5) {
      if (key === "retry_rate") {
        // For retry rate, lower is better, so arrow is inverted
        arrow = delta > 0 ? "\u2193" : "\u2191";
      } else {
        arrow = delta > 0 ? "\u2191" : "\u2193";
      }
    }
    result[key] = { delta: Math.round(delta * 10) / 10, arrow };
  }

  return result;
}

module.exports = {
  computeMetrics,
  computeTrends,
  getWeekKey,
  getGrade,
  WEIGHTS,
};
