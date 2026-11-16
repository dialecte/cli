### Fixed

- The cli's scoped `tests` step, given the gate's serial rerun (the failing test files and `--no-file-parallelism`), runs those files alone with `vitest run` instead of every related test serially: a flaky file no longer reruns the whole related set one file at a time (measured: 1 failing file of 361 held a commit hook over 20 minutes).
