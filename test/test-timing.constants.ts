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
