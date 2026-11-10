/**
 * The text written to the standard error descriptor through `writeSync` (what the step recorder's warnings use). It
 * imports nothing from `node:fs`: a test file's `vi.mock('node:fs', ...)` factory loads it.
 */
import { STANDARD_ERROR } from './standard-error-capture.constants.ts'

/** The lines captured since the last reset. */
const captured: string[] = []

/** Forgets what was captured. */
export function resetCapturedStandardError(): void {
	captured.length = 0
}

/** The lines (without their line break) written to descriptor 2 since the last reset. */
export function capturedStandardErrorLines(): string[] {
	return [...captured]
}

/**
 * The `node:fs` module with `writeSync` recording what goes to descriptor 2 (and still writing it). Pass the original
 * module and a recording-aware `writeSync` wrapper is returned in its place.
 */
export function withCapturedStandardError<Module extends { writeSync: (...args: any[]) => number }>(
	actual: Module,
): Module {
	return {
		...actual,
		writeSync(...args: Parameters<Module['writeSync']>) {
			if (args[0] === STANDARD_ERROR && typeof args[1] === 'string')
				captured.push(args[1].trimEnd())
			return actual.writeSync(...args)
		},
	}
}
