### Changed

- The command reference moved out of the README: every command has its page in `doc/commands/<command>.md`, its
  help generated at the top from the command map (`npm run doc:generate`), then what the command does in full;
  `doc/commands/index.md` lists the commands by family and the forms renamed in 1.0, each new form with its
  arguments. `npm run doc:check` (part of `npm run check`) fails naming a stale, missing or extra page, and fails
  when oxfmt cannot format the pages instead of taking them as written.
- `contrib`'s changelog row: a change to a page under `doc/commands/` asks for a changelog fragment, as a README
  or help change does.

### Fixed

- `lot land --help` says what it lands: the committed HEAD, uncommitted files left in the worktree and named, and
  the heads its rebases replaced kept in `landing.json`.
- `lot --help` and the `lot scope` usage line name `--overlap-ok` on `lot start` and `lot scope`; the `lot scope`
  note no longer says an add meeting another open lot is always refused.
