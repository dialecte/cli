import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { SKILLS_FOLDER } from '../skills/skill-file.constants.ts'
import { discoverSkillSources } from '../skills/sync-skills.ts'
import { API_JSON_FILE, API_JSON_FOLDER } from './api-json.constants.ts'

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
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
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
	const read = parseApiJson(path)
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
