### Added

- `dialecte plan mark <plan.md> <id> superseded --by <who> --reason <text> [--replaced-by <id>]...` closes an entry that other entries replaced, whatever its kind. `plan next` reads it as done, so nothing waits on it, and `--all` lists it as `<id> (superseded by <ids>)`. The replacing entries are recorded with the mark. They do not take over its dependents: a dependent that needs their work names them in its `dependsOn`.

### Fixed

- `dialecte rules` and the hand-over's reference guard no longer report a consumer name (or a forbidden word) that is an uppercase SQL keyword inside an SQL string of code: a string, a template literal's text or a `+` chain of them that starts with an SQL statement keyword (`DELETE FROM t WHERE id = ?`). The same word in prose, comments, docs, identifiers and other strings is still reported.
