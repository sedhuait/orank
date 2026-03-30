let counter = 0;

function uniqueId() {
  return "test-" + (++counter).toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

function sessionStartEvent(overrides = {}) {
  return {
    type: "session_start",
    ts: overrides.ts || new Date().toISOString(),
    sid: overrides.sid || uniqueId(),
    model: "opus",
    source: "startup",
    cwd: "/tmp/test",
    branch: "main",
    ...overrides,
  };
}

function sessionEndEvent(sid, overrides = {}) {
  return {
    type: "session_end",
    ts: new Date().toISOString(),
    sid,
    reason: null,
    ...overrides,
  };
}

function toolUseEvent(sid, tool = "Read", overrides = {}) {
  return {
    type: "tool_use",
    ts: new Date().toISOString(),
    sid,
    tool,
    file_path: null,
    ...overrides,
  };
}

function toolFailureEvent(sid, tool = "Bash", overrides = {}) {
  return {
    type: "tool_failure",
    ts: new Date().toISOString(),
    sid,
    tool,
    error: "Command failed",
    ...overrides,
  };
}

function turnCompleteEvent(sid, overrides = {}) {
  return {
    type: "turn_complete",
    ts: new Date().toISOString(),
    sid,
    ...overrides,
  };
}

function turnErrorEvent(sid, errorType = "unknown", overrides = {}) {
  return {
    type: "turn_error",
    ts: new Date().toISOString(),
    sid,
    error_type: errorType,
    ...overrides,
  };
}

function slashCommandEvent(sid, command, overrides = {}) {
  return {
    type: "slash_command",
    ts: new Date().toISOString(),
    sid,
    command,
    ...overrides,
  };
}

function subagentStartEvent(sid, overrides = {}) {
  return {
    type: "subagent_start",
    ts: new Date().toISOString(),
    sid,
    agent_type: "Explore",
    agent_id: uniqueId(),
    ...overrides,
  };
}

function subagentStopEvent(sid, overrides = {}) {
  return {
    type: "subagent_stop",
    ts: new Date().toISOString(),
    sid,
    agent_type: "Explore",
    agent_id: uniqueId(),
    ...overrides,
  };
}

function xpAwardEvent(amount = 50, reason = "test", overrides = {}) {
  return {
    type: "xp_award",
    ts: new Date().toISOString(),
    sid: null,
    amount,
    reason,
    ...overrides,
  };
}

function badgeEarnedEvent(badgeId, badgeName, tier, overrides = {}) {
  return {
    type: "badge_earned",
    ts: new Date().toISOString(),
    sid: null,
    badge_id: badgeId,
    badge_name: badgeName,
    badge_tier: tier,
    ...overrides,
  };
}

function historyImportEvent(sid, overrides = {}) {
  return {
    type: "history_import",
    ts: new Date().toISOString(),
    sid,
    ...overrides,
  };
}

function buildSession({ sid, startTs, endTs, tools = [], failures = [], turns = 0, slashCommands = [] }) {
  sid = sid || uniqueId();
  startTs = startTs || new Date().toISOString();
  const events = [];
  events.push(sessionStartEvent({ sid, ts: startTs }));
  for (const tool of tools) {
    events.push(toolUseEvent(sid, tool, { ts: startTs }));
  }
  for (const tool of failures) {
    events.push(toolFailureEvent(sid, tool, { ts: startTs }));
  }
  for (let i = 0; i < turns; i++) {
    events.push(turnCompleteEvent(sid, { ts: startTs }));
  }
  for (const cmd of slashCommands) {
    events.push(slashCommandEvent(sid, cmd, { ts: startTs }));
  }
  if (endTs) {
    events.push(sessionEndEvent(sid, { ts: endTs }));
  }
  return events;
}

export {
  uniqueId,
  sessionStartEvent,
  sessionEndEvent,
  toolUseEvent,
  toolFailureEvent,
  turnCompleteEvent,
  turnErrorEvent,
  slashCommandEvent,
  subagentStartEvent,
  subagentStopEvent,
  xpAwardEvent,
  badgeEarnedEvent,
  historyImportEvent,
  buildSession,
};
