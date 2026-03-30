import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { Storage } from "./storage.js";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const HISTORY_FILE = path.join(CLAUDE_DIR, "history.jsonl");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

class HistoryImporter {
  constructor(storage) {
    this.storage = storage;
    this.imported = 0;
    this.skipped = 0;
    this._sessions = null;
  }

  _collectSessions() {
    if (this._sessions !== null) {
      return this._sessions;
    }

    const sessions = {};
    const sessionIds = new Set();

    this._importFromGlobalHistory(sessions, sessionIds);
    this._importFromProjectSessions(sessions, sessionIds);

    this._sessions = Object.values(sessions).sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      return timeA - timeB;
    });

    return this._sessions;
  }

  _importFromGlobalHistory(sessions, sessionIds) {
    if (!fs.existsSync(HISTORY_FILE)) {
      return;
    }

    try {
      const content = fs.readFileSync(HISTORY_FILE, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const sessionId = entry.sessionId || entry.id;

          if (!sessionId || sessionIds.has(sessionId)) {
            continue;
          }

          sessionIds.add(sessionId);

          const timestamp = entry.timestamp || entry.createdAt || entry.created_at;
          const cwd = entry.projectPath || entry.cwd;
          const turns = entry.numTurns || entry.turns || 0;

          sessions[sessionId] = {
            id: sessionId,
            startTime: timestamp,
            cwd: cwd || null,
            branch: null,
            turns: turns,
            toolCounts: entry.toolCounts || entry.tool_counts || {},
          };
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  _importFromProjectSessions(sessions, sessionIds) {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return;
    }

    try {
      const scanDir = (dir) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              const indexFile = path.join(fullPath, "sessions-index.json");

              if (fs.existsSync(indexFile)) {
                try {
                  const data = JSON.parse(fs.readFileSync(indexFile, "utf-8"));
                  const sessionsList = Array.isArray(data) ? data : data.sessions || [];

                  for (const s of sessionsList) {
                    const sessionId = s.sessionId || s.id;

                    if (!sessionId || sessionIds.has(sessionId)) {
                      continue;
                    }

                    sessionIds.add(sessionId);

                    const timestamp = s.startedAt || s.createdAt || s.timestamp;
                    const turns = s.messageCount || s.numMessages || s.numTurns || s.turns || 0;
                    const toolCounts = s.toolCounts || s.tool_counts || {};

                    sessions[sessionId] = {
                      id: sessionId,
                      startTime: timestamp,
                      cwd: fullPath,
                      branch: s.gitBranch || null,
                      turns: turns,
                      toolCounts: toolCounts,
                    };
                  }
                } catch {
                  // skip
                }
              }

              if (dir === PROJECTS_DIR) {
                scanDir(fullPath);
              }
            }
          }
        } catch {
          // skip
        }
      };

      scanDir(PROJECTS_DIR);
    } catch {
      // skip
    }
  }

  preview() {
    const allSessions = this._collectSessions();

    let alreadyImported = 0;
    let toImport = 0;

    for (const session of allSessions) {
      if (this.storage.isSessionImported(session.id)) {
        alreadyImported += 1;
      } else {
        toImport += 1;
      }
    }

    return {
      totalFound: allSessions.length,
      alreadyImported,
      toImport,
    };
  }

  importAll() {
    const allSessions = this._collectSessions();

    for (const session of allSessions) {
      if (this.storage.isSessionImported(session.id)) {
        this.skipped += 1;
        continue;
      }

      try {
        const startTime = session.startTime || new Date().toISOString();

        this.storage.appendEvent({
          type: "session_start",
          ts: startTime,
          sid: session.id,
          cwd: session.cwd,
          branch: session.branch,
          model: null,
          source: "import",
        });

        if (session.toolCounts && typeof session.toolCounts === "object") {
          for (const [toolName, count] of Object.entries(session.toolCounts)) {
            for (let i = 0; i < count; i++) {
              this.storage.appendEvent({
                type: "tool_use",
                ts: startTime,
                sid: session.id,
                tool: toolName,
                file_path: null,
              });
            }
          }
        }

        const turns = session.turns || 0;
        for (let i = 0; i < turns; i++) {
          this.storage.appendEvent({
            type: "turn_complete",
            ts: startTime,
            sid: session.id,
          });
        }

        this.storage.appendEvent({
          type: "session_end",
          ts: startTime,
          sid: session.id,
          reason: "import",
        });

        this.storage.markSessionImported(session.id);
        this.storage.addXP(50, "History import: session " + session.id);

        this.imported += 1;
      } catch {
        this.skipped += 1;
      }
    }

    return {
      imported: this.imported,
      skipped: this.skipped,
    };
  }
}

export { HistoryImporter };
