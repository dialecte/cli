import type { MockInstance } from 'vitest'

/** The spies on the two standard streams' `write`, nothing reaching the terminal. */
export type StreamSpies = {
	stdout: MockInstance<typeof process.stdout.write>
	stderr: MockInstance<typeof process.stderr.write>
}
