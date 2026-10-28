import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { SKILLS_FOLDER } from '../skills/skill-file.constants.ts'
import { discoverSkillSources } from '../skills/sync-skills.ts'
import { API_JSON_FILE, API_JSON_FOLDER } from './api-json.constants.ts'

import type { ApiJson } from './api-json.types.ts'

/**
 * Every `api.json` an agent can search from `cwd`: the package's own skills (inside a dialecte repository)
 * and the skills of its installed dependencies, one per package, sorted by package name.
 */
export function readApiIndexes(params: { cwd: string }): ApiJson[] {
	const { cwd } = params
	const skillFolders = [
		...ownSkillFolders(cwd),
		...discoverSkillSources({ cwd }).sources.map((source) => source.path),
	]
	const byPackage = new Map<string, ApiJson>()
	for (const folder of skillFolders) {
		const path = join(folder, API_JSON_FOLDER, API_JSON_FILE)
		if (!existsSync(path)) continue
		const index = readApiJson(path)
		if (!byPackage.has(index.package)) byPackage.set(index.package, index)
	}
	return [...byPackage.values()].sort((left, right) =>
		TEXT_COLLATOR.compare(left.package, right.package),
	)
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
	const fix = 'reinstall the package, or run `dialecte skills generate` in its repository'
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch (error) {
		throw new Error(
			`${path} is not a valid api index (${error instanceof Error ? error.message : String(error)}): ${fix}`,
		)
	}
	if (!isApiJson(value))
		throw new Error(`${path} is not a valid api index (no package name or no method list): ${fix}`)
	return value
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
