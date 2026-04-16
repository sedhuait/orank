# Contributing to orank

Thanks for wanting to help out. orank is a small, zero-runtime-dependency Claude Code plugin — the contribution bar is intentionally low.

## Quick start

```bash
git clone https://github.com/sedhuait/orank.git
cd orank
npm install
npm test
npm run lint
```

Requires Node >= 22.

## Development loop

The plugin source is in this repo; the *installed copy* that Claude Code runs lives at `~/.claude/plugins/cache/orank/orank/<version>/`. They are two different directories.

For fast iteration, symlink the installed copy to your working tree:

```bash
rm -rf ~/.claude/plugins/cache/orank/orank/0.2.0
ln -s "$(pwd)" ~/.claude/plugins/cache/orank/orank/0.2.0
```

Note that `claude plugin update orank@orank` will overwrite that symlink — just re-run the above when it does.

## Branching model

Trunk-based. `main` is always releasable.

- Cut a branch off `main`: `feat/short-name`, `fix/short-name`, or `chore/short-name`.
- Keep branches short-lived (hours to a day).
- Open a PR against `main`. CI must be green.
- Squash-merge. No merge commits.

Do **not** push to `main` directly — branch protection enforces this.

## Commit messages — Conventional Commits

Format: `<type>(<optional scope>): <subject>`

Types used by release-please:

| Type       | When to use                                      | Version bump |
| ---------- | ------------------------------------------------ | ------------ |
| `feat:`    | A new user-visible feature                       | minor        |
| `fix:`     | A bug fix                                        | patch        |
| `perf:`    | A performance improvement                        | patch        |
| `refactor:`| Internal restructuring, no behavior change       | patch        |
| `docs:`    | Docs only                                        | patch        |
| `chore:`   | Tooling, deps, misc — hidden from changelog      | none         |
| `test:`    | Test-only changes — hidden from changelog        | none         |
| `ci:`      | CI/CD changes — hidden from changelog            | none         |

Breaking changes: add `!` after the type or a `BREAKING CHANGE:` footer — triggers a major bump.

Examples:

- `feat(badges): add streak-based bonus XP`
- `fix(tracker): handle missing CLAUDE_SESSION_ID`
- `feat!: rename orank.score() to orank.rank()`

## Releases — automated via release-please

You don't manually bump versions. On every push to `main`, [`release-please`](https://github.com/googleapis/release-please) maintains a **standing Release PR** that accumulates commits, updates `package.json` + `.claude-plugin/plugin.json`, and prepends a CHANGELOG entry.

When you want to ship:

1. Review the Release PR ("chore: release X.Y.Z").
2. Merge it.
3. release-please creates the tag, GitHub Release, and CHANGELOG — automatically.

That's it. No manual tagging, no manual version bumps.

## Tests

We use [Vitest](https://vitest.dev/). Tests live in `tests/` and mirror the structure of `scripts/`.

```bash
npm test          # run all tests
npm test -- --watch
```

When you add behavior, add a test for it.

## Lint & format

We use [Biome](https://biomejs.dev/):

```bash
npm run lint       # check
npm run format     # auto-fix formatting
npm run check      # fix lint + format issues
```

CI runs `npm run lint` — it must pass.
