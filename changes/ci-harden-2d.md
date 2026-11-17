### Changed

- `dialecte contrib`'s changelog row: the files that ask for a changelog fragment are `README.md` and anything under `doc/` in every package, plus the package's own list in its package.json, `dialecte.changelog.asking` (paths; a folder ends in `/`). The cli lists its command map there; no other package is asked about a cli file. A list that is not one of paths fails the row naming the field.
- `dialecte rules`: a `raw-git-repository` finding sits on the argument that makes the repository (the `clone`/`init` element of a list written in the call, the reference to a same-file const, the shell string), so a new argument line under an unchanged call is an error, not a warning about a line the change did not add.
