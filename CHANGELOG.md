# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `--help` (or `-h`) after any command prints the help and runs nothing: `dialecte bench --help` no longer runs the bench and rewrites the baseline.

### Changed

- `coverage` writes its temporary discovery file under `node_modules/.cache/dialecte/`, out of reach of formatters, linters and git.

### Added

- `dialecte skills sync`: installs the agent skills your dependencies ship in `skills/<name>/` into `.claude/skills` and `.agents/skills` (`--agent claude,copilot,agents`, `--copy` instead of links, `--from <folder>` to take them from local checkouts). Only what it installed is ever replaced or removed.
- `dialecte skills generate`: rewrites the generated blocks of your skills from the source: verb map of your extensions, core method index, hook files, and the API index (`api`: every method with its JSDoc summary and `@intent` tags; `intents`: "when you need to... → use").
- `dialecte skills check`: fails when a skill cites an API, a path or an npm script that does not exist, links to a missing page, has invalid frontmatter or a stale generated block, or when a public method the package defines has no JSDoc summary or no `@intent` tag. It warns when a summary or an intent quotes a sentence, since the generated pages republish the JSDoc. `--workspace <folder>` also verifies pages that describe several repositories.

## [0.1.0] - 2026-10-14

### Changed

- **Breaking:** `coverage` reads enumerations from the attribute's datatype, as `@dialecte/create` 0.1 writes them: regenerate your dialecte, then your coverage files.

## [0.0.3] - 2026-09-29

### Fixed

- `bench` measures only your own types: library declaration files are skipped, so a library's typing or a library error no longer moves the numbers. Regenerate your baseline once with this version.
