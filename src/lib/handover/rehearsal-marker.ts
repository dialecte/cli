/** Where a rehearsal clone keeps its marker, and the hand-over folder the marker names: files only, a leaf module. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isFolder } from '../file-system.ts'
import { REHEARSAL_MARKER_FILE } from './handover.constants.ts'

/**
 * The marker of the rehearsal in `entry`: in its own git folder, else in that of a clone inside it. Throws when the
 * entry cannot be listed (not readable).
 *
 * @intent find a rehearsal's marker in the shape this cli and earlier ones left it
 * @internal
 */
export function rehearsalMarkerPath(entry: string): string {
	const ownMarker = join(entry, '.git', REHEARSAL_MARKER_FILE)
	if (existsSync(ownMarker) || !isFolder(entry)) return ownMarker
	const inside = readdirSync(entry, { withFileTypes: true })
		.filter((child) => child.isDirectory())
		.map((child) => join(entry, child.name, '.git', REHEARSAL_MARKER_FILE))
	return inside.find((path) => existsSync(path)) ?? ownMarker
}

/**
 * The hand-over folder a rehearsal marker names, read raw; undefined when there is no marker, it does not parse or
 * names none. Throws when the marker is there but cannot be read (not readable).
 *
 * @intent name the hand-over a rehearsal clone rehearses
 * @internal
 */
export function markedHandoverOf(markerPath: string): string | undefined {
	let text: string
	try {
		text = readFileSync(markerPath, 'utf8')
	} catch (error) {
		// nothing there (no marker, or no git folder on its way): no hand-over named
		const { code } = error as NodeJS.ErrnoException
		if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
		throw error
	}
	try {
		const marker: unknown = JSON.parse(text)
		return typeof marker === 'object' &&
			marker !== null &&
			'handover' in marker &&
			typeof marker.handover === 'string'
			? marker.handover
			: undefined
	} catch {
		// a marker being written, or broken, names no hand-over: the run reader says why
		return undefined
	}
}
