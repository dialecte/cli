import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { scratchRoot } from './scratch-root.ts'
import { SCRATCH_MARKER_FILE } from './scratch.constants.ts'

import type { ScratchContext, ScratchMarker } from './scratch.types.ts'

/**
 * A new folder under the scratch root (made when missing), named `<purpose><random>`, holding `scratch.json` with
 * this process's pid, the time it was made and the command line: what `worktree prune` and `health` read.
 */
export function makeScratchFolder(params: { purpose: string } & ScratchContext): string {
	const root = params.root ?? scratchRoot({ env: params.env, cwd: params.cwd })
	mkdirSync(root, { recursive: true })
	const folder = mkdtempSync(join(root, params.purpose))
	writeScratchMarker(folder)
	return folder
}

/** Writes the folder's `scratch.json`: this process's pid, the time now and the command line. */
export function writeScratchMarker(folder: string): void {
	const marker: ScratchMarker = {
		pid: process.pid,
		startedAt: new Date().toISOString(),
		command: process.argv.slice(1).join(' '),
	}
	writeFileSync(join(folder, SCRATCH_MARKER_FILE), `${JSON.stringify(marker)}\n`)
}
