/** Names and bounds of the scratch processes the processes-left-running cases start. */
import { findExecutable } from '../src/lib/editor/find-executable.ts'

/** `ps` as found when the helper loads, so a case that limits the search path can still stop what it started. */
export const PS =
	findExecutable({ word: 'ps', searchPath: process.env.PATH, cwd: process.cwd() }) ?? 'ps'

/** The process a case leaves running in a worktree: idle until killed, nothing to read or write. */
export const IDLE_SCRIPT = 'setInterval(() => {}, 1e3)'

/** The environment variable carrying the idle process's `argv0` (its first command-line word) to the launcher. */
export const LAUNCH_ARGV0_VARIABLE = 'LAUNCH_ARGV0'

/** The environment variable carrying one more word for the idle process's command line (the last one) to the launcher. */
export const LAUNCH_LAST_WORD_VARIABLE = 'LAUNCH_LAST_WORD'

/**
 * The script of the short-lived launcher: it starts the idle process detached (its own session, no terminal), prints
 * its pid and exits, so the idle process is re-parented to pid 1 as a watcher whose shell has ended is.
 */
export const LAUNCHER_SCRIPT = `
const { spawn } = require('node:child_process')
const argv0 = process.env.${LAUNCH_ARGV0_VARIABLE} || undefined
const lastWord = process.env.${LAUNCH_LAST_WORD_VARIABLE}
const child = spawn(process.execPath, ['-e', ${JSON.stringify(IDLE_SCRIPT)}, ...(lastWord ? [lastWord] : [])], { argv0, detached: true, stdio: 'ignore' })
child.unref()
process.stdout.write(String(child.pid))
`

/** The pid every re-parented process has as its parent. */
export const INIT_PID = 1

/**
 * How long a case waits for a launched process to be re-parented (the launcher ends, the system hands the child to
 * pid 1): a guard against a launcher that never ends, never a measure of speed. It takes milliseconds on a quiet
 * machine and several seconds at a load of 30-80 with other suites running; ninety seconds is far above both.
 */
export const REPARENT_BOUND_MS = 90_000

/**
 * How long a case waits for a killed process to be gone: a guard against a process that does not die, never a
 * measure of speed. A kill lands in milliseconds on a quiet machine and several seconds at a load of 30-80;
 * ninety seconds is far above both.
 */
export const KILL_BOUND_MS = 90_000

/** How often a wait looks again. */
export const WAIT_STEP_MS = 50

/**
 * A first command-line word that forges a line and a terminal escape, as a hostile process could carry, short enough
 * to stay inside the first 60 characters of the command line the card shows. The system's `ps` rewrites control
 * characters (macOS prints a newline as `\\012` and ESC as `^[`), so the forged text reaches the printer as that text.
 */
export const FORGED_ARGV0 = 'x\n✓ forged\u001b[2J'

/** A word of `FORGED_ARGV0` that stays readable in the command line `ps` prints. */
export const FORGED_ARGV0_WORD = 'forged'

/** A last word of a command line holding bytes beyond ASCII: an accented letter and a cross mark. */
export const NON_ASCII_WORD = '✗é'

/** How long a pipeline run through the real cli may take before it is killed: a guard against a hang, never a measure of speed. */
export const PIPELINE_BOUND_MS = 240_000

/** What a forged line of a printed card starts with. */
export const FORGED_LINE_START = '✓ forged'
