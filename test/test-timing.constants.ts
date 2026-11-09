/**
 * The bound of a case that makes scratch repositories and runs whole hand-overs through them (git, npx, hooks,
 * clones, dozens of times): a guard against a hang, never a measure of speed. Such a case takes 30-60 s on a quiet
 * machine and passed 60 s at a load of 30-80 with other suites running at full parallelism (2026-11-02): five
 * minutes is several times its quiet time. A hang inside a hand-over is stopped sooner by the run's own stall
 * watchdog.
 */
export const HANDOVER_CASE_TIMEOUT = 300_000

/**
 * The bound of a case that runs `tdd red` and `tdd green` several times in a scratch package (each run starts
 * vitest): up to four vitest runs per case, the same bound as the neighbouring tdd scenarios (an estimate, not
 * measured): four minutes is a guard against a hang, never a measure of speed.
 */
export const HELPER_SCENARIO_TIMEOUT = 240_000

/**
 * The bound of a case that spawns an installed cli's `--help --json` (one node process) or runs a whole
 * `skills check` through one: a guard against a hang, never a measure of speed. A start takes well under a
 * second on a quiet machine and several on a loaded one; two minutes is far above both.
 */
export const CLI_SURFACE_CASE_TIMEOUT = 120_000

/**
 * The bound of a case of the lot store's file system helpers (records published, folders built, a scratch
 * repository's store found; a handful of file operations and at most one git setup): a guard against a hang, never
 * a measure of speed. Such a case takes well under a second on a quiet machine and several seconds on a loaded one
 * (the 30 s default has passed on a loaded machine for the neighbouring git cases); two minutes is far above both.
 */
export const STORE_CASE_TIMEOUT = 120_000

/**
 * The bound of a case that writes a few small files in a scratch tree and runs a `standard` command over them
 * (reads, hashes, writes an index folder; some load the installed dialecte's configuration): a guard against a
 * hang, never a measure of speed. A case takes well under a second on a quiet machine; two minutes is far above
 * a loaded one.
 */
export const STANDARD_DISK_CASE_TIMEOUT = 120_000

/**
 * The bound of a case that spawns one `bash` on a few-line probe script: a guard against a hang, never a measure
 * of speed. A start takes well under a second on a quiet machine and several on a loaded one; two minutes is far
 * above both.
 */
export const COMMIT_SCRIPT_PROBE_TIMEOUT = 120_000

/**
 * The bound of the unit case that matches a large synthetic table (8,000 cases of 5 source files) to its
 * sources: a guard against a quadratic match, never a measure of speed. A linear match takes well under a
 * second on a quiet machine; five seconds is several times that, and far below a quadratic one.
 */
export const MOVED_CASES_LARGE_TABLE_BOUND_MS = 5_000
