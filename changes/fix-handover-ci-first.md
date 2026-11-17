### Fixed

- `handover write` and `handover run` (with or without `--rehearse`) refuse in a CI-first repository, exit 2, nothing written, and name the flow to use: commit on the lot branch through the hook, then `lot land <id> --draft`. A lot committed through `handover run` there was marked committed, and `lot land` then refused it. A repository is CI-first when its `.github/workflows/ci.yml` runs on `merge_group` and holds the `ci-ok` job; no config key. Other repositories keep the hand-over flow unchanged.
