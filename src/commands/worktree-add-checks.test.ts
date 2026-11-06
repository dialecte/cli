import { mkdirSync, readlinkSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runWorktreeAdd } from './worktree.ts'

import { describe, expect, it } from 'vitest'

/** Scratch repositories, worktrees, copies: seconds on a loaded machine, never a measure of speed. */
const SCRATCH_WORKSPACE_TIMEOUT = 60_000

/** The lock of a cli depending on `demo` and on its sibling `core` through `file:../core`. */
const LOCK_PACKAGES = {
	'': {
		name: '@dialecte/cli',
		devDependencies: { '@dialecte/core': 'file:../core', demo: '1.0.0' },
	},
	'../core': { name: '@dialecte/core', version: '0.7.0' },
	'node_modules/@dialecte/core': { resolved: '../core', link: true },
	'node_modules/demo': { version: '1.0.0' },
}

/**
 * A workspace holding the sibling `core` and the repository `cli`: its package.json and lockfile
 * committed, its main checkout's node_modules installed from that lock (the `core` link relative, as
 * npm makes it) unless `installed` is false.
 */
function createWorkspace(params: {
	packageJson?: Record<string, unknown>
	lockPackages?: Record<string, unknown> | undefined
	installed?: boolean
}): { workspace: string; cli: string; core: string } {
	const workspace = temporaryFolder('dialecte-worktree-checks-')
	const core = join(workspace, 'core')
	writeFiles({ root: core, files: { 'package.json': '{ "name": "@dialecte/core" }\n' } })
	const packageJson = params.packageJson ?? {
		name: '@dialecte/cli',
		devDependencies: { '@dialecte/core': 'file:../core', demo: '1.0.0' },
	}
	const lockPackages = 'lockPackages' in params ? params.lockPackages : LOCK_PACKAGES
	const cli = initializeRepository({
		root: join(workspace, 'cli'),
		files: {
			'.gitignore': 'node_modules\n',
			'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
			...(lockPackages && {
				'package-lock.json': `${JSON.stringify({ name: '@dialecte/cli', lockfileVersion: 3, packages: lockPackages }, null, 2)}\n`,
			}),
		},
	})
	if (params.installed !== false) {
		writeFiles({
			root: cli,
			files: { 'node_modules/demo/package.json': '{ "name": "demo", "version": "1.0.0" }\n' },
		})
		mkdirSync(join(cli, 'node_modules', '@dialecte'), { recursive: true })
		symlinkSync('../../../core', join(cli, 'node_modules', '@dialecte', 'core'))
	}
	return { workspace, cli, core }
}

function add(params: { workspace: string; cli: string; branch: string; json?: boolean }) {
	return runWorktreeAdd({
		argv: [params.cli, params.branch, ...(params.json ? ['--json'] : [])],
		cwd: params.workspace,
		now: new Date('2026-11-01T10:00:00Z'),
		colour: false,
	})
}

/** `worktree add` as `add` runs it; a throw comes back as the result it left instead of a card. */
function addOrThrown(params: Parameters<typeof add>[0]): {
	exitCode: number | undefined
	output: string
} {
	try {
		return add(params)
	} catch (error) {
		return {
			exitCode: undefined,
			output: `threw: ${error instanceof Error ? error.message : String(error)}`,
		}
	}
}

describe(
	'worktree add: sibling links and node_modules against the lockfile',
	{ timeout: SCRATCH_WORKSPACE_TIMEOUT },
	() => {
		it('a file:../core dependency → .worktrees/core links to ../core, and the copied core link matches the lock', () => {
			const { workspace, cli, core } = createWorkspace({})

			const result = add({ workspace, cli, branch: 'feat/thing', json: true })

			const link = join(workspace, '.worktrees', 'core')
			expect(result.exitCode).toBe(0)
			expect(JSON.parse(result.output)).toMatchObject({
				siblingLinks: [{ dependency: '@dialecte/core', link, target: core, outcome: 'created' }],
				nodeModulesCheck: { lockfile: 'package-lock.json', problems: [] },
			})
			expect(readlinkSync(link)).toBe('../core')
			expect(realpathSync(link)).toBe(realpathSync(core))
		})

		it('two sibling dependencies, one of them missing beside the main checkout → the links row holds one line each, the missing one skipped', () => {
			const { workspace, cli } = createWorkspace({
				packageJson: {
					name: '@dialecte/cli',
					devDependencies: {
						'@dialecte/core': 'file:../core',
						'@dialecte/plc': 'file:../plc',
						demo: '1.0.0',
					},
				},
			})

			const result = add({ workspace, cli, branch: 'feat/thing' })

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(
				/^│ links +\S*core -> \.\.\/core created +│\n│ +\S*plc -> \.\.\/plc skipped: \S*plc missing +│$/m,
			)
		})

		it('a real folder where the sibling link goes → the links row says it is kept', () => {
			const { workspace, cli } = createWorkspace({})
			mkdirSync(join(workspace, '.worktrees', 'core'), { recursive: true })

			const result = add({ workspace, cli, branch: 'feat/thing' })

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(/^│ links +\S*core -> \.\.\/core kept: a real folder +│$/m)
		})

		it('a second worktree of the same repository → the sibling link reported present, left as it is', () => {
			const { workspace, cli, core } = createWorkspace({})

			const first = add({ workspace, cli, branch: 'feat/one', json: true })
			const second = add({ workspace, cli, branch: 'feat/two', json: true })

			const link = join(workspace, '.worktrees', 'core')
			expect([first.exitCode, second.exitCode]).toEqual([0, 0])
			expect(JSON.parse(second.output).siblingLinks).toEqual([
				{ dependency: '@dialecte/core', link, target: core, outcome: 'present' },
			])
			expect(readlinkSync(link)).toBe('../core')
		})

		it('the card → a links row naming the link made, a lockfile row counting the packages that match, no npm ci', () => {
			const { workspace, cli } = createWorkspace({})

			const result = add({ workspace, cli, branch: 'feat/thing' })

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(/^│ links +.*core -> \.\.\/core created +│$/m)
			expect(result.output).toMatch(
				/^│ lockfile +✓ node_modules matches package-lock\.json \(2 packages\) +│$/m,
			)
			expect(result.output).not.toContain('npm ci')
		})

		it('no file: nor link: dependency → no links row; the lockfile row still there', () => {
			const { workspace, cli } = createWorkspace({
				packageJson: { name: '@dialecte/cli', devDependencies: { demo: '1.0.0' } },
				lockPackages: {
					'': { name: '@dialecte/cli', devDependencies: { demo: '1.0.0' } },
					'node_modules/demo': { version: '1.0.0' },
				},
			})

			const result = add({ workspace, cli, branch: 'feat/thing' })

			expect(result.output).toMatch(
				/^│ lockfile +✓ node_modules matches package-lock\.json \(1 packages\) +│$/m,
			)
			expect(result.output).not.toMatch(/^│ links /m)
		})

		it('seven packages of the lock not installed → the first five named, the rest counted, a next row with npm ci; exit 0', () => {
			const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
			const { workspace, cli } = createWorkspace({
				packageJson: { name: '@dialecte/cli' },
				lockPackages: {
					'': { name: '@dialecte/cli' },
					...Object.fromEntries(
						names.map((name) => [`node_modules/${name}`, { version: '1.0.0' }]),
					),
				},
			})

			const result = add({ workspace, cli, branch: 'feat/thing' })

			const worktree = join(workspace, '.worktrees', '0001-cli-thing')
			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(
				/^│ lockfile +✗ 7 package\(s\) differ from package-lock\.json: a missing, b missing, c missing, d missing, e missing, and 2 more +│$/m,
			)
			expect(result.output.split('\n')).toContainEqual(
				expect.stringMatching(
					new RegExp(`^│ next +${escapeRegExp(`cd '${worktree}' && npm ci`)} +│$`),
				),
			)
		})

		it('nothing copied (no node_modules in the main checkout) → every package of the lock but the optional one missing, the npm ci command in the JSON', () => {
			const { workspace, cli } = createWorkspace({
				packageJson: { name: '@dialecte/cli', devDependencies: { demo: '1.0.0' } },
				lockPackages: {
					'': { name: '@dialecte/cli', devDependencies: { demo: '1.0.0' } },
					'node_modules/demo': { version: '1.0.0' },
					'node_modules/fsevents': { version: '2.3.3', optional: true },
				},
				installed: false,
			})

			const result = add({ workspace, cli, branch: 'feat/thing', json: true })

			const worktree = join(workspace, '.worktrees', '0001-cli-thing')
			expect(result.exitCode).toBe(0)
			expect(JSON.parse(result.output).nodeModulesCheck).toEqual({
				lockfile: 'package-lock.json',
				problems: [{ package: 'demo', problem: 'missing' }],
				command: `cd '${worktree}' && npm ci`,
			})
		})

		it('nothing copied → the card says the one package that differs', () => {
			const { workspace, cli } = createWorkspace({
				packageJson: { name: '@dialecte/cli', devDependencies: { demo: '1.0.0' } },
				lockPackages: {
					'': { name: '@dialecte/cli', devDependencies: { demo: '1.0.0' } },
					'node_modules/demo': { version: '1.0.0' },
				},
				installed: false,
			})

			const result = add({ workspace, cli, branch: 'feat/thing' })

			expect(result.output).toMatch(
				/^│ lockfile +✗ 1 package\(s\) differ from package-lock\.json: demo missing +│$/m,
			)
			expect(result.output).toMatch(/^│ next +cd '.*' && npm ci +│$/m)
		})

		it('no package-lock.json → the lockfile row says it was not checked; the JSON has no lockfile and no command', () => {
			const { workspace, cli } = createWorkspace({
				packageJson: { name: '@dialecte/cli' },
				lockPackages: undefined,
			})

			const card = add({ workspace, cli, branch: 'feat/thing' })
			const json = add({ workspace, cli, branch: 'feat/other', json: true })

			expect(card.exitCode).toBe(0)
			expect(card.output).toMatch(/^│ lockfile +no package-lock\.json: not checked +│$/m)
			expect(card.output).not.toMatch(/^│ next /m)
			expect(JSON.parse(json.output).nodeModulesCheck).toEqual({ problems: [] })
		})

		it('a dependency into a sibling folder missing under .worktrees/ (file:../core/sub/pkg) → exit 0 with the card, the link skipped', () => {
			const { workspace, cli, core } = createWorkspace({
				packageJson: { name: '@dialecte/cli', devDependencies: { pkg: 'file:../core/sub/pkg' } },
				lockPackages: { '': { name: '@dialecte/cli' } },
			})
			writeFiles({ root: join(core, 'sub', 'pkg'), files: { 'package.json': '{}\n' } })

			expect(addOrThrown({ workspace, cli, branch: 'feat/thing' })).toEqual({
				exitCode: 0,
				output: expect.stringMatching(
					/^│ links +\S*pkg -> \.\.\/core\/sub\/pkg skipped: \S+ missing +│$/m,
				),
			})
		})

		for (const lockfile of [
			{
				name: 'not JSON',
				text: '{ "lockfileVersion": 3, ',
				row: 'package-lock.json unreadable: not checked',
			},
			{
				name: 'without a packages map',
				text: '{ "name": "@dialecte/cli", "lockfileVersion": 1, "dependencies": {} }\n',
				row: 'package-lock.json has no packages map: not checked',
			},
		])
			it(`a package-lock.json ${lockfile.name} → exit 0, the lockfile row says it was not checked, no next row`, () => {
				const { workspace, cli } = createWorkspace({
					packageJson: { name: '@dialecte/cli' },
					lockPackages: undefined,
				})
				writeFiles({ root: cli, files: { 'package-lock.json': lockfile.text } })
				git({ root: cli, args: ['add', 'package-lock.json'] })
				git({ root: cli, args: ['commit', '-q', '-m', 'chore: lockfile'] })

				expect(addOrThrown({ workspace, cli, branch: 'feat/thing' })).toEqual({
					exitCode: 0,
					output: expect.stringMatching(
						new RegExp(`^│ lockfile +${escapeRegExp(lockfile.row)} +│$`, 'm'),
					),
				})
				expect(
					addOrThrown({ workspace, cli, branch: 'feat/other' })
						.output.split('\n')
						.filter((line) => line.startsWith('│ next ')),
				).toEqual([])
			})
	},
)

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
