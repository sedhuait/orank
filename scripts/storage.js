#!/usr/bin/env node
/**
 * orank — JSONL + Cache Storage Layer
 *
 * Append-only event log (events.jsonl) with derived cache (cache.json).
 * Cache is rebuilt incrementally from the last known offset.
 *
 * Files:
 * - events.jsonl: append-only event log
 * - cache.json: derived stats (rebuilt from events)
 * - sync-cursor.json: last sync offset
 * - .paused: sentinel file (pause tracking)
 */

const fs = require('fs');
const path = require('path');

class Storage {
  constructor() {
    this.dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(process.env.HOME, '.claude', 'plugins', 'data', 'orank');
    this.eventsFile = path.join(this.dataDir, 'events.jsonl');
    this.cacheFile = path.join(this.dataDir, 'cache.json');
    this.syncCursorFile = path.join(this.dataDir, 'sync-cursor.json');
    this.pausedFile = path.join(this.dataDir, '.paused');

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // In-memory cache (lazy-loaded)
    this._cache = null;
  }

  getDataDir() {
    return this.dataDir;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Event Writing
  // ───────────────────────────────────────────────────────────────────────────

  appendEvent(event) {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.eventsFile, line);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pause/Resume
  // ───────────────────────────────────────────────────────────────────────────

  isPaused() {
    return fs.existsSync(this.pausedFile);
  }

  pause() {
    fs.writeFileSync(this.pausedFile, '');
  }

  resume() {
    if (fs.existsSync(this.pausedFile)) {
      fs.unlinkSync(this.pausedFile);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cache Management
  // ───────────────────────────────────────────────────────────────────────────

  _loadCache() {
    if (fs.existsSync(this.cacheFile)) {
      return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    }
    return this._emptyCache();
  }

  _emptyCache() {
    return {
      total_xp: 0,
      tier: "Bronze",
      total_sessions: 0,
      total_tools: 0,
      total_tool_failures: 0,
      total_turns: 0,
      total_seconds: 0,
      total_turn_errors: 0,
      total_subagents: 0,
      current_streak: 0,
      longest_streak: 0,
      last_active_date: null,
      tool_counts: {},
      slash_command_counts: {},
      subagent_counts: {},
      turn_errors: {},
      daily_sessions: {},
      hourly_activity: Array(24).fill(0),
      badges_earned: [],
      imported_session_ids: [],
      xp_log: [],
      sessions: {},
      tool_sequences: [],
      weekly_snapshots: {},
      dynamic_badge_tracks: {},
      last_weekly_summary_shown: null,
      events_offset: 0,
      last_rebuilt: null,
    };
  }

  _saveCache(cache) {
    fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2), 'utf8');
    this._cache = cache;
  }

  _getEventsFileSize() {
    if (!fs.existsSync(this.eventsFile)) {
      return 0;
    }
    return fs.statSync(this.eventsFile).size;
  }

  _isCacheStale() {
    if (!fs.existsSync(this.cacheFile)) {
      return true;
    }
    if (!fs.existsSync(this.eventsFile)) {
      return false;
    }
    const eventsSize = this._getEventsFileSize();
    const cache = this._loadCache();
    return cache.events_offset < eventsSize;
  }

  /**
   * Read events from the last known offset and rebuild cache incrementally
   */
  rebuildCache() {
    let cache = this._loadCache();
    const startOffset = cache.events_offset || 0;

    if (!fs.existsSync(this.eventsFile)) {
      cache.last_rebuilt = new Date().toISOString();
      this._saveCache(cache);
      return cache;
    }

    const content = fs.readFileSync(this.eventsFile, 'utf8');
    let currentOffset = 0;
    let lineStart = 0;

    // Process only new events from last offset
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        if (currentOffset >= startOffset) {
          const line = content.substring(lineStart, i);
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              this._processEvent(cache, event);
            } catch (e) {
              // Skip malformed lines
            }
          }
        }
        currentOffset = i + 1;
        lineStart = currentOffset;
      }
    }

    // Recompute derived metrics
    this._recomputeDerived(cache);

    cache.events_offset = content.length;
    cache.last_rebuilt = new Date().toISOString();
    this._saveCache(cache);

    return cache;
  }

  _processEvent(cache, event) {
    const { type, ts, sid } = event;

    switch (type) {
      case "session_start": {
        cache.total_sessions += 1;
        const date = ts.split("T")[0];
        cache.daily_sessions[date] = (cache.daily_sessions[date] || 0) + 1;
        const hour = new Date(ts).getHours();
        cache.hourly_activity[hour] += 1;
        cache.sessions[sid] = {
          start_ts: ts,
          end_ts: null,
          tool_count: 0,
          failure_count: 0,
          tools_ordered: [],
        };
        break;
      }

      case "session_end": {
        if (cache.sessions[sid]) {
          cache.sessions[sid].end_ts = ts;
          const start = new Date(cache.sessions[sid].start_ts).getTime();
          const end = new Date(ts).getTime();
          const durationSec = Math.floor((end - start) / 1000);
          if (durationSec > 0 && durationSec < 86400) {
            cache.total_seconds += durationSec;
          }
        }
        break;
      }

      case "tool_use": {
        const { tool } = event;
        cache.total_tools += 1;
        cache.tool_counts[tool] = (cache.tool_counts[tool] || 0) + 1;
        if (cache.sessions[sid]) {
          cache.sessions[sid].tool_count += 1;
          cache.sessions[sid].tools_ordered.push({ tool, ts });
        }
        const trackKey = "tool:" + tool;
        if (!cache.dynamic_badge_tracks[trackKey]) {
          cache.dynamic_badge_tracks[trackKey] = { count: 0, earned_tiers: [] };
        }
        cache.dynamic_badge_tracks[trackKey].count += 1;
        break;
      }

      case "tool_failure": {
        const { tool } = event;
        cache.total_tools += 1;
        cache.total_tool_failures += 1;
        cache.tool_counts[tool] = (cache.tool_counts[tool] || 0) + 1;
        if (cache.sessions[sid]) {
          cache.sessions[sid].failure_count += 1;
          cache.sessions[sid].tool_count += 1;
          cache.sessions[sid].tools_ordered.push({ tool, ts });
        }
        const trackKey = "tool:" + tool;
        if (!cache.dynamic_badge_tracks[trackKey]) {
          cache.dynamic_badge_tracks[trackKey] = { count: 0, earned_tiers: [] };
        }
        cache.dynamic_badge_tracks[trackKey].count += 1;
        break;
      }

      case "turn_complete": {
        cache.total_turns += 1;
        break;
      }

      case "turn_error": {
        cache.total_turn_errors += 1;
        const errType = event.error_type || "unknown";
        cache.turn_errors[errType] = (cache.turn_errors[errType] || 0) + 1;
        break;
      }

      case "slash_command": {
        const { command } = event;
        cache.slash_command_counts[command] =
          (cache.slash_command_counts[command] || 0) + 1;
        const trackKey = "cmd:" + command;
        if (!cache.dynamic_badge_tracks[trackKey]) {
          cache.dynamic_badge_tracks[trackKey] = { count: 0, earned_tiers: [] };
        }
        cache.dynamic_badge_tracks[trackKey].count += 1;
        break;
      }

      case "subagent_start": {
        cache.total_subagents += 1;
        const agentType = event.agent_type || "unknown";
        cache.subagent_counts[agentType] =
          (cache.subagent_counts[agentType] || 0) + 1;
        break;
      }

      case "subagent_stop": {
        break;
      }

      case "xp_award": {
        cache.total_xp += event.amount;
        cache.xp_log.push({
          ts,
          amount: event.amount,
          reason: event.reason,
          running_total: cache.total_xp,
        });
        break;
      }

      case "badge_earned": {
        if (!cache.badges_earned.find((b) => b.badge_id === event.badge_id)) {
          cache.badges_earned.push({
            badge_id: event.badge_id,
            badge_name: event.badge_name,
            badge_tier: event.badge_tier,
            earned_at: ts,
          });
        }
        break;
      }

      case "history_import": {
        if (!cache.imported_session_ids.includes(sid)) {
          cache.imported_session_ids.push(sid);
        }
        break;
      }
    }
  }

  _recomputeDerived(cache) {
    // Recompute streaks from daily_sessions
    this._recomputeStreaks(cache);

    // Recompute tier from total_xp
    const tierInfo = this._getTierFromXP(cache.total_xp);
    cache.tier = tierInfo.name;
  }

  _recomputeStreaks(cache) {
    const dates = Object.keys(cache.daily_sessions).sort();

    if (dates.length === 0) {
      cache.current_streak = 0;
      cache.longest_streak = 0;
      cache.last_active_date = null;
      return;
    }

    cache.last_active_date = dates[dates.length - 1];

    // Find longest streak
    let longest = 0;
    let current = 1;

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }

    cache.longest_streak = Math.max(longest, 1);

    // Calculate current streak (backward from today or yesterday)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let streak = 0;
    let checkDate = today;

    // Start from today or yesterday
    if (!dates.includes(today)) {
      checkDate = yesterday;
    }

    while (dates.includes(checkDate)) {
      streak += 1;
      checkDate = new Date(new Date(checkDate) - 86400000).toISOString().split('T')[0];
    }

    cache.current_streak = streak;
  }

  _getTierFromXP(xp) {
    // Lazy require to avoid circular dependencies
    const { getTier } = require('./badges');
    return getTier(xp);
  }

  ensureFreshCache() {
    if (this._cache === null || this._isCacheStale()) {
      this.rebuildCache();
    }
    return this._cache;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public Read Methods
  // ───────────────────────────────────────────────────────────────────────────

  getStats() {
    const cache = this.ensureFreshCache();

    const successRate =
      cache.total_tools > 0
        ? (((cache.total_tools - cache.total_tool_failures) / cache.total_tools) * 100).toFixed(1)
        : 0;

    const uniqueTools = Object.keys(cache.tool_counts).length;

    const topTools = Object.entries(cache.tool_counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    return {
      total_xp: cache.total_xp,
      tier: cache.tier,
      total_sessions: cache.total_sessions,
      total_tool_uses: cache.total_tools,
      total_tool_failures: cache.total_tool_failures,
      total_turns: cache.total_turns,
      total_seconds: cache.total_seconds,
      total_turn_errors: cache.total_turn_errors,
      total_subagents: cache.total_subagents,
      current_streak: cache.current_streak,
      longest_streak: cache.longest_streak,
      last_active_date: cache.last_active_date,
      success_rate: successRate,
      unique_tools: uniqueTools,
      top_tools: topTools,
      slash_command_counts: cache.slash_command_counts,
      subagent_counts: cache.subagent_counts,
      turn_errors: cache.turn_errors,
      tool_counts: cache.tool_counts,
    };
  }

  getBadges() {
    const cache = this.ensureFreshCache();
    return {
      earned: cache.badges_earned,
    };
  }

  getContributionData(weeks = 52) {
    const cache = this.ensureFreshCache();
    const result = [];

    for (let i = weeks * 7 - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const count = cache.daily_sessions[date] || 0;
      result.push({ date, count });
    }

    return result;
  }

  getToolBreakdown() {
    const cache = this.ensureFreshCache();

    const entries = Object.entries(cache.tool_counts).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      return [];
    }

    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    return entries.map(([name, count]) => ({
      name,
      count,
      pct: ((count / total) * 100).toFixed(1),
    }));
  }

  getHourlyActivity() {
    const cache = this.ensureFreshCache();
    return [...cache.hourly_activity];
  }

  getStreakInfo() {
    const cache = this.ensureFreshCache();
    return {
      current: cache.current_streak,
      longest: cache.longest_streak,
      lastActiveDate: cache.last_active_date,
    };
  }

  getSessions() {
    return this.ensureFreshCache().sessions;
  }

  getWeeklySnapshots() {
    return this.ensureFreshCache().weekly_snapshots;
  }

  setWeeklySnapshot(weekKey, snapshot) {
    const cache = this.ensureFreshCache();
    cache.weekly_snapshots[weekKey] = snapshot;
    this._saveCache(cache);
  }

  getDynamicBadgeTracks() {
    return this.ensureFreshCache().dynamic_badge_tracks;
  }

  getLastWeeklySummaryShown() {
    return this.ensureFreshCache().last_weekly_summary_shown;
  }

  setLastWeeklySummaryShown(dateStr) {
    const cache = this.ensureFreshCache();
    cache.last_weekly_summary_shown = dateStr;
    this._saveCache(cache);
  }

  getSlashCommandCounts() {
    return this.ensureFreshCache().slash_command_counts;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // XP Methods
  // ───────────────────────────────────────────────────────────────────────────

  addXP(amount, reason = "general") {
    this.appendEvent({
      type: "xp_award",
      ts: new Date().toISOString(),
      sid: null,
      amount,
      reason,
    });
  }

  getTotalXP() {
    return this.ensureFreshCache().total_xp;
  }

  getTodayXP() {
    const cache = this.ensureFreshCache();
    const today = new Date().toISOString().split('T')[0];

    return cache.xp_log
      .filter((entry) => entry.ts && entry.ts.startsWith(today))
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Badge Persistence
  // ───────────────────────────────────────────────────────────────────────────

  recordBadge(badgeId, badgeName, badgeTier) {
    this.appendEvent({
      type: "badge_earned",
      ts: new Date().toISOString(),
      sid: null,
      badge_id: badgeId,
      badge_name: badgeName,
      badge_tier: badgeTier,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sync
  // ───────────────────────────────────────────────────────────────────────────

  getSyncCursor() {
    if (fs.existsSync(this.syncCursorFile)) {
      const data = JSON.parse(fs.readFileSync(this.syncCursorFile, 'utf8'));
      return data.offset || 0;
    }
    return 0;
  }

  setSyncCursor(offset) {
    fs.writeFileSync(this.syncCursorFile, JSON.stringify({ offset, timestamp: new Date().toISOString() }, null, 2), 'utf8');
  }

  getEventsSince(offset) {
    if (!fs.existsSync(this.eventsFile)) {
      return [];
    }

    const content = fs.readFileSync(this.eventsFile, 'utf8');
    const events = [];
    let currentOffset = 0;
    let lineStart = 0;

    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        if (currentOffset >= offset) {
          const line = content.substring(lineStart, i);
          if (line.trim()) {
            try {
              events.push(JSON.parse(line));
            } catch (e) {
              // Skip malformed lines
            }
          }
        }
        currentOffset = i + 1;
        lineStart = currentOffset;
      }
    }

    return events;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Data Management
  // ───────────────────────────────────────────────────────────────────────────

  exportAll() {
    const cache = this.ensureFreshCache();
    const events = [];

    if (fs.existsSync(this.eventsFile)) {
      const content = fs.readFileSync(this.eventsFile, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch (e) {
          // Skip malformed lines
        }
      }
    }

    return {
      cache,
      events,
      exported_at: new Date().toISOString(),
    };
  }

  purge() {
    // Delete all data files
    const files = [this.eventsFile, this.cacheFile, this.syncCursorFile];
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }

    // Reset in-memory cache
    this._cache = null;
  }

  isSessionImported(id) {
    const cache = this.ensureFreshCache();
    return cache.imported_session_ids.includes(id);
  }

  markSessionImported(id) {
    this.appendEvent({
      type: "history_import",
      ts: new Date().toISOString(),
      sid: id,
    });
  }

  getDataSize() {
    let size = 0;
    const files = [this.eventsFile, this.cacheFile, this.syncCursorFile];

    for (const file of files) {
      if (fs.existsSync(file)) {
        size += fs.statSync(file).size;
      }
    }

    return size;
  }
}

module.exports = { Storage };
