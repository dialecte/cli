### Added

- `dialecte contrib`'s `changelog` row, after `rules`: in a package keeping `changes/`, a change that edits `README.md` or the command map adds a changelog fragment `changes/<lot>.md`, or a no-entry note `changes/<lot>.none.md` holding why it has none; otherwise the row fails, naming the file. `dialecte changelog check` reads the notes (an empty one is a problem) and `release` deletes them with the fragments, without folding them.
