/** The key of a check: what a record ran on, computed from the worktree as it is now. */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

import { listCommitHookFiles } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import {
	FILE_DEPENDENCY_PREFIX,
	INSTALLED_LOCK_FILE,
	LINKED_DEPENDENCY_FIELDS,
	LINKED_SKIPPED_FOLDERS,
	NO_INSTALLED_LOCK,
	PACKAGE_FILES_EXCLUSION_PREFIX,
	PACKAGE_FILES_GLOB_PATTERN,
} from './gate-records.constants.ts'
import { computeStateTree } from './state-hash.ts'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { CheckKey } from './gate-records.types.ts'

/** The key of the worktree `root` is in, now. */
export function computeCheckKey(params: { root: string; commandHash: string }): CheckKey {
	return {
		tree: computeStateTree(params.root),
		...readInstalledKey(params.root),
		commandHash: params.commandHash,
	}
}

/**
 * What the package at `root` runs against besides its tree, as a check key holds it: what npm installed
 * (`lockHash`) and the folders of its `file:` dependencies as they are now (`linked`).
 */
export function readInstalledKey(root: string): Pick<CheckKey, 'lockHash' | 'linked'> {
	const lockPath = join(root, INSTALLED_LOCK_FILE)
	return {
		lockHash: existsSync(lockPath) ? sha256(readFileSync(lockPath)) : NO_INSTALLED_LOCK,
		linked: hashLinkedFolders(root),
	}
}

/**
 * The command hash of a gate's steps in the worktree `root` is in: the steps, and HEAD's commit when a step
 * runs only the tests the change affects (which tests those are depends on the diff against HEAD).
 */
export function gateCommandHash(params: { root: string; steps: readonly GateStep[] }): string {
	const { steps } = params
	if (!steps.some((step) => step.changedOnly)) return hashGateCommand({ steps })
	const head = readGit({ root: params.root, args: ['rev-parse', 'HEAD'] }).trim()
	return hashGateCommand({ steps, base: head })
}

/** sha256 (hex) of the steps' `name` and `run` in order, plus a commit when given. */
export function hashGateCommand(params: { steps: readonly GateStep[]; base?: string }): string {
	// JSON keeps each value apart: `a` + `bc` and `ab` + `c` never hash alike
	return sha256(
		JSON.stringify({
			steps: params.steps.map((step) => [step.name, step.run]),
			base: params.base ?? null,
		}),
	)
}

/** sha256 (hex) of the commit hook files git runs in `root`. */
export function hashHookCommand(root: string): string {
	const hash = createHash('sha256')
	for (const file of listCommitHookFiles(root)) {
		hash.update(`${basename(file)}\0`)
		hash.update(readFileSync(file))
		hash.update('\0')
	}
	return hash.digest('hex')
}

/** The tree id of a commit. */
export function readTreeOf(params: { root: string; revision: string }): string {
	return readGit({ root: params.root, args: ['rev-parse', `${params.revision}^{tree}`] }).trim()
}

/**
 * sha256 (hex) over each `file:` dependency of the package at `root`, by name: the folder node loads it from
 * (what `node_modules/<name>` links to, else the path package.json names), each file it publishes with its
 * relative path, size and modification time.
 */
function hashLinkedFolders(root: string): string {
	const packageJson = readPackageJson(root)
	const linked = LINKED_DEPENDENCY_FIELDS.flatMap((field) =>
		Object.entries(packageJson[field] ?? {}).filter(([, spec]) =>
			spec.startsWith(FILE_DEPENDENCY_PREFIX),
		),
	).sort(([first], [second]) => first.localeCompare(second))
	const hash = createHash('sha256')
	for (const [name, spec] of linked) {
		const installed = join(root, 'node_modules', name)
		const folder = existsSync(installed)
			? realpathSync(installed)
			: resolve(root, spec.slice(FILE_DEPENDENCY_PREFIX.length))
		hash.update(`${name}\0${spec}\0`)
		for (const line of listPublishedStats(folder)) hash.update(line)
	}
	return hash.digest('hex')
}

/**
 * The stat lines of what a dependency folder publishes, as npm packs it: its package.json and the paths its
 * `files` names (files, or folders taken whole). An exclusion (an entry starting with `!`) only narrows what npm
 * packs and is left out; a glob is walked from the folder before its first wildcard: both keep a superset of
 * what is published. A folder without package.json or without `files` is taken whole. `node_modules` and
 * `.git` are always left out.
 */
function listPublishedStats(folder: string): string[] {
	const manifest = join(folder, 'package.json')
	const files = existsSync(manifest) ? readPublishedFiles(manifest) : undefined
	if (!files) return listFolderStats({ folder, current: folder })
	const included = files
		.filter((entry) => !entry.startsWith(PACKAGE_FILES_EXCLUSION_PREFIX))
		.map(staticPathOf)
	const entries = [...new Set(['package.json', ...included])]
	return entries.sort().flatMap(function statsOf(entry) {
		const path = join(folder, entry)
		if (!existsSync(path)) return [`missing\0${entry}\n`]
		return lstatSync(path).isDirectory()
			? listFolderStats({ folder, current: path })
			: [statLine({ folder, path })]
	})
}

/** A `files` entry up to its first wildcard segment, without a trailing slash: `.` for a glob at the top. */
function staticPathOf(entry: string): string {
	const segments = entry.split('/').filter(Boolean)
	const firstGlob = segments.findIndex((segment) => PACKAGE_FILES_GLOB_PATTERN.test(segment))
	const kept = firstGlob === -1 ? segments : segments.slice(0, firstGlob)
	return kept.length ? kept.join('/') : '.'
}

/** The `files` list of a package.json; undefined when it has none, or cannot be read. */
function readPublishedFiles(manifest: string): string[] | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
		const files =
			typeof parsed === 'object' && parsed !== null && 'files' in parsed ? parsed.files : undefined
		return Array.isArray(files) && files.every((entry) => typeof entry === 'string')
			? files
			: undefined
	} catch {
		// a manifest being written, or broken: the folder is taken whole
		return undefined
	}
}

/** One line per file under `current` (relative to `folder`): its path, size and modification time. */
function listFolderStats(params: { folder: string; current: string }): string[] {
	if (!existsSync(params.current)) return [`missing\0${relative(params.folder, params.current)}\n`]
	const entries = readdirSync(params.current, { withFileTypes: true }).sort((first, second) =>
		first.name.localeCompare(second.name),
	)
	return entries.flatMap(function statLines(entry) {
		const path = join(params.current, entry.name)
		if (entry.isDirectory())
			return LINKED_SKIPPED_FOLDERS.includes(entry.name)
				? []
				: listFolderStats({ folder: params.folder, current: path })
		return [statLine({ folder: params.folder, path })]
	})
}

/** A file's relative path, size and modification time; a link as itself (following it could loop). */
function statLine(params: { folder: string; path: string }): string {
	const status = lstatSync(params.path)
	return `${relative(params.folder, params.path)}\0${status.size}\0${status.mtimeMs}\n`
}

function sha256(data: string | Buffer): string {
	return createHash('sha256').update(data).digest('hex')
}
