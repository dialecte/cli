### Added

- `dialecte lot accept --remove <case>`, `lot revised --remove <case|file|glob>`, `lot gone --remove <file|glob>`: the entry written exactly so (each copy of it) leaves `.dialecte/lot.json`, the rest kept (a list left empty leaves the file). An entry its list does not hold is refused, naming the closest entries, nothing written. A receipt only exempts, so removing one makes `tdd` and the gate stricter, never looser: no proof asked. Receipts no longer need a hand edit to go.

- `dialecte lot moved <case> <case> <reason>` and `lot moved <file> <file|glob> <reason>`: a case of the lot moved by a split or a rename of its file or describe after its red (its own title is part of its test call) keeps its red. `tdd red` carries the earlier label's red under the new one (flag `moved`) when the case's test call is the one that red froze, the test code it reads (helpers, fixtures) is as that red froze it, and the case as written now does not pass on the base production (one base run for all such cases), so the next green proves it as any red; a call changed in the move is refused, and so is a case entry whose earlier case holds no red (a file entry then leaves the case to the normal path). The file form covers a whole split (`lot moved src/a.test.ts 'src/a-*.test.ts'`, the cases keeping their names) or a merge (one entry per earlier file). `lot moved --remove <from> <to>` drops an entry. An entry no case uses is named with its `--remove` command.

### Changed

- `dialecte lot land` titles the pull request with the lot's own commit message (the first commit lot of the brief in its store folder), never the branch's last commit: a merge of main or a helper commit no longer becomes the squash title on main. A brief with several commit lots lists the others in the body. An open pull request titled otherwise is retitled on the next landing (`gh pr edit --title`), its line saying so. A lot whose brief names no message is refused before anything is pushed.

- The gate's tdd step names each unused `accept`, `revised`, `gone` and `moved` entry with the closest real label of the change (a case, or a test file) and the command that drops it (`; drop it: dialecte lot <list> --remove <entry>`).
- `dialecte tdd` counts the suite infrastructure as production: the files the vitest configs name in `setupFiles` and `globalSetup`, and the test helpers they import. A lot that fixes the suite (a setup file, a guard, a helper the guard runs) gets a red -> green path: its tests red on the infrastructure as it is, green once it is fixed, the fix no longer read as test code changed after the red. A red run never freezes those files; a helper no setup file imports stays test code, and so does one that test files other than its own unit test import too (an assertion helper the setup also reads). Read from the vitest configs, no config field: a list, a spread and a const of the config file are followed; a value tdd cannot read (a call, an import) is named by `tdd status` (`unread  vitest.config.ts setupFiles  ...`), its files counted as test code.

- `dialecte tdd red` freezes a changed test helper no changed test file depends on through the unchanged test files importing it: they run with it, and when they pass the helper is frozen (`frozen  <helper>  through the unchanged test files importing it, which pass with it: ...`), so `tdd green` no longer refuses it. One failing with it, none found naming it, or more than 20 to run (shown as their own progress step) leaves it unfrozen with the reason; a `revised` entry naming it still freezes it. A red run with no test file changed runs for such a helper.

- The help of `dialecte gate --hook` says what the hook runs since it stopped running tests: the lot's tdd receipts, then the declared steps (the cli's `check` and `rules`), no test suite, CI running it on every push.

### Fixed

- `lot revised --remove <file>` no longer writes an entry named `--remove`.
