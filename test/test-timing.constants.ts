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

/**
 * The bound of one spawned cli run of the print table (one node process refusing a forged argument at once): a
 * guard against a hang, never a measure of speed. A run takes about a second on a quiet machine and ten or more at a
 * load of 30-80 with other suites running; two minutes is far above both. A run past it is killed and reported.
 */
export const PRINT_ROW_TIMEOUT = 120_000

/** How many rows of the print table run side by side: a small pool, so the table does not load the machine on top of other suites. */
export const PRINT_POOL_SIZE = 4

/**
 * The share of the table case's bound that each spawned run adds: the bound of one run divided over the pool. The
 * case's bound is this times the number of runs (rows and JSON forms), so even every run hitting its own bound fits.
 */
export const PRINT_TABLE_TIMEOUT_PER_RUN = PRINT_ROW_TIMEOUT / PRINT_POOL_SIZE

/**
 * The kill bound of a spawned `lot wait` that must answer at once (a lot with nothing to play): a guard against a
 * wait that never ends, never a measure of speed. One node process answers in about a second on a quiet machine and
 * ten or more at a load of 30-80; ninety seconds is far above both and below the case's own bound.
 */
export const WAIT_KILL_BOUND_MS = 90_000

/**
 * How long a case polls for the file a fake editor records when `handover review` has spawned it: a guard against
 * an editor that never starts, never a measure of speed. A one-line shell script starts in well under a second on a
 * quiet machine and several seconds at a load of 30-80; ninety seconds is far above both and below the case's own
 * bound.
 */
export const EDITOR_RECORD_BOUND_MS = 90_000

/**
 * The kill bound of one spawned cli run of the `handover review` cases (one node process answering at once): a guard
 * against a hang, never a measure of speed. A run takes about a second on a quiet machine and ten or more at a load
 * of 30-80; ninety seconds is far above both.
 */
export const EDITOR_CLI_KILL_BOUND_MS = 90_000

/**
 * How long a case waits for a blocking fake editor to end once released: a guard against an editor that never
 * ends, never a measure of speed (the script looks for its release file every tenth of a second).
 */
export const EDITOR_EXIT_BOUND_MS = 90_000

/** The case bound of the `handover review` and card-row cases (scratch repositories, a spawn, a poll). */
export const EDITOR_CASE_TIMEOUT = HANDOVER_CASE_TIMEOUT

/**
 * The bound of a case that makes one or two scratch repositories (a few git commands each) and runs a command over
 * them in process: a guard against a hang, never a measure of speed. Such a case takes a fraction of a second on a
 * quiet machine and several seconds at a load of 30-80 with other suites running (the 30 s default has passed
 * there); two minutes is far above both.
 */
export const SCRATCH_GIT_CASE_TIMEOUT = 120_000

/**
 * The bound of a case that makes a scratch workspace (repositories, worktrees, a copied `node_modules`) and runs
 * `worktree add` or `worktree prune` over it: a guard against a hang, never a measure of speed. A case takes up
 * to three seconds on a quiet machine; the 60 s it had before was passed at a load of 20-55 with other suites
 * running, so five minutes (the hand-over cases' bound) is far above both.
 */
export const WORKSPACE_CASE_TIMEOUT = 300_000

/**
 * The bound of a case that walks every `.ts` file under the source folders and reads those it filters: a guard
 * against a hang, never a measure of speed. The walk takes under a second on a quiet machine; every file open
 * costs several milliseconds more when a virus scanner or other suites hold the disk, so two minutes is far
 * above both.
 */
export const SOURCE_TREE_SCAN_CASE_TIMEOUT = 120_000

/**
 * The bound of a case that runs the gate's steps on the real tools (vitest, tsc, oxlint, node --test, each spawned
 * through npx): a guard against a hang, never a measure of speed. A case takes a few seconds on a quiet machine, and
 * three of them passed the 30 s they had when the whole suite ran at full parallelism; four minutes is far above both.
 */
export const GATE_REAL_TOOLS_CASE_TIMEOUT = 240_000

/** How many seconds the stand-in cli that hangs on the probe sleeps: far longer than any bound a case measures. */
export const HANGING_CLI_SLEEP_SECONDS = 60

/**
 * The bound on how long the card may take when the repository's cli hangs on the probe (killed after the case's own
 * short probe timeout, never after its sleep): a guard against a probe that is not killed, never a measure of speed.
 * The kill takes a fraction of a second on a quiet machine and several seconds at a load of 30-80; thirty seconds is
 * far above both and half the sleep.
 */
export const HANGING_PROBE_ELAPSED_BOUND_MS = 30_000

/**
 * The kill bound of one of this package's own scoped gate steps run from its root (a shell, one node process, no
 * test started for the changed file the case lists): a guard against a step that starts a suite and never ends, never
 * a measure of speed. A step answers in about a second on a quiet machine and ten or more at a load of 30-80; three
 * minutes is far above both, and a hang fails the case in minutes, not hours.
 */
export const OWN_SCOPED_STEP_KILL_BOUND_MS = 180_000
