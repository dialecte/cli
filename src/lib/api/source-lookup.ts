/**
 * `dialecte api find --source` and `api show <file>#<name>`: the own package's source functions, read by
 * `readSourceFunctions`, as one more index beside the shipped `api.json` ones, named by the package.json `name`.
 */
import { closestNames } from '../closest-names.ts'
import { packageNameOf } from '../mutation/run-store.ts'
import { packageRootOf } from '../package-root.ts'
import { textOf } from '../print/print.ts'
import { findByPath } from './find-by-path.ts'
import { noteLinesOf, renderShown } from './render-api.ts'
import {
	NO_PACKAGE_TEXT,
	SOURCE_PATH_MARK,
	SOURCE_SUGGESTION_LIMIT,
	UNKNOWN_SOURCE_CLOSEST_TEXT,
	UNKNOWN_SOURCE_TEXT,
} from './source-functions.constants.ts'
import { readSourceFunctions } from './source-functions.ts'

import type { CommandOutput } from '../command-output.types.ts'
import type { ApiJson, ApiMethod } from './api-json.types.ts'
import type { SearchedIndexes, SourceIndex } from './source-functions.types.ts'

/** Whether an `api show` path names a source function (`src/lib/git.ts#readGit`): it holds the `#` mark. */
export function isSourcePath(path: string): boolean {
	return path.includes(SOURCE_PATH_MARK)
}

/**
 * The package root a source lookup run in `cwd` reads (the nearest folder at or above it holding a package.json),
 * or the answer with exit code 2 when there is none: `command` is the lookup as typed (`api find --source`).
 */
export function sourceRootOf(params: {
	cwd: string
	command: string
}): { root: string } | { refusal: CommandOutput } {
	const root = packageRootOf(params.cwd)
	if (root !== undefined) return { root }
	return {
		refusal: {
			output: textOf([
				NO_PACKAGE_TEXT.replace('{command}', params.command).replace('{cwd}', params.cwd),
				'',
			]),
			exitCode: 2,
		},
	}
}

/**
 * The indexes `api find --source` and `api show --source` search: the installed ones, then the own package's
 * source functions at `root` (none when `packageName` names another package), each shown once, with the reader's notes.
 */
export function searchedIndexesOf(params: {
	root: string
	packageName: string | undefined
	indexes: ApiJson[]
}): SearchedIndexes {
	const { indexes } = params
	const source = readSourceIndex(params)
	if (source === undefined) return { indexes, notes: [] }
	return {
		indexes: [...indexes, withoutIndexed({ source: source.index, indexes })],
		notes: source.notes,
	}
}

/**
 * `api show <file>#<name>`: the contract of the source function of the package at `root` the path names; exit 1
 * with the closest source paths when none is (none read when `packageName` names another package).
 */
export function showSource(params: {
	root: string
	packageName: string | undefined
	path: string
	json: boolean
}): CommandOutput {
	const source = readSourceIndex(params)
	const notes = source?.notes ?? []
	const methods = findByPath({ indexes: source ? [source.index] : [], path: params.path })
	if (methods.length === 0 && !params.json)
		return {
			output: textOf([
				unknownSourceText({
					path: params.path,
					root: params.root,
					methods: source?.index.methods ?? [],
				}),
				...noteLinesOf(notes),
				'',
			]),
			exitCode: 1,
		}
	return {
		output: renderShown({ methods, json: params.json, notes }),
		exitCode: methods.length ? 0 : 1,
	}
}

/**
 * Reads the source functions of the package at `root` as one index named by its package.json `name` (else the
 * folder's name), with the reader's notes; undefined, nothing read, when `packageName` (`--package`) names
 * another package.
 */
function readSourceIndex(params: {
	root: string
	packageName: string | undefined
}): SourceIndex | undefined {
	const ownName = packageNameOf(params.root)
	if (params.packageName !== undefined && params.packageName !== ownName) return undefined
	const { entries, notes } = readSourceFunctions({ root: params.root })
	return { index: { package: ownName, methods: entries }, notes }
}

/**
 * The source index without the functions an indexed method of the same package is declared at (same
 * `declaredAt`): such a function is shown once, by its indexed route.
 */
function withoutIndexed(params: { source: ApiJson; indexes: readonly ApiJson[] }): ApiJson {
	const { source } = params
	const indexedAt = new Set(
		params.indexes
			.filter(function isSamePackage(index) {
				return index.package === source.package
			})
			.flatMap(function declaredAtOfIndex(index) {
				return index.methods.flatMap(function declaredAtOfMethod(method) {
					return method.declaredAt === undefined ? [] : [method.declaredAt]
				})
			}),
	)
	return {
		package: source.package,
		methods: source.methods.filter(function isNotIndexed(method) {
			return method.declaredAt === undefined || !indexedAt.has(method.declaredAt)
		}),
	}
}

/**
 * What `api show` answers for a source path nobody declares in the package at `root`: the closest source paths -
 * of a file that was read, its functions, the closest by name first; else the closest of every source path - or,
 * none close, the `api find --source` call that lists them.
 */
function unknownSourceText(params: {
	path: string
	root: string
	methods: readonly ApiMethod[]
}): string {
	const closest = closestSourcePaths(params)
	const text = closest.length ? UNKNOWN_SOURCE_CLOSEST_TEXT : UNKNOWN_SOURCE_TEXT
	return text
		.replace('{path}', params.path)
		.replace('{root}', params.root)
		.replace('{closest}', closest.join(', '))
}

/**
 * Up to `SOURCE_SUGGESTION_LIMIT` source paths for an unknown `path`: when its file holds functions, those, the
 * names close to its name first, then the others in file order; else the paths close to it.
 */
function closestSourcePaths(params: { path: string; methods: readonly ApiMethod[] }): string[] {
	const paths = params.methods.map(function pathOfMethod(method) {
		return method.path
	})
	const mark = params.path.lastIndexOf(SOURCE_PATH_MARK)
	const filePrefix = params.path.slice(0, mark + SOURCE_PATH_MARK.length)
	const names = paths
		.filter(function isOfTheFile(path) {
			return path.startsWith(filePrefix)
		})
		.map(function nameOfPath(path) {
			return path.slice(filePrefix.length)
		})
	if (names.length === 0)
		return closestNames({ name: params.path, candidates: paths, limit: SOURCE_SUGGESTION_LIMIT })
	const close = closestNames({
		name: params.path.slice(filePrefix.length),
		candidates: names,
		limit: SOURCE_SUGGESTION_LIMIT,
	})
	const others = names.filter(function isNotClose(name) {
		return !close.includes(name)
	})
	return [...close, ...others].slice(0, SOURCE_SUGGESTION_LIMIT).map(function pathOfName(name) {
		return `${filePrefix}${name}`
	})
}
