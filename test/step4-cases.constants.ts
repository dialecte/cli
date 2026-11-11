/** What the step-4 cases share: steps, durations, the changed-list variable and the texts the rules read. */
import { join } from 'node:path'

/** The cli's own entry, which a scratch gate's rules step runs. */
export const CLI_SOURCE = join(import.meta.dirname, '..', 'src', 'cli.ts')

/** The package root the own-package cases run from. */
export const PACKAGE_ROOT = join(import.meta.dirname, '..')

/** A gate step that passes. */
export const PASSING_STEP = { name: 'noop', run: 'true' }

/** Two hours and five minutes in milliseconds, and as the progress lines print it. */
export const SLEPT_MS = 7_500_000
export const SLEPT_DURATION = '2 h 5 m'

/** The variable a scoped step gets its changed list in. */
export const CHANGED_VARIABLE = 'DIALECTE_GATE_CHANGED'

/** A function declared as a constant (an error of the code rules), a clean function, and text no parser takes. */
export const BROKEN_TEXT = 'export const read = () => 1\n'
export const CLEAN_TEXT = 'export function read() {}\n'
export const UNPARSABLE_TEXT = 'export function {{{\n'

/** A base and a tree as the gate hands them to a scoped step. */
export const BASE = 'a'.repeat(40)
export const TREE = 'b'.repeat(40)

/**
 * The file the own-package cases list as the only changed one: it holds no code, no test relates to it, and the
 * scoped tests step asks for nothing because of it (a root note would run the whole suite of this package).
 */
export const ONLY_CHANGED_FILE = '.github/pull_request_template.md'
