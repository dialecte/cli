/**
 * The code entries of a package, read from the `exports` map of its `package.json`: each subpath shipping a
 * declaration file (its `types` condition, one level down when the condition object nests it - `import.types` -,
 * or a string target ending in `.d.ts`, `.d.mts` or `.d.cts`). A subpath holding `*` is a file pattern, not an
 * entry. The source of an entry is its declaration path with the build folder replaced by `src` and the
 * matching source extension (`./dist/sqlite.d.ts` → `src/sqlite.ts`, `.d.mts` → `.mts`), or that path as a
 * folder's `index` file with the same extension.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	FALLBACK_SOURCE_EXTENSION,
	SOURCE_EXTENSIONS,
	SOURCE_FOLDER,
	SUBPATH_PATTERN_MARKER,
} from './export-entries.constants.ts'

import type {
	DeclarationFile,
	ExportEntry,
	ExportsManifest,
	SourceExtension,
} from './export-entries.types.ts'

/** The code entries of the package at `root`, in the order of its `exports` map. */
export function readExportEntries(params: { root: string }): ExportEntry[] {
	const manifest: ExportsManifest = JSON.parse(
		readFileSync(join(params.root, 'package.json'), 'utf8'),
	)
	const packageName = typeof manifest.name === 'string' ? manifest.name : ''
	return Object.entries(subpathsOf(manifest.exports)).flatMap(
		([subpath, target]): ExportEntry[] => {
			const declaration = declarationFileOf(target)
			if (subpath.includes(SUBPATH_PATTERN_MARKER) || declaration === undefined) return []
			return [
				{
					specifier: subpath === '.' ? packageName : `${packageName}${subpath.slice(1)}`,
					source: sourceOf({ root: params.root, subpath, declaration }),
				},
			]
		},
	)
}

/** The map of subpaths: a lone target or a lone condition object is the `.` entry. */
function subpathsOf(exports: unknown): Record<string, unknown> {
	if (typeof exports === 'string') return { '.': exports }
	if (!isRecord(exports)) return {}
	const keys = Object.keys(exports)
	return keys.length > 0 && keys.every((key) => key.startsWith('.')) ? exports : { '.': exports }
}

/**
 * The declaration file a subpath ships: its string target, the `types` of its condition object, or the
 * `types` of the first condition nesting one (`{ import: { types } }`).
 */
function declarationFileOf(target: unknown): DeclarationFile | undefined {
	if (!isRecord(target)) return asDeclarationFile(target)
	return (
		asDeclarationFile(target.types) ??
		Object.values(target)
			.map((condition) => (isRecord(condition) ? asDeclarationFile(condition.types) : undefined))
			.find((declaration) => declaration !== undefined)
	)
}

function asDeclarationFile(path: unknown): DeclarationFile | undefined {
	if (typeof path !== 'string') return undefined
	const extension = SOURCE_EXTENSIONS.find((candidate) => path.endsWith(candidate.declaration))
	return extension && { path, extension }
}

/**
 * The source of an entry: the declaration path under `src` with the matching source extension, as a file then
 * as a folder's `index`; then the same with `.ts` (a dual build emits `.d.mts` / `.d.cts` from a `.ts` source).
 */
function sourceOf(params: { root: string; subpath: string; declaration: DeclarationFile }): string {
	const { path, extension } = params.declaration
	const segments = path.replace(/^\.\//, '').split('/')
	const sourceSegments = [SOURCE_FOLDER, ...(segments.length > 1 ? segments.slice(1) : segments)]
	const withoutExtension = sourceSegments.join('/').slice(0, -extension.declaration.length)
	const candidates = sourceExtensionsOf(extension).flatMap((sourceExtension) => [
		`${withoutExtension}${sourceExtension}`,
		`${withoutExtension}/index${sourceExtension}`,
	])
	const source = candidates.find((candidate) => existsSync(join(params.root, candidate)))
	if (source === undefined)
		throw new Error(
			`exports entry "${params.subpath}": no source at ${candidates.join(' nor at ')}`,
		)
	return source
}

function sourceExtensionsOf(extension: SourceExtension): string[] {
	return [...new Set([extension.source, FALLBACK_SOURCE_EXTENSION])]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
