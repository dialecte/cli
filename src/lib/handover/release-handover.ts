/** `handover write --release` and `--target`: the lots file marked as a release hand-over's, its target recorded. */
import { readFileSync, writeFileSync } from 'node:fs'

import type { LotsFile } from './handover.types.ts'

/**
 * Marks the lots file at `lotsPath` `"release": true` (its other fields as written, a relative repository kept
 * relative) unless it holds the mark already; the lots file with the mark.
 */
export function markReleaseHandover(params: { lotsPath: string; lotsFile: LotsFile }): LotsFile {
	if (params.lotsFile.release === true) return params.lotsFile
	return writeLotsFields({ ...params, fields: { release: true } })
}

/**
 * Records `"target": <target>` in the lots file at `lotsPath` (its other fields as written, a relative repository
 * kept relative) unless it holds that target already; the lots file with it.
 */
export function markHandoverTarget(params: {
	lotsPath: string
	lotsFile: LotsFile
	target: string
}): LotsFile {
	if (params.lotsFile.target === params.target) return params.lotsFile
	return writeLotsFields({ ...params, fields: { target: params.target } })
}

/** The lots file at `lotsPath` written back with `fields` set; the lots file read with them. */
function writeLotsFields(params: {
	lotsPath: string
	lotsFile: LotsFile
	fields: Pick<LotsFile, 'release' | 'target'>
}): LotsFile {
	const written: unknown = JSON.parse(readFileSync(params.lotsPath, 'utf8'))
	const lotsFile = { ...params.lotsFile, ...params.fields }
	// `readLotsFile` read it as an object already: anything else is written back as it read it
	const marked =
		typeof written === 'object' && written !== null ? { ...written, ...params.fields } : lotsFile
	writeFileSync(params.lotsPath, `${JSON.stringify(marked, null, '\t')}\n`)
	return lotsFile
}
