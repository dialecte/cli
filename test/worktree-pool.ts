/** Tiny fake node_modules, pool entries and a recording spawner for the pool, trash and lot close tests. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

import { computeLockKey } from '../src/lib/worktree/lock-key.ts'
import { temporaryFolder } from './scratch-repository.ts'
import {
	EXECUTED_REMOVE_MS,
	KEPT_FILE,
	MARKER_FILE,
	OUTSIDE_LINK,
	REMOVED_FILES,
} from './worktree-pool.constants.ts'

import type {
	BackgroundSpawner,
	NpmRunner,
	PoolEntryFile,
} from '../src/lib/worktree/worktree.types.ts'

/**
 * A fake node_modules at `folder`: a package, a link that stays inside (`.bin/demo`), a link that leaves it
 * (`@dialecte/core`, a relative path to a sibling of the worktree), a `.vite` and a `.cache` folder; a marker
 * file with `marker` when given.
 */
export function createFakeNodeModules(params: {
	folder: string
	marker?: string
	/** Where `@dialecte/core` points (default: the relative path leaving node_modules). */
	outsideTarget?: string
}): void {
	const { folder } = params
	mkdirSync(join(folder, 'demo'), { recursive: true })
	writeFileSync(join(folder, KEPT_FILE), 'module.exports = 1\n')
	writeFileSync(join(folder, 'demo/package.json'), '{ "name": "demo", "version": "1.0.0" }\n')
	mkdirSync(join(folder, '.bin'))
	symlinkSync('../demo/index.js', join(folder, '.bin/demo'))
	mkdirSync(join(folder, '@dialecte'))
	symlinkSync(params.outsideTarget ?? OUTSIDE_LINK, join(folder, '@dialecte/core'))
	for (const file of REMOVED_FILES) {
		mkdirSync(join(folder, file, '..'), { recursive: true })
		writeFileSync(join(folder, file), 'cached\n')
	}
	if (params.marker !== undefined) writeFileSync(join(folder, MARKER_FILE), params.marker)
}

/** A workspace's `.worktrees/` folder in a temporary folder (its real path), made. */
export function createWorktreesFolder(): string {
	const folder = join(realpathSync(temporaryFolder('dialecte-pool-')), '.worktrees')
	mkdirSync(folder)
	return folder
}

/** `<worktrees>/<name>` holding `package-lock.json` (`lock`) and a fake node_modules (with `marker` when given). */
export function createWorktreeFolder(params: {
	worktreesFolder: string
	name: string
	lock: string
	marker?: string
}): string {
	const worktree = join(params.worktreesFolder, params.name)
	mkdirSync(worktree, { recursive: true })
	writeFileSync(join(worktree, 'package-lock.json'), params.lock)
	createFakeNodeModules({ folder: join(worktree, 'node_modules'), marker: params.marker })
	return worktree
}

/** A worktree folder with a lockfile and no node_modules: what a take hands one to. */
export function createBareWorktreeFolder(params: {
	worktreesFolder: string
	name: string
	lock: string
}): string {
	const worktree = join(params.worktreesFolder, params.name)
	mkdirSync(worktree)
	writeFileSync(join(worktree, 'package-lock.json'), params.lock)
	return worktree
}

export function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** The `pool.json` a park writes for `repository`: the lock key of `lock`, `packages` (none by default). */
export function poolEntryOf(params: {
	repository: string
	lock: string
	parkedAt: string
	packages?: Record<string, string>
}): PoolEntryFile {
	return {
		repository: params.repository,
		lockKey: computeLockKey({ text: params.lock }),
		parkedAt: params.parkedAt,
		packages: params.packages ?? {},
	}
}

/** A pool entry as a park leaves it: `<worktrees>/<name>/node_modules` (fake, with `marker`) and `pool.json`. */
export function writePoolEntry(params: {
	worktreesFolder: string
	name: string
	entry: PoolEntryFile
	marker?: string
	outsideTarget?: string
}): string {
	const folder = join(params.worktreesFolder, params.name)
	mkdirSync(folder, { recursive: true })
	createFakeNodeModules({
		folder: join(folder, 'node_modules'),
		marker: params.marker,
		outsideTarget: params.outsideTarget,
	})
	writeFileSync(join(folder, 'pool.json'), `${JSON.stringify(params.entry, null, 2)}\n`)
	return folder
}

/** The names of the pool entries in `<worktrees>` (`_pool-*`), sorted. */
export function poolEntriesOf(worktreesFolder: string): string[] {
	try {
		return readdirSync(worktreesFolder)
			.filter((name) => name.startsWith('_pool-'))
			.sort()
	} catch {
		// no .worktrees/ folder yet: no pool
		return []
	}
}

/** The `pool.json` of the entry `name`. */
export function readPoolFile(params: { worktreesFolder: string; name: string }): PoolEntryFile {
	return JSON.parse(readFileSync(join(params.worktreesFolder, params.name, 'pool.json'), 'utf8'))
}

/** The names in `<worktrees>/_trash/` (none when it does not exist), sorted. */
export function trashedNamesOf(worktreesFolder: string): string[] {
	try {
		return readdirSync(join(worktreesFolder, '_trash')).sort()
	} catch {
		return []
	}
}

/**
 * Every file and link under `folder` by relative path: a regular file as its text, a link as `-> <target>`
 * (the target as written), so two trees compare byte for byte.
 */
export function readTree(folder: string): Record<string, string> {
	const tree: Record<string, string> = {}
	function walk(current: string): void {
		for (const name of readdirSync(current)) {
			const path = join(current, name)
			const stat = lstatSync(path)
			if (stat.isSymbolicLink()) tree[relative(folder, path)] = `-> ${readlinkSync(path)}`
			else if (stat.isDirectory()) walk(path)
			else tree[relative(folder, path)] = readFileSync(path, 'utf8')
		}
	}
	walk(folder)
	return tree
}

/**
 * A spawner that records its calls and runs each at once (bounded by `EXECUTED_REMOVE_MS`): for a case about what
 * is left after the background removal of a tiny scratch worktree.
 */
export function createExecutingSpawner(): {
	spawner: BackgroundSpawner
	calls: { command: string; args: string[]; cwd?: string }[]
} {
	const calls: { command: string; args: string[]; cwd?: string }[] = []
	return {
		calls,
		spawner: function recordAndRun(params) {
			calls.push(params)
			spawnSync(params.command, params.args, { cwd: params.cwd, timeout: EXECUTED_REMOVE_MS })
		},
	}
}

/** A spawner that only records its calls: the background removals the tests never wait for. */
export function createRecordingSpawner(): {
	spawner: BackgroundSpawner
	calls: { command: string; args: string[]; cwd?: string }[]
} {
	const calls: { command: string; args: string[]; cwd?: string }[] = []
	return {
		calls,
		spawner: function record(params) {
			calls.push(params)
		},
	}
}

/**
 * An npm runner standing in for `npm install` and `npm ci`: it records each call (its checkout, its args, whether the
 * checkout held a node_modules then) and answers the outcome of the command (`args[0]`): a failure's status and output,
 * (after writing the file `partial` into the checkout's node_modules when given), or a success that writes into the
 * checkout's node_modules each of `packages` (lock key to version, a `package.json`),
 * each of `links` (lock key to the link's target as written) and the marker file with `marker` when given. A command
 * with no outcome throws: the case did not expect npm to run it.
 */
export function createFakeNpm(params: {
	outcomes: Partial<
		Record<
			'install' | 'ci',
			| { status: number; output: string; partial?: string }
			| { packages: Record<string, string>; links?: Record<string, string>; marker?: string }
		>
	>
}): {
	install: NpmRunner
	calls: { checkout: string; args: string[]; hadNodeModules: boolean }[]
} {
	const calls: { checkout: string; args: string[]; hadNodeModules: boolean }[] = []
	return {
		calls,
		install: function fakeNpm({ checkout, args }) {
			const nodeModules = join(checkout, 'node_modules')
			calls.push({ checkout, args, hadNodeModules: existsSync(nodeModules) })
			const command = args[0]
			const outcome =
				command === 'install' || command === 'ci' ? params.outcomes[command] : undefined
			if (outcome === undefined) throw new Error(`unexpected npm ${args.join(' ')}`)
			if ('status' in outcome) {
				// a failed install may leave what it began: the file `partial` (a path in node_modules)
				if (outcome.partial !== undefined) {
					mkdirSync(join(nodeModules, outcome.partial, '..'), { recursive: true })
					writeFileSync(join(nodeModules, outcome.partial), 'half written\n')
				}
				return { status: outcome.status, output: outcome.output }
			}
			for (const [key, version] of Object.entries(outcome.packages)) {
				const folder = join(checkout, key)
				mkdirSync(folder, { recursive: true })
				const name = key.split('node_modules/').at(-1) ?? key
				writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ name, version })}\n`)
			}
			for (const [key, target] of Object.entries(outcome.links ?? {})) {
				mkdirSync(join(checkout, key, '..'), { recursive: true })
				if (!existsSync(join(checkout, key))) symlinkSync(target, join(checkout, key))
			}
			mkdirSync(nodeModules, { recursive: true })
			if (outcome.marker !== undefined)
				writeFileSync(join(nodeModules, MARKER_FILE), outcome.marker)
			return { status: 0, output: '' }
		},
	}
}
