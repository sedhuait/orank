"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function createTestStorage() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orank-test-"));
  process.env.CLAUDE_PLUGIN_DATA = tmpDir;

  // Clear module cache so Storage picks up the new env var
  delete require.cache[require.resolve("../../scripts/storage")];
  delete require.cache[require.resolve("../../scripts/badges")];

  const { Storage } = require("../../scripts/storage");
  const storage = new Storage();

  return {
    storage,
    tmpDir,
    cleanup() {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      delete process.env.CLAUDE_PLUGIN_DATA;
    },
  };
}

/**
 * Write events to a storage's events.jsonl file directly.
 */
function writeEvents(tmpDir, events) {
  const eventsFile = path.join(tmpDir, "events.jsonl");
  const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(eventsFile, content, "utf8");
}

/**
 * Read all events from a storage's events.jsonl file.
 */
function readEvents(tmpDir) {
  const eventsFile = path.join(tmpDir, "events.jsonl");
  if (!fs.existsSync(eventsFile)) return [];
  const content = fs.readFileSync(eventsFile, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

module.exports = { createTestStorage, writeEvents, readEvents };
