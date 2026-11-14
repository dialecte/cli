/**
 * Whether the public API of a package changed against a base: its api indexes (`skills/<skill>/references/api.json`)
 * read from the base by git and from the worktree. `none` for a root with no `package.json`, for a tool (a package
 * with a `bin`) and for a package with no `exports` map; `unknown` when the base cannot be read, or an export source
 * changed while every index did not (no index on either side included): a diff that touches no export source cannot
 * stale an index.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { RISK_PACKAGE_FILE } from '../risk/risk.constants.ts'
import { readExportEntries } from '../skills/export-entries.ts'
import { SKILLS_FOLDER } from '../skills/skill-file.constants.ts'
import { API_JSON_FILE, API_JSON_FOLDER } from './api-json.constants.ts'

import type { ApiChange } from '../risk/risk.types.ts'

/** Whether the api indexes of the package at `root` changed against `base`. */
export function compareApiIndexes(params: { root: string; base: string }): ApiChange {
	// a root with no package.json is not a package, and a package with a bin is a tool: no runtime api either way (D26)
	if (!existsSync(join(params.root, RISK_PACKAGE_FILE))) return 'none'
	// a package with no exports map ships no entry point: no runtime api to change
	const packageJson = readPackageJson(params.root)
	if (packageJson.bin !== undefined || packageJson.exports === undefined) return 'none'
	const baseCommit = tryReadGit({
		root: params.root,
		args: ['rev-parse', '--verify', '--quiet', `${params.base}^{commit}`],
	})
	if (baseCommit === undefined) return 'unknown'
	const indexPaths = [
		...new Set([
			...worktreeIndexPathsOf(params.root),
			...baseIndexPathsOf({ root: params.root, base: params.base }),
		]),
	]
	const indexChanged = indexPaths.some(function differs(path) {
		return differsFromBase({ root: params.root, base: params.base, path })
	})
	if (indexChanged) return 'changed'
	return exportSourceChanged(params) ? 'unknown' : 'unchanged'
}

/** The api indexes of the worktree, relative to `root`. */
function worktreeIndexPathsOf(root: string): string[] {
	const skillsFolder = join(root, SKILLS_FOLDER)
	if (!existsSync(skillsFolder)) return []
	return readdirSync(skillsFolder)
		.map(function indexPathOf(skill) {
			return [SKILLS_FOLDER, skill, API_JSON_FOLDER, API_JSON_FILE].join('/')
		})
		.filter(function exists(path) {
			return existsSync(join(root, path))
		})
}

/** The api indexes the base holds, relative to `root`. */
function baseIndexPathsOf(params: { root: string; base: string }): string[] {
	const listing =
		tryReadGit({
			root: params.root,
			args: ['ls-tree', '-r', '-z', '--name-only', params.base, '--', SKILLS_FOLDER],
		}) ?? ''
	return listing.split('\0').filter(function isIndex(path) {
		const segments = path.split('/')
		return (
			segments.length === 4 &&
			segments[0] === SKILLS_FOLDER &&
			segments[2] === API_JSON_FOLDER &&
			segments[3] === API_JSON_FILE
		)
	})
}

/** The export sources of the package differ from the base; an `exports` map that cannot be read counts as changed. */
function exportSourceChanged(params: { root: string; base: string }): boolean {
	try {
		return readExportEntries({ root: params.root }).some(function differs(entry) {
			return differsFromBase({ root: params.root, base: params.base, path: entry.source })
		})
	} catch {
		return true
	}
}

/** The file at `path` (relative to `root`) differs between the base and the worktree; missing on one side differs. */
function differsFromBase(params: { root: string; base: string; path: string }): boolean {
	const baseText = tryReadGit({
		root: params.root,
		args: ['show', `${params.base}:./${params.path}`],
	})
	const worktreePath = join(params.root, params.path)
	const worktreeText = existsSync(worktreePath) ? readFileSync(worktreePath, 'utf8') : undefined
	return baseText !== worktreeText
}
