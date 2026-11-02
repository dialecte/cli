/**
 * The bound of a case that makes scratch repositories and runs whole hand-overs through them (git, npx, hooks,
 * clones, dozens of times): a guard against a hang, never a measure of speed. Such a case takes 30-60 s on a quiet
 * machine and passed 60 s at a load of 30-80 with other suites running at full parallelism (2026-11-02): five
 * minutes is several times its quiet time. A hang inside a hand-over is stopped sooner by the run's own stall
 * watchdog.
 */
export const HANDOVER_CASE_TIMEOUT = 300_000
