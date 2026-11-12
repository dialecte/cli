/** The key of a check: what a record ran on, computed from the worktree as it is now. */
import { createHash } from 'node:crypto'
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'

import { holdsScopedStep } from '../gate/gate-config.ts'
import { listCommitHookFiles } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { readMachineLists } from '../rules/committed-text.ts'
import {
	FILE_DEPENDENCY_PREFIX,
	INSTALLED_LOCK_FILE,
	LINKED_DEPENDENCY_FIELDS,
	LINKED_SKIPPED_FOLDERS,
	NO_INSTALLED_LOCK,
	PACKAGE_FILES_EXCLUSION_PREFIX,
	PACKAGE_FILES_GLOB_PATTERN,
	COMMIT_INDEX_FOLDER_PREFIX,
	RULES_STEP_PATTERN,
	SCOPED_STEP_HASH_MARK,
	STEP_WIRING_HASH_MARKS,
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
 * runs only the tests the change affects (which tests those are depends on the diff against HEAD), and the gate
 * base its caller resolved once for the run (it counts only with a scoped step: `hashGateCommand`); it never
 * resolves a base itself.
 */
export function gateCommandHash(params: {
	root: string
	steps: readonly GateStep[]
	/** The base the caller resolved once for the run: a scoped step selects against it. */
	gateBase?: string
}): string {
	const { root, steps, gateBase } = params
	const hash = steps.some((step) => step.changedOnly)
		? hashGateCommand({
				steps,
				base: readGit({ root, args: ['rev-parse', 'HEAD'] }).trim(),
				gateBase,
			})
		: hashGateCommand({ steps, gateBase })
	return steps.some((step) => RULES_STEP_PATTERN.test(step.run))
		? foldMachineLists({ root, hash })
		: hash
}

/**
 * A command hash whose run checks the rules, folded with what the rules read from the machine besides the tree (a
 * contributor's consumer names and forbidden words, `readMachineLists`): sha256 (hex) of the hash and a hash of the
 * lists, never the words themselves; the hash unchanged when there is no list, so a list set or changed after a
 * green record runs the check again.
 */
export function foldMachineLists(params: { root: string; hash: string }): string {
	const lists = readMachineLists(params.root)
	if (lists === undefined) return params.hash
	return sha256(JSON.stringify({ command: params.hash, lists: sha256(JSON.stringify(lists)) }))
}

/**
 * sha256 (hex) of the steps' `name` and `run` in order, plus a commit when given. Without a scoped step the hash
 * is the same as before scoped steps existed, `gateBase` left out; with one, a scoped step hashes as
 * `[name, run, "scoped"]` and `gateBase` enters. An unwired step adds `"unwired"`, an opted-out one `"opted-out"`
 * (never its reason), so a list judged otherwise never answers from a record of the same list wired; a step with
 * neither keeps today's bytes. `heavy` and `isDefault` never enter.
 */
export function hashGateCommand(params: {
	steps: readonly GateStep[]
	/** HEAD, for a `changedOnly` step and contrib. */
	base?: string
	/** The resolved commit a scoped step selects against; it counts only when a step is scoped. */
	gateBase?: string
}): string {
	const base = params.base ?? null
	const steps = params.steps.map(hashedStepOf)
	// JSON keeps each value apart: `a` + `bc` and `ab` + `c` never hash alike
	if (!holdsScopedStep(params.steps)) return sha256(JSON.stringify({ steps, base }))
	return sha256(JSON.stringify({ steps, base, gateBase: params.gateBase }))
}

/** A step as its gate command hash holds it: `[name, run]`, then its scoped mark, then its wiring mark. */
function hashedStepOf(step: GateStep): string[] {
	const wiring =
		step.optedOut !== undefined
			? STEP_WIRING_HASH_MARKS.optedOut
			: step.unwired === true
				? STEP_WIRING_HASH_MARKS.unwired
				: undefined
	return [
		step.name,
		step.run,
		...(step.scoped === true ? [SCOPED_STEP_HASH_MARK] : []),
		...(wiring === undefined ? [] : [wiring]),
	]
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

/**
 * The command hash of a hook record whose hook ran a scoped step: sha256 (hex) of the hook files' hash
 * (`hashHookCommand`) folded with the base the hook printed it used, so a record answers only a reader at that base.
 */
export function foldHookBase(params: { hook: string; gateBase: string }): string {
	return sha256(JSON.stringify({ hook: params.hook, gateBase: params.gateBase }))
}

/**
 * The key of what a commit in the worktree `root` is in records: the tree of its index (`readIndexTree`), what
 * npm installed, the `file:` dependencies, and `commandHash`.
 */
export function computeCommitKey(params: {
	root: string
	commandHash: string
	/** The index the commit records, as git hands it to a hook (relative: to the worktree top); default: the worktree's own. */
	indexFile?: string
}): CheckKey {
	return {
		tree: readIndexTree({ root: params.root, indexFile: params.indexFile }),
		...readInstalledKey(params.root),
		commandHash: params.commandHash,
	}
}

/**
 * The tree a commit would record: `git write-tree` of the index `indexFile` - relative to the worktree top, as git
 * means a `GIT_INDEX_FILE` it hands a hook - else of the worktree's own index. It runs on a copy of that index:
 * write-tree locks and rewrites the index it reads, and the repository's index is never touched.
 */
export function readIndexTree(params: { root: string; indexFile?: string }): string {
	const { root, indexFile } = params
	const index = indexFile
		? resolve(workTreeTopOf(root) ?? root, indexFile)
		: readGit({ root, args: ['rev-parse', '--path-format=absolute', '--git-path', 'index'] }).trim()
	const folder = mkdtempSync(join(tmpdir(), COMMIT_INDEX_FOLDER_PREFIX))
	try {
		const copy = join(folder, 'index')
		// no index yet (nothing ever staged): write-tree of a missing index answers the empty tree, as git's own does
		if (existsSync(index)) copyFileSync(index, copy)
		return readGit({ root, args: ['write-tree'], environment: { GIT_INDEX_FILE: copy } }).trim()
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
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
