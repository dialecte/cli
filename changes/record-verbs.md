### Added

- `dialecte lot accept --remove <case>`, `lot revised --remove <case|file|glob>`, `lot gone --remove <file|glob>`: the entry written exactly so leaves `.dialecte/lot.json`, the rest kept (a list left empty leaves the file). An entry its list does not hold is refused, naming the closest entries, nothing written. A receipt only exempts, so removing one makes `tdd` and the gate stricter, never looser: no proof asked. Receipts no longer need a hand edit to go.

### Changed

- `dialecte lot land` titles the pull request with the lot's own commit message (the first commit lot of the brief in its store folder), never the branch's last commit: a merge of main or a helper commit no longer becomes the squash title on main. A brief with several commit lots lists the others in the body. An open pull request titled otherwise is retitled on the next landing (`gh pr edit --title`), its line saying so. A lot whose brief names no message is refused before anything is pushed.

### Fixed

- `lot revised --remove <file>` no longer writes an entry named `--remove`.
