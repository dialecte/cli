import { mkdirSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { checkNodeModules } from './check-node-modules.ts'

import { describe, expect, it } from 'vitest'

import type { NodeModulesProblem } from './worktree.types.ts'

type LockEntry = {
	version?: string
	resolved?: string
	link?: boolean
	optional?: boolean
	devOptional?: boolean
	peer?: boolean
	os?: string[]
	cpu?: string[]
	inBundle?: boolean
}

/** A platform and an architecture this machine is not. */
const OTHER_PLATFORM = process.platform === 'linux' ? 'darwin' : 'linux'
const OTHER_ARCH = process.arch === 'arm64' ? 'x64' : 'arm64'

/**
 * A worktree `.worktrees/cli-thing` of a scratch workspace, its `package-lock.json` holding `packages`
 * (beside the root entry and the entry of the linked sibling, which are no installed packages), and
 * `.worktrees/core` the folder a `../core` link resolves to.
 */
function createWorktree(params: {
	packages: Record<string, LockEntry>
	lockfileVersion?: number
	/** What the disk's `package-lock.json` holds: these packages instead, or `null` for no lockfile. */
	diskPackages?: Record<string, LockEntry> | null
}): string {
	const workspace = temporaryFolder('dialecte-check-node-modules-')
	const worktree = join(workspace, '.worktrees', 'cli-thing')
	writeFiles({ root: worktree, files: { 'package.json': '{ "name": "@dialecte/cli" }\n' } })
	if (params.diskPackages !== null)
		writeFiles({
			root: worktree,
			files: {
				'package-lock.json': lockTextOf({
					packages: params.diskPackages ?? params.packages,
					lockfileVersion: params.lockfileVersion,
				}),
			},
		})
	writeFiles({ root: join(workspace, '.worktrees', 'core'), files: { 'package.json': '{}\n' } })
	return worktree
}

/** A `package-lock.json` holding `packages` (beside the root entry and the linked sibling's). */
function lockTextOf(params: {
	packages: Record<string, LockEntry>
	lockfileVersion?: number
}): string {
	return JSON.stringify({
		name: '@dialecte/cli',
		lockfileVersion: params.lockfileVersion ?? 3,
		packages: {
			'': { name: '@dialecte/cli' },
			'../core': { name: '@dialecte/core', version: '0.7.0' },
			...params.packages,
		},
	})
}

/** `node_modules/<name>/package.json` at `version`. */
function install(params: { worktree: string; name: string; version: string }): void {
	writeFiles({
		root: params.worktree,
		files: {
			[`node_modules/${params.name}/package.json`]: JSON.stringify({ version: params.version }),
		},
	})
}

/** `node_modules/<name>` a link to `target`. */
function installLink(params: { worktree: string; name: string; target: string }): void {
	const path = join(params.worktree, 'node_modules', params.name)
	mkdirSync(dirname(path), { recursive: true })
	symlinkSync(params.target, path)
}

const CORE_LINK: LockEntry = { resolved: '../core', link: true }

type Case = {
	name: string
	packages: Record<string, LockEntry>
	lockfileVersion?: number
	setup: (worktree: string) => void
	problems: NodeModulesProblem[]
}

const CASES: Case[] = [
	{
		name: 'every package at its locked version, the link reaching what the lock resolves it to → no problem',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/@scope/tool': { version: '2.1.0' },
			'node_modules/@dialecte/core': CORE_LINK,
		},
		setup: (worktree) => {
			install({ worktree, name: 'demo', version: '1.0.0' })
			install({ worktree, name: '@scope/tool', version: '2.1.0' })
			installLink({ worktree, name: '@dialecte/core', target: join(worktree, '..', 'core') })
		},
		problems: [],
	},
	{
		name: 'lockfileVersion 2, every package as locked → no problem',
		lockfileVersion: 2,
		packages: { 'node_modules/demo': { version: '1.0.0' } },
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'a package not installed → missing',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/@scope/tool': { version: '2.1.0' },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [{ package: '@scope/tool', problem: 'missing' }],
	},
	{
		name: 'lockfileVersion 2, a package not installed → missing',
		lockfileVersion: 2,
		packages: { 'node_modules/demo': { version: '1.0.0' } },
		setup: () => undefined,
		problems: [{ package: 'demo', problem: 'missing' }],
	},
	{
		name: 'a package installed at another version → both versions named',
		packages: { 'node_modules/demo': { version: '1.1.0' } },
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [{ package: 'demo', problem: '1.0.0 installed, lock 1.1.0' }],
	},
	{
		name: 'a nested package missing → named under its parent',
		packages: {
			'node_modules/a': { version: '1.0.0' },
			'node_modules/a/node_modules/b': { version: '2.0.0' },
			'node_modules/@s/c': { version: '1.0.0' },
			'node_modules/@s/c/node_modules/@t/d': { version: '3.0.0' },
		},
		setup: (worktree) => {
			install({ worktree, name: 'a', version: '1.0.0' })
			install({ worktree, name: '@s/c', version: '1.0.0' })
		},
		problems: [
			{ package: 'b (under a)', problem: 'missing' },
			{ package: '@t/d (under @s/c)', problem: 'missing' },
		],
	},
	{
		name: 'a nested package at another version → named under its parent, both versions named',
		packages: {
			'node_modules/a': { version: '1.0.0' },
			'node_modules/a/node_modules/b': { version: '2.0.0' },
		},
		setup: (worktree) => {
			install({ worktree, name: 'a', version: '1.0.0' })
			install({ worktree, name: 'a/node_modules/b', version: '1.9.0' })
		},
		problems: [{ package: 'b (under a)', problem: '1.9.0 installed, lock 2.0.0' }],
	},
	{
		name: 'an optional package left out (another platform) → not a problem',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/fsevents': { version: '2.3.3', optional: true },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'an optional package installed at another version → both versions named',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/fsevents': { version: '2.3.3', optional: true },
		},
		setup: (worktree) => {
			install({ worktree, name: 'demo', version: '1.0.0' })
			install({ worktree, name: 'fsevents', version: '2.3.2' })
		},
		problems: [{ package: 'fsevents', problem: '2.3.2 installed, lock 2.3.3' }],
	},
	{
		name: 'a devOptional package left out → missing (a dev install puts it in)',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/watcher': { version: '1.0.0', devOptional: true },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [{ package: 'watcher', problem: 'missing' }],
	},
	{
		name: 'a peer package (not optional) left out → missing',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/peer-dep': { version: '1.0.0', peer: true },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [{ package: 'peer-dep', problem: 'missing' }],
	},
	{
		name: 'a package left out whose os is another platform → not a problem',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/native-other': { version: '1.0.0', os: [OTHER_PLATFORM] },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'a package left out whose os excludes this platform (!) → not a problem',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/native-not-here': { version: '1.0.0', os: [`!${process.platform}`] },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'a package left out whose cpu is another architecture → not a problem',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/native-cpu': { version: '1.0.0', cpu: [OTHER_ARCH] },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'a package left out whose cpu excludes this architecture (!) → not a problem',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/native-cpu-not-here': { version: '1.0.0', cpu: [`!${process.arch}`] },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'an installed package.json that is not JSON → unreadable, named for that package',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/broken': { version: '1.0.0' },
		},
		setup: (worktree) => {
			install({ worktree, name: 'demo', version: '1.0.0' })
			writeFiles({ root: worktree, files: { 'node_modules/broken/package.json': '{ half' } })
		},
		problems: [{ package: 'broken', problem: 'package.json unreadable' }],
	},
	{
		name: 'a bundled package (inBundle) not installed on its own → not checked',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/demo/node_modules/inner': { version: '1.0.0', inBundle: true },
		},
		setup: (worktree) => install({ worktree, name: 'demo', version: '1.0.0' }),
		problems: [],
	},
	{
		name: 'a link whose installed path is absent → link missing',
		packages: { 'node_modules/@dialecte/core': CORE_LINK },
		setup: () => undefined,
		problems: [{ package: '@dialecte/core', problem: 'link to ../core missing' }],
	},
	{
		name: 'a link whose target is missing (dangling) → link missing',
		packages: { 'node_modules/@dialecte/plc': { resolved: '../plc', link: true } },
		setup: (worktree) =>
			installLink({ worktree, name: '@dialecte/plc', target: join(worktree, '..', 'plc') }),
		problems: [{ package: '@dialecte/plc', problem: 'link to ../plc missing' }],
	},
	{
		name: 'a link reaching another folder → points elsewhere',
		packages: { 'node_modules/@dialecte/core': CORE_LINK },
		setup: (worktree) => {
			writeFiles({ root: join(worktree, '..', 'other'), files: { 'package.json': '{}\n' } })
			installLink({ worktree, name: '@dialecte/core', target: join(worktree, '..', 'other') })
		},
		problems: [{ package: '@dialecte/core', problem: 'link to ../core points elsewhere' }],
	},
	{
		name: 'a real folder where the lock has a link → points elsewhere',
		packages: { 'node_modules/@dialecte/core': CORE_LINK },
		setup: (worktree) => install({ worktree, name: '@dialecte/core', version: '0.7.0' }),
		problems: [{ package: '@dialecte/core', problem: 'link to ../core points elsewhere' }],
	},
	{
		name: 'no node_modules at all → every package missing but the optional one',
		packages: {
			'node_modules/demo': { version: '1.0.0' },
			'node_modules/@scope/tool': { version: '2.1.0' },
			'node_modules/fsevents': { version: '2.3.3', optional: true },
			'node_modules/@dialecte/core': CORE_LINK,
		},
		setup: () => undefined,
		problems: [
			{ package: 'demo', problem: 'missing' },
			{ package: '@scope/tool', problem: 'missing' },
			{ package: '@dialecte/core', problem: 'link to ../core missing' },
		],
	},
]

describe('checkNodeModules', () => {
	for (const testCase of CASES)
		it(testCase.name, () => {
			const worktree = createWorktree({
				packages: testCase.packages,
				lockfileVersion: testCase.lockfileVersion,
			})
			testCase.setup(worktree)

			expect(checkNodeModules({ worktree })).toEqual({
				lockfile: 'package-lock.json',
				problems: testCase.problems,
				...(testCase.problems.length > 0 && { command: `cd '${worktree}' && npm ci` }),
			})
		})

	const DISK_VARIANTS = [
		{
			name: 'another lock on disk',
			diskPackages: { 'node_modules/unrelated': { version: '9.0.0' } },
		},
		{ name: 'no lock on disk', diskPackages: null },
	]
	for (const variant of DISK_VARIANTS)
		for (const testCase of CASES.filter((candidate) => candidate.problems.length > 0))
			it(`lockText given, ${variant.name}: ${testCase.name}`, () => {
				const worktree = createWorktree({
					packages: testCase.packages,
					lockfileVersion: testCase.lockfileVersion,
					diskPackages: variant.diskPackages,
				})
				testCase.setup(worktree)

				expect(
					checkNodeModules({
						worktree,
						lockText: lockTextOf({
							packages: testCase.packages,
							lockfileVersion: testCase.lockfileVersion,
						}),
					}),
				).toEqual({
					lockfile: 'package-lock.json',
					problems: testCase.problems,
				})
			})

	for (const variant of DISK_VARIANTS)
		for (const testCase of CASES.filter((candidate) => candidate.problems.length === 0))
			it(`lockText given, ${variant.name}: ${testCase.name}`, () => {
				const worktree = createWorktree({
					packages: testCase.packages,
					lockfileVersion: testCase.lockfileVersion,
					diskPackages: variant.diskPackages,
				})
				testCase.setup(worktree)

				expect(
					checkNodeModules({
						worktree,
						lockText: lockTextOf({
							packages: testCase.packages,
							lockfileVersion: testCase.lockfileVersion,
						}),
					}),
				).toEqual({
					lockfile: 'package-lock.json',
					problems: testCase.problems,
					...(testCase.problems.length > 0 && { command: `cd '${worktree}' && npm ci` }),
				})
			})

	const UNREADABLE_TEXTS = [
		{ name: 'not JSON', lockText: 'not json {', notChecked: 'unreadable' },
		{
			name: 'no packages map',
			lockText: JSON.stringify({ lockfileVersion: 3 }),
			notChecked: 'has no packages map',
		},
	]
	for (const row of UNREADABLE_TEXTS)
		for (const disk of [
			{ name: 'a good lock on disk', diskPackages: { 'node_modules/demo': { version: '1.0.0' } } },
			{ name: 'no lock on disk', diskPackages: null },
		])
			it(`lockText ${row.name}, ${disk.name} → notChecked ${row.notChecked}, as from the disk`, () => {
				const worktree = createWorktree({ packages: {}, diskPackages: disk.diskPackages })
				install({ worktree, name: 'demo', version: '1.0.0' })

				expect(checkNodeModules({ worktree, lockText: row.lockText })).toEqual({
					lockfile: 'package-lock.json',
					notChecked: row.notChecked,
					problems: [],
				})
			})

	it('a package-lock.json that is a folder (unreadable) → notChecked unreadable, never a throw', () => {
		const worktree = join(temporaryFolder('dialecte-check-node-modules-'), 'cli-thing')
		mkdirSync(join(worktree, 'package-lock.json'), { recursive: true })

		expect(checkNodeModules({ worktree })).toEqual({
			lockfile: 'package-lock.json',
			notChecked: 'unreadable',
			problems: [],
		})
	})

	it('no package-lock.json → nothing checked: no lockfile, no problem, no command', () => {
		const worktree = join(temporaryFolder('dialecte-check-node-modules-'), 'cli-thing')
		writeFiles({ root: worktree, files: { 'package.json': '{ "name": "@dialecte/cli" }\n' } })

		expect(checkNodeModules({ worktree })).toEqual({ lockfile: undefined, problems: [] })
	})
})
