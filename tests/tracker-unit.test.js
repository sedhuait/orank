import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  BASH_PATTERNS,
  EXT_TO_LANG,
  PATH_FRAMEWORK_PATTERNS,
  PROJECT_MARKERS,
  classifyBashCommand,
  detectProjectStack,
  estimateEditSize,
  extractFrameworksFromPath,
  extractLangFromPath,
  getGitBranch,
  getGitRepoName,
  main,
  readStdin,
} from "../scripts/tracker.js";

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTS VERIFICATION
// ─────────────────────────────────────────────────────────────────────────

describe("Constants", () => {
  test("EXT_TO_LANG has expected entries", () => {
    expect(EXT_TO_LANG[".js"]).toBe("javascript");
    expect(EXT_TO_LANG[".ts"]).toBe("typescript");
    expect(EXT_TO_LANG[".py"]).toBe("python");
    expect(EXT_TO_LANG[".rs"]).toBe("rust");
    expect(EXT_TO_LANG[".go"]).toBe("go");
    expect(EXT_TO_LANG[".rb"]).toBe("ruby");
    expect(Object.keys(EXT_TO_LANG).length).toBeGreaterThan(40);
  });

  test("PATH_FRAMEWORK_PATTERNS has expected entries", () => {
    expect(PATH_FRAMEWORK_PATTERNS.length).toBeGreaterThan(10);
    const frameworks = PATH_FRAMEWORK_PATTERNS.map((p) => p.framework);
    expect(frameworks).toContain("react");
    expect(frameworks).toContain("nextjs");
    expect(frameworks).toContain("vue");
    expect(frameworks).toContain("testing");
  });

  test("BASH_PATTERNS has expected entries", () => {
    expect(BASH_PATTERNS.length).toBeGreaterThan(10);
    const categories = BASH_PATTERNS.map((p) => p.category);
    expect(categories).toContain("node");
    expect(categories).toContain("python");
    expect(categories).toContain("git");
    expect(categories).toContain("docker");
  });

  test("PROJECT_MARKERS has expected entries", () => {
    expect(PROJECT_MARKERS.length).toBeGreaterThan(15);
    const files = PROJECT_MARKERS.map((m) => m.file);
    expect(files).toContain("package.json");
    expect(files).toContain("Cargo.toml");
    expect(files).toContain("go.mod");
    expect(files).toContain("Dockerfile");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// extractLangFromPath
// ─────────────────────────────────────────────────────────────────────────

describe("extractLangFromPath", () => {
  test("detects JavaScript files", () => {
    expect(extractLangFromPath("/src/app.js")).toBe("javascript");
    expect(extractLangFromPath("/src/app.mjs")).toBe("javascript");
    expect(extractLangFromPath("/src/app.cjs")).toBe("javascript");
  });

  test("detects TypeScript files", () => {
    expect(extractLangFromPath("/src/app.ts")).toBe("typescript");
    expect(extractLangFromPath("/src/app.tsx")).toBe("typescript");
    expect(extractLangFromPath("/src/app.mts")).toBe("typescript");
  });

  test("detects JSX files", () => {
    expect(extractLangFromPath("/src/Button.jsx")).toBe("javascript");
  });

  test("detects Python files", () => {
    expect(extractLangFromPath("/main.py")).toBe("python");
    expect(extractLangFromPath("/main.pyw")).toBe("python");
    expect(extractLangFromPath("/main.pyi")).toBe("python");
  });

  test("detects Rust files", () => {
    expect(extractLangFromPath("/src/lib.rs")).toBe("rust");
  });

  test("detects Go files", () => {
    expect(extractLangFromPath("/main.go")).toBe("go");
  });

  test("detects Java files", () => {
    expect(extractLangFromPath("/Main.java")).toBe("java");
  });

  test("detects Ruby files", () => {
    expect(extractLangFromPath("/app.rb")).toBe("ruby");
    expect(extractLangFromPath("/template.erb")).toBe("ruby");
  });

  test("detects CSS files", () => {
    expect(extractLangFromPath("/style.css")).toBe("css");
    expect(extractLangFromPath("/style.scss")).toBe("scss");
    expect(extractLangFromPath("/style.less")).toBe("less");
  });

  test("detects HTML files", () => {
    expect(extractLangFromPath("/index.html")).toBe("html");
    expect(extractLangFromPath("/template.htm")).toBe("html");
  });

  test("detects JSON files", () => {
    expect(extractLangFromPath("/package.json")).toBe("json");
    expect(extractLangFromPath("/tsconfig.jsonc")).toBe("json");
  });

  test("detects YAML files", () => {
    expect(extractLangFromPath("/config.yaml")).toBe("yaml");
    expect(extractLangFromPath("/config.yml")).toBe("yaml");
  });

  test("detects Markdown files", () => {
    expect(extractLangFromPath("/README.md")).toBe("markdown");
    expect(extractLangFromPath("/doc.mdx")).toBe("markdown");
  });

  test("detects SQL files", () => {
    expect(extractLangFromPath("/schema.sql")).toBe("sql");
  });

  test("detects Shell files", () => {
    expect(extractLangFromPath("/script.sh")).toBe("shell");
    expect(extractLangFromPath("/script.bash")).toBe("shell");
  });

  test("special case: Dockerfile returns docker", () => {
    expect(extractLangFromPath("/path/to/Dockerfile")).toBe("docker");
    expect(extractLangFromPath("Dockerfile")).toBe("docker");
  });

  test("returns null for null/undefined input", () => {
    expect(extractLangFromPath(null)).toBeNull();
    expect(extractLangFromPath(undefined)).toBeNull();
  });

  test("returns null for unknown extensions", () => {
    expect(extractLangFromPath("/file.unknown")).toBeNull();
    expect(extractLangFromPath("/file.xyz")).toBeNull();
  });

  test("returns null for files with no extension", () => {
    expect(extractLangFromPath("/Makefile")).toBeNull();
    expect(extractLangFromPath("/README")).toBeNull();
  });

  test("case insensitive extension matching", () => {
    expect(extractLangFromPath("/src/app.JS")).toBe("javascript");
    expect(extractLangFromPath("/src/app.PY")).toBe("python");
    expect(extractLangFromPath("/src/app.Ts")).toBe("typescript");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// extractFrameworksFromPath
// ─────────────────────────────────────────────────────────────────────────

describe("extractFrameworksFromPath", () => {
  test("detects React from /components/ pattern", () => {
    expect(extractFrameworksFromPath("/src/components/Button.tsx")).toContain("react");
  });

  test("detects React from .tsx extension", () => {
    expect(extractFrameworksFromPath("/Button.tsx")).toContain("react");
  });

  test("detects React from .jsx extension", () => {
    expect(extractFrameworksFromPath("/Button.jsx")).toContain("react");
  });

  test("detects Next.js from /pages/ pattern", () => {
    expect(extractFrameworksFromPath("/pages/index.tsx")).toContain("nextjs");
  });

  test("detects Next.js from /app/ pattern with page.tsx", () => {
    expect(extractFrameworksFromPath("/app/dashboard/page.tsx")).toContain("nextjs");
  });

  test("detects Next.js from /app/ pattern with layout.tsx", () => {
    expect(extractFrameworksFromPath("/app/layout.tsx")).toContain("nextjs");
  });

  test("detects Vue from .vue extension", () => {
    expect(extractFrameworksFromPath("/components/Button.vue")).toContain("vue");
  });

  test("detects Svelte from .svelte extension", () => {
    expect(extractFrameworksFromPath("/components/Button.svelte")).toContain("svelte");
  });

  test("detects SvelteKit from /routes/ pattern", () => {
    expect(extractFrameworksFromPath("/routes/+page.svelte")).toContain("sveltekit");
  });

  test("detects SvelteKit from /src/lib/ pattern", () => {
    expect(extractFrameworksFromPath("/src/lib/utils.svelte")).toContain("sveltekit");
  });

  test("detects Testing from .test.ts pattern", () => {
    expect(extractFrameworksFromPath("/src/app.test.ts")).toContain("testing");
  });

  test("detects Testing from .spec.js pattern", () => {
    expect(extractFrameworksFromPath("/src/app.spec.js")).toContain("testing");
  });

  test("detects Testing from _test.go pattern", () => {
    expect(extractFrameworksFromPath("/main_test.go")).toContain("testing");
  });

  test("detects Testing from _test.py pattern", () => {
    expect(extractFrameworksFromPath("/test_app.py")).toContain("testing");
  });

  test("detects Docker from Dockerfile pattern", () => {
    expect(extractFrameworksFromPath("/Dockerfile")).toContain("docker");
  });

  test("detects Docker from docker-compose pattern", () => {
    expect(extractFrameworksFromPath("/docker-compose.yml")).toContain("docker");
  });

  test("detects Terraform from .tf pattern", () => {
    expect(extractFrameworksFromPath("/main.tf")).toContain("terraform");
  });

  test("detects Terraform from .hcl pattern", () => {
    expect(extractFrameworksFromPath("/vars.hcl")).toContain("terraform");
  });

  test("detects Kubernetes from k8s. pattern", () => {
    expect(extractFrameworksFromPath("/k8s.yaml")).toContain("kubernetes");
  });

  test("detects Prisma from /prisma/ pattern", () => {
    expect(extractFrameworksFromPath("/prisma/schema.prisma")).toContain("prisma");
  });

  test("detects GraphQL from .graphql pattern", () => {
    expect(extractFrameworksFromPath("/schema.graphql")).toContain("graphql");
  });

  test("detects MVC from /controllers/ pattern", () => {
    expect(extractFrameworksFromPath("/app/controllers/user.py")).toContain("mvc");
  });

  test("returns empty array for null input", () => {
    expect(extractFrameworksFromPath(null)).toEqual([]);
  });

  test("returns empty array for undefined input", () => {
    expect(extractFrameworksFromPath(undefined)).toEqual([]);
  });

  test("returns empty array for non-matching path", () => {
    expect(extractFrameworksFromPath("/random/file.txt")).toEqual([]);
  });

  test("returns multiple frameworks for path matching multiple patterns", () => {
    // A file like /app/page.tsx matches both react (tsx) and nextjs (/app/)
    const frameworks = extractFrameworksFromPath("/app/page.tsx");
    expect(frameworks.length).toBeGreaterThanOrEqual(1);
    expect(frameworks).toContain("nextjs");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// classifyBashCommand
// ─────────────────────────────────────────────────────────────────────────

describe("classifyBashCommand", () => {
  test("classifies npm commands", () => {
    const result = classifyBashCommand("npm install foo");
    expect(result).toEqual({ category: "node", stack: "javascript" });
  });

  test("classifies npx commands", () => {
    const result = classifyBashCommand("npx create-react-app app");
    expect(result).toEqual({ category: "node", stack: "javascript" });
  });

  test("classifies yarn commands", () => {
    const result = classifyBashCommand("yarn add lodash");
    expect(result).toEqual({ category: "node", stack: "javascript" });
  });

  test("classifies pnpm commands", () => {
    const result = classifyBashCommand("pnpm install");
    expect(result).toEqual({ category: "node", stack: "javascript" });
  });

  test("classifies bun commands", () => {
    const result = classifyBashCommand("bun install");
    expect(result).toEqual({ category: "node", stack: "javascript" });
  });

  test("classifies pip commands", () => {
    const result = classifyBashCommand("pip install numpy");
    expect(result).toEqual({ category: "python", stack: "python" });
  });

  test("classifies pip3 commands", () => {
    const result = classifyBashCommand("pip3 install django");
    expect(result).toEqual({ category: "python", stack: "python" });
  });

  test("classifies python commands", () => {
    const result = classifyBashCommand("python script.py");
    expect(result).toEqual({ category: "python", stack: "python" });
  });

  test("classifies poetry commands", () => {
    const result = classifyBashCommand("poetry add flask");
    expect(result).toEqual({ category: "python", stack: "python" });
  });

  test("classifies uv commands", () => {
    const result = classifyBashCommand("uv pip install requests");
    expect(result).toEqual({ category: "python", stack: "python" });
  });

  test("classifies cargo commands", () => {
    const result = classifyBashCommand("cargo build");
    expect(result).toEqual({ category: "rust", stack: "rust" });
  });

  test("classifies rustup commands", () => {
    const result = classifyBashCommand("rustup update");
    expect(result).toEqual({ category: "rust", stack: "rust" });
  });

  test("classifies go commands", () => {
    const result = classifyBashCommand("go build");
    expect(result).toEqual({ category: "go", stack: "go" });
  });

  test("classifies docker commands", () => {
    const result = classifyBashCommand("docker build -t myapp .");
    expect(result).toEqual({ category: "docker", stack: "devops" });
  });

  test("classifies docker-compose commands", () => {
    const result = classifyBashCommand("docker-compose up");
    expect(result).toEqual({ category: "docker", stack: "devops" });
  });

  test("classifies kubectl commands", () => {
    const result = classifyBashCommand("kubectl apply -f config.yaml");
    expect(result).toEqual({ category: "kubernetes", stack: "devops" });
  });

  test("classifies helm commands", () => {
    const result = classifyBashCommand("helm install release mychart");
    expect(result).toEqual({ category: "kubernetes", stack: "devops" });
  });

  test("classifies terraform commands", () => {
    const result = classifyBashCommand("terraform plan");
    expect(result).toEqual({ category: "terraform", stack: "devops" });
  });

  test("classifies aws commands", () => {
    const result = classifyBashCommand("aws s3 ls");
    expect(result).toEqual({ category: "cloud-cli", stack: "devops" });
  });

  test("classifies git commands", () => {
    const result = classifyBashCommand("git status");
    expect(result).toEqual({ category: "git", stack: null });
  });

  test("classifies make commands", () => {
    const result = classifyBashCommand("make build");
    expect(result).toEqual({ category: "build", stack: null });
  });

  test("classifies jest commands", () => {
    const result = classifyBashCommand("jest src/__tests__");
    expect(result).toEqual({ category: "testing", stack: null });
  });

  test("classifies vitest commands", () => {
    const result = classifyBashCommand("vitest run");
    expect(result).toEqual({ category: "testing", stack: null });
  });

  test("classifies pytest commands", () => {
    const result = classifyBashCommand("pytest tests/");
    expect(result).toEqual({ category: "testing", stack: null });
  });

  test("classifies curl commands", () => {
    const result = classifyBashCommand("curl https://example.com");
    expect(result).toEqual({ category: "http", stack: null });
  });

  test("classifies wget commands", () => {
    const result = classifyBashCommand("wget https://example.com/file");
    expect(result).toEqual({ category: "http", stack: null });
  });

  test("classifies psql commands", () => {
    const result = classifyBashCommand("psql -U user -d database");
    expect(result).toEqual({ category: "database", stack: null });
  });

  test("classifies mysql commands", () => {
    const result = classifyBashCommand("mysql -u root -p");
    expect(result).toEqual({ category: "database", stack: null });
  });

  test("classifies redis-cli commands", () => {
    const result = classifyBashCommand("redis-cli SET key value");
    expect(result).toEqual({ category: "database", stack: null });
  });

  test("returns null category for unknown commands", () => {
    const result = classifyBashCommand("echo hello");
    expect(result).toEqual({ category: null, stack: null });
  });

  test("returns null category for ls command", () => {
    const result = classifyBashCommand("ls -la");
    expect(result).toEqual({ category: null, stack: null });
  });

  test("handles null input", () => {
    const result = classifyBashCommand(null);
    expect(result).toEqual({ category: null, stack: null });
  });

  test("handles undefined input", () => {
    const result = classifyBashCommand(undefined);
    expect(result).toEqual({ category: null, stack: null });
  });

  test("handles empty string input", () => {
    const result = classifyBashCommand("");
    expect(result).toEqual({ category: null, stack: null });
  });

  test("handles non-string input", () => {
    const result = classifyBashCommand(123);
    expect(result).toEqual({ category: null, stack: null });
  });

  test("handles whitespace-only input", () => {
    const result = classifyBashCommand("   ");
    expect(result).toEqual({ category: null, stack: null });
  });

  test("trims leading/trailing whitespace before matching", () => {
    const result = classifyBashCommand("  npm install  ");
    expect(result).toEqual({ category: "node", stack: "javascript" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// estimateEditSize
// ─────────────────────────────────────────────────────────────────────────

describe("estimateEditSize", () => {
  test("detects write with content field", () => {
    const result = estimateEditSize({ content: "hello world" });
    expect(result).toEqual({ type: "write", chars: 11 });
  });

  test("detects write with empty content", () => {
    const result = estimateEditSize({ content: "" });
    expect(result).toBeNull();
  });

  test("detects edit with old_string and new_string", () => {
    const result = estimateEditSize({
      old_string: "abc",
      new_string: "defgh",
    });
    expect(result).toEqual({ type: "edit", chars_removed: 3, chars_added: 5 });
  });

  test("detects edit with only old_string (deletion)", () => {
    const result = estimateEditSize({ old_string: "removed text" });
    expect(result).toEqual({ type: "edit", chars_removed: 12, chars_added: 0 });
  });

  test("detects edit with only new_string (insertion)", () => {
    const result = estimateEditSize({ new_string: "added text" });
    expect(result).toEqual({ type: "edit", chars_removed: 0, chars_added: 10 });
  });

  test("prioritizes content over old_string/new_string", () => {
    const result = estimateEditSize({
      content: "write content",
      old_string: "old",
      new_string: "new",
    });
    expect(result).toEqual({ type: "write", chars: 13 });
  });

  test("returns null for empty object", () => {
    const result = estimateEditSize({});
    expect(result).toBeNull();
  });

  test("returns null for null input", () => {
    const result = estimateEditSize(null);
    expect(result).toBeNull();
  });

  test("returns null for undefined input", () => {
    const result = estimateEditSize(undefined);
    expect(result).toBeNull();
  });

  test("handles missing fields as empty strings", () => {
    const result = estimateEditSize({ content: undefined, old_string: undefined });
    expect(result).toBeNull();
  });

  test("counts multi-byte characters correctly", () => {
    const result = estimateEditSize({ content: "café" });
    expect(result.chars).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// detectProjectStack
// ─────────────────────────────────────────────────────────────────────────

describe("detectProjectStack", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orank-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("detects javascript from package.json", () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("javascript");
  });

  test("detects rust from Cargo.toml", () => {
    fs.writeFileSync(path.join(tempDir, "Cargo.toml"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("rust");
  });

  test("detects go from go.mod", () => {
    fs.writeFileSync(path.join(tempDir, "go.mod"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("go");
  });

  test("detects python from requirements.txt", () => {
    fs.writeFileSync(path.join(tempDir, "requirements.txt"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("python");
  });

  test("detects python from pyproject.toml", () => {
    fs.writeFileSync(path.join(tempDir, "pyproject.toml"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("python");
  });

  test("detects ruby from Gemfile", () => {
    fs.writeFileSync(path.join(tempDir, "Gemfile"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("ruby");
  });

  test("detects docker from Dockerfile", () => {
    fs.writeFileSync(path.join(tempDir, "Dockerfile"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("docker");
  });

  test("detects nextjs from next.config.js", () => {
    fs.writeFileSync(path.join(tempDir, "next.config.js"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("nextjs");
  });

  test("detects prisma from nested prisma/schema.prisma", () => {
    fs.mkdirSync(path.join(tempDir, "prisma"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "prisma", "schema.prisma"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("prisma");
  });

  test("deduplicates stacks", () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{}");
    const stacks = detectProjectStack(tempDir);
    expect(stacks.filter((s) => s === "javascript").length).toBe(1);
  });

  test("detects multiple stacks", () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tempDir, "Dockerfile"), "");
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toContain("javascript");
    expect(stacks).toContain("docker");
    expect(stacks.length).toBe(2);
  });

  test("returns empty array for empty directory", () => {
    const stacks = detectProjectStack(tempDir);
    expect(stacks).toEqual([]);
  });

  test("returns empty array for null cwd", () => {
    const stacks = detectProjectStack(null);
    expect(stacks).toEqual([]);
  });

  test("returns empty array for undefined cwd", () => {
    const stacks = detectProjectStack(undefined);
    expect(stacks).toEqual([]);
  });

  test("handles non-existent directory gracefully", () => {
    const stacks = detectProjectStack("/non/existent/path/12345");
    expect(stacks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// getGitBranch
// ─────────────────────────────────────────────────────────────────────────

describe("getGitBranch", () => {
  test("returns a string or null", () => {
    const result = getGitBranch();
    expect(typeof result === "string" || result === null).toBe(true);
  });

  test("does not throw on error", () => {
    expect(() => getGitBranch()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// getGitRepoName
// ─────────────────────────────────────────────────────────────────────────

describe("getGitRepoName", () => {
  test("returns a string or null", () => {
    const result = getGitRepoName();
    expect(typeof result === "string" || result === null).toBe(true);
  });

  test("does not throw on error", () => {
    expect(() => getGitRepoName()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// readStdin
// ─────────────────────────────────────────────────────────────────────────

describe("readStdin", () => {
  test("function exists and is callable", () => {
    expect(typeof readStdin).toBe("function");
  });

  test("returns null when stdin is empty", () => {
    // Stub sync fs calls so readStdin does not block on a real TTY.
    const openSpy = vi.spyOn(fs, "openSync").mockReturnValue(99);
    const readSpy = vi.spyOn(fs, "readSync").mockReturnValue(0);
    const closeSpy = vi.spyOn(fs, "closeSync").mockReturnValue(undefined);
    try {
      expect(readStdin()).toBeNull();
    } finally {
      openSpy.mockRestore();
      readSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────

describe("main", () => {
  test("function exists and is callable", () => {
    expect(typeof main).toBe("function");
  });

  test("does not throw when stdin is empty", () => {
    // Stub sync fs calls so main -> readStdin does not block on a real TTY.
    const openSpy = vi.spyOn(fs, "openSync").mockReturnValue(99);
    const readSpy = vi.spyOn(fs, "readSync").mockReturnValue(0);
    const closeSpy = vi.spyOn(fs, "closeSync").mockReturnValue(undefined);
    try {
      expect(() => main()).not.toThrow();
    } finally {
      openSpy.mockRestore();
      readSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });
});
