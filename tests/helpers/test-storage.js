import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../../scripts/storage.js";

function createTestStorage() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orank-test-"));
  const storage = new Storage(tmpDir);

  return {
    storage,
    tmpDir,
    cleanup() {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

function writeEvents(tmpDir, events) {
  const eventsFile = path.join(tmpDir, "events.jsonl");
  const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(eventsFile, content, "utf8");
}

function readEvents(tmpDir) {
  const eventsFile = path.join(tmpDir, "events.jsonl");
  if (!fs.existsSync(eventsFile)) return [];
  const content = fs.readFileSync(eventsFile, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export { createTestStorage, writeEvents, readEvents };
