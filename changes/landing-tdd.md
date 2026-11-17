### Changed

- `lot start` and `lot status`: a working lot's manual next line follows the repository's landing flow: `run the stations, then dialecte lot land <name> --draft` in a CI-first repository, `handover write` elsewhere.
- `tdd red`, `tdd green`, `tdd status`, `gate --full` / `--release` and the commit hook measure from one base, the lot base (`gate --fast` still checks the uncommitted work, from HEAD, with no base to resolve; under `--full` the tdd step takes the gate's own base when it is the lot base, so a gate run resolves its base once): HEAD's fork point from the base branch (the newer of the local branch and origin's), or from an open stack parent's line. HEAD is no longer the default, so a green taken before a rebase still counts after it, and a plain `tdd green` proves the lot's committed cases again. `--base <ref>` stays the override, now in the command map (`skills check` accepts `tdd green --base`). The hygiene baseline no longer moves and the `worktree cut` fallbacks are gone. The commit hook's stale-green line names a plain `dialecte tdd green`.

### Fixed

- `tdd` reads test code through one presence map of the change: a test file deleted with plain `rm` or `mv`, not staged, in a package whose vitest setup files import a helper, no longer crashes `tdd` with ENOENT; it reads as deleted. A `gone` or `moved` entry of the lot file naming a path the change leaves present and unchanged, or one known nowhere, is refused in one line naming its `lot gone --remove` or `lot moved --remove`.
