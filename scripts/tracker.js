#!/usr/bin/env node
/**
 * tracker.js — Hook entry point for orank event tracking
 *
 * Reads JSON from stdin (Claude Code hook API).
 * Determines event type from hook_event_name field.
 * Must be fast — runs on every hook event.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "./storage.js";

// ── Language Detection ──────────────────────────────────────────────────────

const EXT_TO_LANG = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".jsx": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".rb": "ruby",
  ".erb": "ruby",
  ".php": "php",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".scala": "scala",
  ".r": "r",
  ".R": "r",
  ".lua": "lua",
  ".zig": "zig",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hs": "haskell",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".clj": "clojure",
  ".cljs": "clojure",
  ".dart": "dart",
  ".vue": "vue",
  ".svelte": "svelte",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".json": "json",
  ".jsonc": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".proto": "protobuf",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".sol": "solidity",
  ".move": "move",
  ".cairo": "cairo",
  ".Dockerfile": "docker",
  ".prisma": "prisma",
};

// Framework/library hints from file paths
const PATH_FRAMEWORK_PATTERNS = [
  { pattern: /\/components\/|\.tsx$|\.jsx$/, framework: "react" },
  { pattern: /\/pages\/|\/app\/(.*\/)?(page|layout|loading)\.(ts|js|tsx|jsx)$/, framework: "nextjs" },
  { pattern: /\.vue$/, framework: "vue" },
  { pattern: /\.svelte$/, framework: "svelte" },
  { pattern: /\/routes\/.*\+.*\.svelte$/, framework: "sveltekit" },
  { pattern: /\/src\/lib\/.*\.svelte$/, framework: "sveltekit" },
  { pattern: /\/templates\/.*\.html$|\/views\.py$/, framework: "django" },
  { pattern: /\/routers?\/.*\.py$|\/app\/.*\.py$/, framework: "fastapi" },
  { pattern: /\/controllers?\/|\/models?\/|\/views?\//, framework: "mvc" },
  {
    pattern: /\.test\.(ts|js|tsx|jsx)$|\.spec\.(ts|js|tsx|jsx)$|_test\.go$|(^|\/)test_[^/]+\.py$|_test\.py$/,
    framework: "testing",
  },
  { pattern: /Dockerfile|docker-compose/, framework: "docker" },
  { pattern: /\.tf$|\.hcl$/, framework: "terraform" },
  { pattern: /(^|[/.])k8s[./]|kubernetes|\/manifests\//, framework: "kubernetes" },
  { pattern: /\/prisma\//, framework: "prisma" },
  { pattern: /\/graphql\/|\.graphql$/, framework: "graphql" },
];

// Bash command → category mapping
const BASH_PATTERNS = [
  { pattern: /^npm\s|^npx\s|^yarn\s|^pnpm\s|^bun\s/, category: "node", stack: "javascript" },
  { pattern: /^pip\s|^pip3\s|^python|^uv\s|^poetry\s|^pdm\s/, category: "python", stack: "python" },
  { pattern: /^cargo\s|^rustup\s|^rustc\s/, category: "rust", stack: "rust" },
  { pattern: /^go\s/, category: "go", stack: "go" },
  { pattern: /^docker\s|^docker-compose\s/, category: "docker", stack: "devops" },
  { pattern: /^kubectl\s|^helm\s|^k9s\s/, category: "kubernetes", stack: "devops" },
  { pattern: /^terraform\s|^tf\s/, category: "terraform", stack: "devops" },
  { pattern: /^aws\s|^gcloud\s|^az\s/, category: "cloud-cli", stack: "devops" },
  { pattern: /^git\s/, category: "git", stack: null },
  { pattern: /^make\s|^cmake\s/, category: "build", stack: null },
  { pattern: /^jest\s|^vitest\s|^mocha\s|^pytest\s|^go test/, category: "testing", stack: null },
  { pattern: /^tsc\s|^tsx\s|^ts-node\s/, category: "typescript", stack: "typescript" },
  { pattern: /^ruby\s|^gem\s|^bundle\s|^rails\s/, category: "ruby", stack: "ruby" },
  { pattern: /^java\s|^javac\s|^mvn\s|^gradle\s/, category: "java", stack: "java" },
  { pattern: /^swift\s|^swiftc\s|^xcodebuild\s/, category: "swift", stack: "swift" },
  { pattern: /^curl\s|^wget\s|^httpie\s/, category: "http", stack: null },
  { pattern: /^psql\s|^mysql\s|^mongo\s|^redis-cli\s|^sqlite3\s/, category: "database", stack: null },
];

// Project marker files → stack
const PROJECT_MARKERS = [
  { file: "package.json", stack: "javascript" },
  { file: "tsconfig.json", stack: "typescript" },
  { file: "Cargo.toml", stack: "rust" },
  { file: "go.mod", stack: "go" },
  { file: "requirements.txt", stack: "python" },
  { file: "pyproject.toml", stack: "python" },
  { file: "setup.py", stack: "python" },
  { file: "Pipfile", stack: "python" },
  { file: "Gemfile", stack: "ruby" },
  { file: "pom.xml", stack: "java" },
  { file: "build.gradle", stack: "java" },
  { file: "Package.swift", stack: "swift" },
  { file: "mix.exs", stack: "elixir" },
  { file: "composer.json", stack: "php" },
  { file: "pubspec.yaml", stack: "dart" },
  { file: "Dockerfile", stack: "docker" },
  { file: "docker-compose.yml", stack: "docker" },
  { file: "terraform.tf", stack: "terraform" },
  { file: ".sol", stack: "solidity" },
  { file: "foundry.toml", stack: "solidity" },
  { file: "hardhat.config.js", stack: "solidity" },
  { file: "Move.toml", stack: "move" },
  { file: "next.config.js", stack: "nextjs" },
  { file: "next.config.mjs", stack: "nextjs" },
  { file: "next.config.ts", stack: "nextjs" },
  { file: "nuxt.config.ts", stack: "nuxt" },
  { file: "svelte.config.js", stack: "sveltekit" },
  { file: "vite.config.ts", stack: "vite" },
  { file: "vite.config.js", stack: "vite" },
  { file: "tailwind.config.js", stack: "tailwind" },
  { file: "tailwind.config.ts", stack: "tailwind" },
  { file: "prisma/schema.prisma", stack: "prisma" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGitBranch() {
  try {
    return (
      execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function getGitRepoName() {
  try {
    const remote = execSync("git remote get-url origin 2>/dev/null", {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    // Extract org/repo from URL
    const match = remote.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function detectProjectStack(cwd) {
  if (!cwd) return [];
  const stacks = [];
  for (const marker of PROJECT_MARKERS) {
    try {
      const markerPath = marker.file.includes("/") ? path.join(cwd, marker.file) : path.join(cwd, marker.file);
      if (fs.existsSync(markerPath)) {
        stacks.push(marker.stack);
      }
    } catch {
      // ignore
    }
  }
  return [...new Set(stacks)];
}

function extractLangFromPath(filePath) {
  if (!filePath) return null;
  const ext = path.extname(filePath).toLowerCase();
  // Special case: Dockerfile has no extension
  if (path.basename(filePath) === "Dockerfile") return "docker";
  return EXT_TO_LANG[ext] || null;
}

function extractFrameworksFromPath(filePath) {
  if (!filePath) return [];
  const frameworks = [];
  for (const { pattern, framework } of PATH_FRAMEWORK_PATTERNS) {
    if (pattern.test(filePath)) {
      frameworks.push(framework);
    }
  }
  return frameworks;
}

function classifyBashCommand(command) {
  if (!command || typeof command !== "string") return { category: null, stack: null };
  const trimmed = command.trim();
  for (const { pattern, category, stack } of BASH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category, stack };
    }
  }
  return { category: null, stack: null };
}

function estimateEditSize(toolInput) {
  if (!toolInput) return null;
  const oldLen = (toolInput.old_string || "").length;
  const newLen = (toolInput.new_string || "").length;
  const contentLen = (toolInput.content || "").length;
  if (contentLen > 0) return { type: "write", chars: contentLen };
  if (oldLen > 0 || newLen > 0) {
    return { type: "edit", chars_removed: oldLen, chars_added: newLen };
  }
  return null;
}

function readStdin() {
  try {
    const fd = fs.openSync("/dev/stdin", "r");
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length);
    fs.closeSync(fd);
    if (bytesRead === 0) return null;
    return JSON.parse(buf.toString("utf8", 0, bytesRead));
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────��────────────────────────────────────────

function main() {
  const input = readStdin();
  if (!input || !input.hook_event_name) return;

  const storage = new Storage();
  if (storage.isPaused()) return;

  const sid = input.session_id || null;
  const ts = new Date().toISOString();

  switch (input.hook_event_name) {
    case "SessionStart": {
      const cwd = input.cwd || process.cwd();
      const projectStacks = detectProjectStack(cwd);
      storage.appendEvent({
        type: "session_start",
        ts,
        sid,
        model: input.model || null,
        source: input.source || "startup",
        cwd,
        branch: getGitBranch(),
        repo: getGitRepoName(),
        project_stacks: projectStacks,
        platform: os.platform(),
        arch: os.arch(),
        node_version: process.version,
      });
      break;
    }

    case "SessionEnd": {
      storage.appendEvent({
        type: "session_end",
        ts,
        sid,
        reason: input.reason || null,
      });
      break;
    }

    case "PostToolUse": {
      const toolName = input.tool_name || "unknown";
      const toolInput = input.tool_input || {};
      const filePath = toolInput.file_path || toolInput.path || null;
      const lang = extractLangFromPath(filePath);
      const frameworks = extractFrameworksFromPath(filePath);
      const editSize = toolName === "Edit" || toolName === "Write" ? estimateEditSize(toolInput) : null;

      // For Bash tool, classify the command
      let bashInfo = null;
      if (toolName === "Bash" && toolInput.command) {
        bashInfo = classifyBashCommand(toolInput.command);
        bashInfo.command_preview = toolInput.command.substring(0, 120);
      }

      // For Grep/Glob, capture the pattern
      let searchInfo = null;
      if ((toolName === "Grep" || toolName === "Glob") && toolInput.pattern) {
        searchInfo = { pattern: toolInput.pattern.substring(0, 100) };
        if (toolInput.glob) searchInfo.glob = toolInput.glob;
      }

      storage.appendEvent({
        type: "tool_use",
        ts,
        sid,
        tool: toolName,
        file_path: filePath,
        lang,
        frameworks: frameworks.length > 0 ? frameworks : undefined,
        edit_size: editSize || undefined,
        bash: bashInfo || undefined,
        search: searchInfo || undefined,
      });
      break;
    }

    case "PostToolUseFailure": {
      const toolName = input.tool_name || "unknown";
      const error = input.error || null;
      const toolInput = input.tool_input || {};
      const filePath = toolInput.file_path || toolInput.path || null;
      const lang = extractLangFromPath(filePath);
      storage.appendEvent({
        type: "tool_failure",
        ts,
        sid,
        tool: toolName,
        error,
        file_path: filePath,
        lang,
      });
      break;
    }

    case "Stop": {
      storage.appendEvent({
        type: "turn_complete",
        ts,
        sid,
      });
      break;
    }

    case "StopFailure": {
      const errorType = input.error_type || input.reason || "unknown";
      storage.appendEvent({
        type: "turn_error",
        ts,
        sid,
        error_type: errorType,
      });
      break;
    }

    case "UserPromptSubmit": {
      const prompt = input.prompt || "";
      const match = prompt.match(/^\s*\/(\S+)/);
      if (match) {
        storage.appendEvent({
          type: "slash_command",
          ts,
          sid,
          command: match[1],
        });
      }
      break;
    }

    case "PreToolUse": {
      if (input.tool_name === "Skill" && input.tool_input) {
        const skillName = input.tool_input.skill || null;
        if (skillName) {
          storage.appendEvent({
            type: "slash_command",
            ts,
            sid,
            command: skillName,
          });
        }
      }
      break;
    }

    case "SubagentStart": {
      storage.appendEvent({
        type: "subagent_start",
        ts,
        sid,
        agent_type: input.agent_type || "unknown",
        agent_id: input.agent_id || null,
      });
      break;
    }

    case "SubagentStop": {
      storage.appendEvent({
        type: "subagent_stop",
        ts,
        sid,
        agent_type: input.agent_type || "unknown",
        agent_id: input.agent_id || null,
      });
      break;
    }

    default:
      break;
  }
}

// Run main() only when executed directly (not imported for testing)
const isDirectRun =
  process.argv[1] && (process.argv[1].endsWith("/tracker.js") || process.argv[1].endsWith("\\tracker.js"));
if (isDirectRun) {
  main();
}

export {
  EXT_TO_LANG,
  PATH_FRAMEWORK_PATTERNS,
  BASH_PATTERNS,
  PROJECT_MARKERS,
  getGitBranch,
  getGitRepoName,
  detectProjectStack,
  extractLangFromPath,
  extractFrameworksFromPath,
  classifyBashCommand,
  estimateEditSize,
  readStdin,
  main,
};
