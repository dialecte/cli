/** The schemas the build ships beside the bundle: every `src/**\/*.schema.json`, copied to `<outDir>/schemas/`. */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

import {
	SCHEMA_FILE_SUFFIX,
	SCHEMA_SOURCE_FOLDER,
	SHIPPED_SCHEMA_CLASH,
	SHIPPED_SCHEMAS_FOLDER,
} from './release.constants.ts'

/** The order of two schema files: by basename, the name each is shipped under. */
function byBasename(left: string, right: string): number {
	const [leftName, rightName] = [basename(left), basename(right)]
	if (leftName === rightName) return 0
	return leftName < rightName ? -1 : 1
}

/**
 * Every `src/**\/*.schema.json` under `root`, absolute paths, sorted by basename; two with one basename are
 * refused, naming both (they would be shipped as one file).
 */
export function shippedSchemaFilesOf(params: { root: string }): string[] {
	const source = join(params.root, SCHEMA_SOURCE_FOLDER)
	const files = readdirSync(source, { recursive: true, encoding: 'utf8' })
		.filter((path) => path.endsWith(SCHEMA_FILE_SUFFIX))
		.map((path) => join(source, path))
		.sort(byBasename)
	for (let index = 1; index < files.length; index++) {
		const [first, second] = [files[index - 1], files[index]]
		if (basename(first) !== basename(second)) continue
		const pair = [first, second].map((file) => relative(params.root, file)).sort()
		throw new Error(SHIPPED_SCHEMA_CLASH.replace('{first}', pair[0]).replace('{second}', pair[1]))
	}
	return files
}

/** Copies each shipped schema of `root` to `<outDir>/schemas/<basename>` (the folders made). */
export function copyShippedSchemas(params: { root: string; outDir: string }): void {
	const target = join(params.outDir, SHIPPED_SCHEMAS_FOLDER)
	mkdirSync(target, { recursive: true })
	for (const file of shippedSchemaFilesOf({ root: params.root }))
		copyFileSync(file, join(target, basename(file)))
}
