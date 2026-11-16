### Changed

- The command reference moved out of the README: every command has its page in `doc/commands/<command>.md`, its
  help generated at the top from the command map (`npm run doc:generate`), then what the command does in full;
  `doc/commands/index.md` lists the commands by family and the forms renamed in 1.0. `npm run doc:check` (part of
  `npm run check`) fails naming a stale, missing or extra page.
- `contrib`'s changelog row: a change to a page under `doc/commands/` asks for a changelog fragment, as a README
  or help change does.
