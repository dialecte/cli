### Changed

- Every temporary folder the cli makes now lives under one scratch root: `DIALECTE_SCRATCH` when set (the test suite and CI set it), else the workspace's `.worktrees/_scratch` (beside the pool and the trash, on their volume), else `dialecte-scratch` in the system's temporary folder outside every workspace. Each folder is named with its purpose prefix and holds a `scratch.json` (`pid`, `startedAt`, `command`). The gate scope and scoped-tests folders, the check key's index copy, the tdd report, base-collect and base-red folders, the hand-over's trial and review indexes, its cli probe and hook log, and the command reference's format folder moved there, and so did `handover run --rehearse`'s rehearsal folder and clone; the hook's `TMPDIR` stays a short folder of its own under the system's short root on macOS and Linux (`dlt-hook-<random>`; the rehearsal folder's `.tmp` on Windows) so a tool's socket path stays within the 104-byte limit.
- `dialecte worktree prune` lists the scratch root's folders: one whose `scratch.json` names a process that is gone and that was made over a day ago goes to the trash (`.worktrees/_trash`, or the root's own `dialecte-trash` outside a workspace); a live, younger or unmarked one is kept with why.
- `dialecte health` and `dialecte inbox` read leaked scratch folders from the scratch root, and for one release also the `dialecte-*` folders earlier versions left in the system's temporary folder, so those are still named.
- `tdd` trashes base-run leftovers from the scratch root (and the system's temporary folder for earlier versions' folders), their owner read from `scratch.json`.

### Added

- `dialecte rules`: `bare-tmpdir` (error, allowable): a production file calling `tmpdir()` outside the scratch module is refused, naming `makeScratchFolder`; test files and test support keep their own helpers.
