import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { SKILLS_FOLDER } from '../skills/skill-file.constants.ts'
import { discoverSkillSources } from '../skills/sync-skills.ts'
import { API_JSON_FILE, API_JSON_FOLDER, INDEX_NOT_READ } from './api-json.constants.ts'

import type { ApiJson, ApiJsonRead } from './api-json.types.ts'

/**
 * Every `api.json` an agent can search from `cwd`: the package's own skills (inside a dialecte repository)
 * and the skills of its installed dependencies, one per package, sorted by package name.
 *
 * @intent list the api indexes searchable from a folder, find which installed packages ship an api.json
 */
export function readApiIndexes(params: { cwd: string }): ApiJson[] {
	return apiIndexesOf({ files: apiIndexFilesOf(params) })
}

/**
 * The api indexes of the package's own skills only (inside a dialecte repository), none of its dependencies'.
 *
 * @intent read what a package itself declares public, to compare its own functions with
 * @internal
 */
export function readOwnApiIndexes(params: {
	cwd: string
	/** A commit's files (relative to `cwd`) and the texts of its index files: read there, never on the disk. */
	tree?: { files: Iterable<string>; texts: ReadonlyMap<string, string> }
}): ApiJson[] {
	const { tree } = params
	if (tree === undefined)
		return apiIndexesOf({
			files: ownSkillFolders(params.cwd)
				.map((folder) => join(folder, API_JSON_FOLDER, API_JSON_FILE))
				.filter((path) => existsSync(path)),
		})
	return firstPerPackage(
		ownIndexPathsIn(tree.files).map((path) =>
			indexOrThrow({ path, read: indexTextRead(tree.texts.get(path)) }),
		),
	)
}

/**
 * The package's own api indexes among `files` (paths from the package root): `skills/<skill>/references/api.json`,
 * sorted, as `readOwnApiIndexes` finds them on the disk.
 *
 * @intent find a package's own api indexes in a commit's file set
 * @internal
 */
export function ownIndexPathsIn(files: Iterable<string>): string[] {
	return [...files]
		.filter(function isOwnIndex(path) {
			const segments = path.split('/')
			return (
				segments.length === 4 &&
				segments[0] === SKILLS_FOLDER &&
				segments[2] === API_JSON_FOLDER &&
				segments[3] === API_JSON_FILE
			)
		})
		.sort()
}

/** The absolute paths of the `api.json` files `readApiIndexes` reads from `cwd`, in discovery order. */
export function apiIndexFilesOf(params: { cwd: string }): string[] {
	const { cwd } = params
	// a folder with no manifest depends on nothing: only its own skills
	const installed = existsSync(join(cwd, 'package.json'))
		? discoverSkillSources({ cwd }).sources.map((source) => source.path)
		: []
	return [...ownSkillFolders(cwd), ...installed]
		.map((folder) => join(folder, API_JSON_FOLDER, API_JSON_FILE))
		.filter((path) => existsSync(path))
}

/**
 * The indexes of `files` (as `apiIndexFilesOf` lists them), one per package (the first file of a
 * package wins), sorted by package name.
 */
export function apiIndexesOf(params: { files: readonly string[] }): ApiJson[] {
	return firstPerPackage(params.files.map(readApiJson))
}

/** One index per package (the first of a package wins), sorted by package name. */
export function firstPerPackage(indexes: readonly ApiJson[]): ApiJson[] {
	const byPackage = new Map<string, ApiJson>()
	for (const index of indexes)
		if (!byPackage.has(index.package)) byPackage.set(index.package, index)
	return [...byPackage.values()].sort((left, right) =>
		TEXT_COLLATOR.compare(left.package, right.package),
	)
}

/** One shipped index, or why the file is not one (not JSON, or no package name or no method list). */
export function parseApiJson(path: string): ApiJsonRead {
	let text: string
	try {
		text = readFileSync(path, 'utf8')
	} catch (error) {
		return { problem: error instanceof Error ? error.message : String(error) }
	}
	return parseApiJsonText(text)
}

/**
 * One index from its text (a base's, read through git), or why it is not one.
 *
 * @intent read an api index another commit holds
 * @internal
 */
export function parseApiJsonText(text: string): ApiJsonRead {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch (error) {
		return { problem: error instanceof Error ? error.message : String(error) }
	}
	if (!isApiJson(value)) return { problem: 'no package name or no method list' }
	return { index: value }
}

function ownSkillFolders(cwd: string): string[] {
	const skillsRoot = join(cwd, SKILLS_FOLDER)
	if (!existsSync(skillsRoot)) return []
	return readdirSync(skillsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(skillsRoot, entry.name))
		.sort()
}

/** One shipped index; a file that is not one throws, naming it and the fix. */
function readApiJson(path: string): ApiJson {
	return indexOrThrow({ path, read: parseApiJson(path) })
}

/** What a commit's index text reads as: the index, or why not (a text the batch read did not return is no index). */
function indexTextRead(text: string | undefined): ApiJsonRead {
	return text === undefined ? { problem: INDEX_NOT_READ } : parseApiJsonText(text)
}

/** The index `read` holds; one that is not an index throws, naming `path` and the fix. */
function indexOrThrow(params: { path: string; read: ApiJsonRead }): ApiJson {
	const { path, read } = params
	if ('index' in read) return read.index
	throw new Error(
		`${path} is not a valid api index (${read.problem}): reinstall the package, or run \`dialecte skills generate\` in its repository`,
	)
}

function isApiJson(value: unknown): value is ApiJson {
	return (
		typeof value === 'object' &&
		value !== null &&
		'package' in value &&
		typeof value.package === 'string' &&
		'methods' in value &&
		Array.isArray(value.methods)
	)
}
