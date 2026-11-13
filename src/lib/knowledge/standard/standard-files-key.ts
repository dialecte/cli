/** The key of a standard's current files (D14): what a standard fact records and a re-check compares. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { stableJson } from '../../stable-json.ts'
import { STANDARD_FILES_KEY_PREFIX } from './standard-files-key.constants.ts'

import type { StandardFileHash } from './standard-files-key.types.ts'
import type { StandardFolder } from './standard-input.types.ts'

/** `sha256:` and the hex digest of the stable JSON of the `(id, sha256)` pairs sorted by id; never the index's manifest hash. */
export function standardFilesKey(params: { files: StandardFileHash[] }): string {
	const pairs = params.files
		.map((file) => [file.id, file.sha256])
		.sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
	return `${STANDARD_FILES_KEY_PREFIX}${sha256Of(stableJson(pairs))}`
}

/** The files key of a standard folder as its files are on disk now, each file hashed from its bytes. */
export function standardFolderFilesKey(params: { standard: StandardFolder }): string {
	return standardFilesKey({
		files: params.standard.files.map((file) => ({
			id: file.id,
			sha256: sha256Of(readFileSync(file.path)),
		})),
	})
}

function sha256Of(content: Buffer | string): string {
	return createHash('sha256').update(content).digest('hex')
}
