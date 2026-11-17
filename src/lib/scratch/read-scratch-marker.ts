import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_MARKER_FILE } from './scratch.constants.ts'

import type { ScratchMarker } from './scratch.types.ts'

/** The `scratch.json` of a scratch folder; undefined when it is missing, unreadable or not a marker. */
export function readScratchMarker(folder: string): ScratchMarker | undefined {
	try {
		const read: unknown = JSON.parse(readFileSync(join(folder, SCRATCH_MARKER_FILE), 'utf8'))
		if (typeof read !== 'object' || read === null) return undefined
		const { pid, startedAt, command } = read as Record<string, unknown>
		return Number.isInteger(pid) &&
			typeof pid === 'number' &&
			pid > 0 &&
			typeof startedAt === 'string'
			? { pid, startedAt, command: typeof command === 'string' ? command : '' }
			: undefined
	} catch {
		return undefined
	}
}
