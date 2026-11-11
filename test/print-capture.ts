/** Captures what a call writes to standard output and standard error, writing nothing itself. */
import { vi } from 'vitest'

import type { CapturedWrites } from './print-capture.types.ts'

/** The chunks `call` writes to each stream; the real writers are put back when it returns or throws. */
export function writesOf(call: () => void): CapturedWrites {
	const written: CapturedWrites = { stdout: [], stderr: [] }
	const out = vi.spyOn(process.stdout, 'write').mockImplementation(function keepOut(chunk) {
		written.stdout.push(String(chunk))
		return true
	})
	const err = vi.spyOn(process.stderr, 'write').mockImplementation(function keepErr(chunk) {
		written.stderr.push(String(chunk))
		return true
	})
	try {
		call()
	} finally {
		out.mockRestore()
		err.mockRestore()
	}
	return written
}
