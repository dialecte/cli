/** A seam for the store's whole-file writes: it looks at the final name while the temporary file waits to be published. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { TEMPORARY_INFIX_PROBE, PERMISSION_BITS } from './replacement-observer.constants.ts'

import type { ReplacementObservation, ReplacementObserver } from './replacement-observer.types.ts'

/** An observer of the writes of `path`: pass its `seam` as `afterTemporaryWritten`, read `observations` after. */
export function observeReplacement(params: { path: string }): ReplacementObserver {
	const observations: ReplacementObservation[] = []
	const temporaryInodes: number[] = []
	function seam(temporaryPath: string): void {
		temporaryInodes.push(statSync(temporaryPath).ino)
		observations.push({
			temporaryIsOwn: isOwnTemporary({ temporaryPath, path: params.path }),
			temporaryBytes: readFileSync(temporaryPath),
			temporaryMode: statSync(temporaryPath).mode & PERMISSION_BITS,
			finalBytes: existsSync(params.path) ? readFileSync(params.path) : undefined,
		})
	}
	return { seam, observations, temporaryInodes }
}

/** True when the file at `path` is the single temporary the observer saw (a rename or a link keeps the inode). */
export function publishedFromTemporary(params: {
	observer: ReplacementObserver
	path: string
}): boolean {
	return (
		params.observer.temporaryInodes.length === 1 &&
		statSync(params.path).ino === params.observer.temporaryInodes[0]
	)
}

/** The temporary files left in the folder of `path` (every name holding `.tmp-`). */
export function temporariesLeftBeside(path: string): string[] {
	return readdirSync(dirname(path)).filter((name) => name.includes(TEMPORARY_INFIX_PROBE))
}

function isOwnTemporary(params: { temporaryPath: string; path: string }): boolean {
	return (
		dirname(params.temporaryPath) === dirname(params.path) &&
		new RegExp(`^${escapedForPattern(basename(params.path))}\\.tmp-\\d+-\\d+$`).test(
			basename(params.temporaryPath),
		)
	)
}

function escapedForPattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
