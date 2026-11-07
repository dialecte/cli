/** `handover run --rehearse` and the node_modules pool: the clone takes a pooled node_modules, parks it back, and goes to the trash. */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { READ_LOT } from '../../test/scratch-checks.constants.ts'
import { editReadLot, writeHandoverFolder } from '../../test/scratch-checks.ts'
import { initializeRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import {
	LOCK_TEXT,
	MARKER_FILE,
	POOL_REHEARSAL_CASE_MS,
} from '../../test/worktree-pool.constants.ts'
import {
	createFakeNodeModules,
	createRecordingSpawner,
	poolEntriesOf,
	readTree,
	sha256Of,
	trashedNamesOf,
	writePoolEntry,
} from '../../test/worktree-pool.ts'
import { runHandoverRun } from './handover.ts'

import { describe, expect, it } from 'vitest'

/** A lockfile of a repository depending on its sibling `sib` through `file:../sib` (a link entry). */
const SIBLING_LOCK_TEXT = `${JSON.stringify({
	name: 'demo',
	lockfileVersion: 3,
	packages: {
		'': { name: 'demo', dependencies: { sib: 'file:../sib' } },
		'../sib': { name: 'sib', version: '1.0.0' },
		'node_modules/sib': { resolved: '../sib', link: true },
	},
})}\n`

/** The file only the main checkout's node_modules holds: a clone's node_modules with it was copied from there. */
const MAIN_ONLY_FILE = 'main-only.txt'

/**
 * A workspace (real path) with the repository `repo` (ignored node_modules with a marker of its own, a committed
 * lockfile, one lot of working changes) and its hand-over folder.
 */
function createScenario(params: { withWorktreesFolder?: boolean; sibling?: boolean } = {}): {
	workspace: string
	root: string
	out: string
	worktreesFolder: string
} {
	const workspace = realpathSync(temporaryFolder('dialecte-rehearsal-pool-'))
	const root = initializeRepository({
		root: join(workspace, 'repo'),
		files: {
			'.gitignore': 'node_modules\n',
			'package-lock.json': params.sibling ? SIBLING_LOCK_TEXT : LOCK_TEXT,
			...(params.sibling && {
				'package.json': `${JSON.stringify({ name: 'demo', dependencies: { sib: 'file:../sib' } })}\n`,
			}),
			'src/read.ts': 'export function read() {}\n',
			'CHANGELOG.md': '# Changelog\n',
		},
	})
	createFakeNodeModules({ folder: join(root, 'node_modules'), marker: 'from the main checkout\n' })
	if (params.sibling) {
		// a file: dependency: the sibling beside the repository, the repository's node_modules link to it
		mkdirSync(join(workspace, 'sib'))
		writeFileSync(join(workspace, 'sib', 'index.js'), 'module.exports = 1\n')
		symlinkSync('../../sib', join(root, 'node_modules', 'sib'))
	}
	editReadLot(root)
	const { out } = writeHandoverFolder({ root, lots: [READ_LOT] })
	// a workspace: its parent holds `.worktrees/`, where the pool and the trash live
	if (params.withWorktreesFolder !== false) mkdirSync(join(workspace, '.worktrees'))
	return { workspace, root, out, worktreesFolder: join(workspace, '.worktrees') }
}

/** `handover run <out> --rehearse` with the spawner recording the background removals. */
async function rehearse(params: {
	out: string
	keep?: boolean
	relink?: (params: { from: string; to: string; real: boolean }) => void
}) {
	const lines: string[] = []
	removeHookLogs({ lines })
	const scratchRoot = realpathSync(temporaryFolder('dialecte-scratch-root-'))
	const { spawner, calls } = createRecordingSpawner()
	const exitCode = await runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.out, '--rehearse', ...(params.keep ? ['--keep'] : [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot,
		spawner,
		relink: params.relink,
	})
	return { exitCode, text: lines.join('\n'), scratchRoot, calls }
}

describe(
	'handover run --rehearse: the node_modules pool',
	{ timeout: POOL_REHEARSAL_CASE_MS },
	() => {
		it('a matching pool entry → the clone node_modules taken from the pool (no copy), parked back after, the rehearsal folder in _trash/', async () => {
			const { workspace, out, worktreesFolder } = createScenario()
			writePoolEntry({
				worktreesFolder,
				name: '_pool-repo-1',
				entry: {
					repository: 'repo',
					lockHash: sha256Of(LOCK_TEXT),
					parkedAt: '2026-11-06T09:00:00.000Z',
				},
				marker: 'pooled\n',
				outsideTarget: join(workspace, 'core'),
			})

			const result = await rehearse({ out })

			expect(result.exitCode).toBe(0)
			expect(result.text).toMatch(/node_modules: pooled/)
			// taken, then parked back: one entry, the pooled marker, never the main checkout's file
			const [entry] = poolEntriesOf(worktreesFolder)
			expect(poolEntriesOf(worktreesFolder)).toHaveLength(1)
			const parked = readTree(join(worktreesFolder, entry, 'node_modules'))
			expect(parked[MARKER_FILE]).toBe('pooled\n')
			expect(parked[MAIN_ONLY_FILE]).toBeUndefined()
			const [trashedName] = trashedNamesOf(worktreesFolder)
			expect(trashedNamesOf(worktreesFolder)).toHaveLength(1)
			expect(trashedName).toMatch(/^dialecte-rehearse-/)
			expect(readdirSync(result.scratchRoot)).toEqual([])
			expect(result.calls).toEqual([
				{
					command: 'rm',
					args: ['-rf', join(worktreesFolder, '_trash', trashedName)],
					cwd: undefined,
				},
			])
		})

		it('--keep → as today: node_modules copied from the main checkout, the pool left as it was, nothing parked or trashed', async () => {
			const { workspace, root, out, worktreesFolder } = createScenario()
			writePoolEntry({
				worktreesFolder,
				name: '_pool-repo-1',
				entry: {
					repository: 'repo',
					lockHash: sha256Of(LOCK_TEXT),
					parkedAt: '2026-11-06T09:00:00.000Z',
				},
				marker: 'pooled\n',
				outsideTarget: join(workspace, 'core'),
			})

			const result = await rehearse({ out, keep: true })

			expect(result.exitCode).toBe(0)
			const [folder] = readdirSync(result.scratchRoot).map((name) => join(result.scratchRoot, name))
			expect(result.text).toContain(`kept the rehearsal folder: ${folder}`)
			expect(readTree(join(folder, 'repo', 'node_modules'))[MARKER_FILE]).toBe(
				'from the main checkout\n',
			)
			expect(readTree(join(root, 'node_modules'))[MARKER_FILE]).toBe('from the main checkout\n')
			expect(poolEntriesOf(worktreesFolder)).toEqual(['_pool-repo-1'])
			expect(readTree(join(worktreesFolder, '_pool-repo-1', 'node_modules'))[MARKER_FILE]).toBe(
				'pooled\n',
			)
			expect(trashedNamesOf(worktreesFolder)).toEqual([])
			expect(result.calls).toEqual([])
		})

		it('no pool → the clone node_modules copied as today, then parked at the end, the rehearsal folder in _trash/', async () => {
			const { out, worktreesFolder } = createScenario()

			const result = await rehearse({ out })

			expect(result.exitCode).toBe(0)
			expect(result.text).toMatch(/node_modules: copy/)
			expect(result.text).not.toMatch(/node_modules: pooled/)
			const [entry] = poolEntriesOf(worktreesFolder)
			expect(poolEntriesOf(worktreesFolder)).toHaveLength(1)
			expect(readTree(join(worktreesFolder, entry, 'node_modules'))[MARKER_FILE]).toBe(
				'from the main checkout\n',
			)
			const [trashedName] = trashedNamesOf(worktreesFolder)
			expect(trashedName).toMatch(/^dialecte-rehearse-/)
			expect(existsSync(join(worktreesFolder, '_trash', trashedName))).toBe(true)
			expect(result.calls).toEqual([
				{
					command: 'rm',
					args: ['-rf', join(worktreesFolder, '_trash', trashedName)],
					cwd: undefined,
				},
			])
			expect(readdirSync(result.scratchRoot)).toEqual([])
		})

		it('the end-of-rehearsal relink of the clone node_modules throws → the rehearsal own result is still reported (exit 0, its commits line), the rehearsal folder still gone from the scratch root', async () => {
			const { out } = createScenario()

			await expect(
				rehearse({
					out,
					relink: function failing() {
						throw new Error('the relink failed')
					},
				}),
			).resolves.toMatchObject({
				exitCode: 0,
				text: expect.stringContaining('rehearsed: 1 commit(s)'),
				scratchRoot: expect.any(String),
			})
		})

		it('the end-of-rehearsal relink throws → the scratch root holds no rehearsal folder after it', async () => {
			const { out } = createScenario()
			let scratchRoot = ''

			await expect(
				rehearse({
					out,
					relink: function failing() {
						throw new Error('the relink failed')
					},
				}).then(function keepRoot(result) {
					scratchRoot = result.scratchRoot
					return readdirSync(result.scratchRoot)
				}),
			).resolves.toEqual([])
			expect(scratchRoot).not.toBe('')
		})

		it('a file: sibling dependency (lockfile link entry) → the clone node_modules is parked back after the rehearsal', async () => {
			const { out, worktreesFolder } = createScenario({ sibling: true })

			const result = await rehearse({ out })

			expect(result.exitCode).toBe(0)
			expect(poolEntriesOf(worktreesFolder)).toHaveLength(1)
			const [trashedName] = trashedNamesOf(worktreesFolder).filter((name) =>
				name.startsWith('dialecte-rehearse-'),
			)
			expect(trashedName).toMatch(/^dialecte-rehearse-/)
		})

		it('a repository with no .worktrees/ beside it → rehearsed as today: node_modules copied, the folder removed in the foreground, nothing written outside the repository folder, no background delete', async () => {
			const { workspace, out } = createScenario({ withWorktreesFolder: false })
			const before = readdirSync(workspace).sort()

			const result = await rehearse({ out })

			expect(result.exitCode).toBe(0)
			expect(result.text).toMatch(/node_modules: copy/)
			expect(result.text).toContain('removed the rehearsal clone')
			expect(readdirSync(workspace).sort()).toEqual(before)
			expect(existsSync(join(workspace, '.worktrees'))).toBe(false)
			expect(readdirSync(result.scratchRoot)).toEqual([])
			expect(result.calls).toEqual([])
		})
	},
)
