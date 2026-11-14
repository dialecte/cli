# Working on @dialecte/cli

Every coding agent working in this repository reads this file. Notes that hold only for one machine (local
paths, where the standard's text lives, a person's working setup) go in `AGENTS.local.md` beside it, which git
ignores; read it when it exists.

## First commands

<!-- dialecte-skills:session-check -->

At the start of a session, run `npx --no-install @dialecte/cli doctor --brief`: nothing printed means the Dialecte skills are in sync; otherwise each line is a problem with its fix.

<!-- /dialecte-skills:session-check -->

In this repository the cli is its own source: run `node src/cli.ts doctor --brief` instead, and
`node src/cli.ts skills sync` when it says so.

## Skills to load

Load `dialecte` first, then `dialecte-contributing` to change this package; to run a lot, `dialecte-lot`.
`node src/cli.ts skills sync` installs them where your agent reads skills.

## Before writing code

List what already covers the concept: `node src/cli.ts api find "<need>" --source`, `explain`, `--help` of
the command at hand, then a code search. Reuse what fits; a shared helper found wrong is fixed in place, never
forked.

## Answers

Lead with the result; keep a reply short: no repetition, no filler, in whole sentences a person can read in one
pass.

## Code rules

1. Never `any`.
2. Always narrow types.
3. Types in `*.types.ts`, constants in `*.constants.ts`; named functions; object parameters; no `await` inside
   an argument (`node src/cli.ts rules <files>` checks these).
4. Immutable operations: never mutate an input; return new values.
5. Files grouped by concern, not by technical layer.
6. Explicit context: no hidden state.
7. A registry is the one source: help, docs and skills read it, never restate it.

## Definition of Done

Tests first, red before green, co-located with the code.

- Every step: `node src/cli.ts tdd red` then `node src/cli.ts tdd green` for its cases, the tests related to
  the touched files, `npm run check`, and `node src/cli.ts rules` on the touched files.
- Every behaviour: `node src/cli.ts gate --fast`.
- Every lot: `node src/cli.ts gate --full` once, before the hand-over (`node src/cli.ts gate --help` prints the
  configured steps).
- A change to a command, a flag or a visible behaviour also updates the command's help, the README and adds a
  `## [Unreleased]` entry to `CHANGELOG.md`, in the same change.

## Stations

In a lot, each station changes only what its role may change (the role rule in `dialecte-lot`): reviewers change
nothing; the test station changes tests, test data and stub production code; the implementer changes production
code in scope and the CHANGELOG; only the lot session deletes.

## Never

- Commit, stage, push, stash, `git reset` / `restore` / `checkout --`, switch branches, or edit under `.git`,
  unless the person asks.
- Write a real person's name or handle in a committed file, test values included (use `reviewer`, `person-a`).
- Name a tool that consumes the package, a coding-agent host or a model in a committed file.
- Put the standard's text, file names or clause numbers in a committed file.
