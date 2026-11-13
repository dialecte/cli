/** What a facts folder holds, as whole texts, so a test can pin that a read wrote nothing. */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Every file under the folder (pointers included) by its path relative to it, with its whole text. */
export function snapshotOfFolder(params: { folder: string }): Record<string, string> {
	const found: Record<string, string> = {}
	collect({ root: params.folder, folder: params.folder, found })
	return found
}

function collect(params: { root: string; folder: string; found: Record<string, string> }): void {
	for (const entry of readdirSync(params.folder, { withFileTypes: true })) {
		const path = join(params.folder, entry.name)
		if (entry.isDirectory()) collect({ ...params, folder: path })
		else params.found[relative(params.root, path)] = readFileSync(path, 'utf8')
	}
}
