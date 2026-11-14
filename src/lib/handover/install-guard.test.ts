import { createHash } from 'node:crypto'
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { removeHookLogs } from '../../../test/hook-logs.ts'
import { runFolder, writeHandoverFolder } from '../../../test/scratch-checks.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { shellQuote } from '../shell-quote.ts'
import { commitLots } from './commit-lots.ts'
import { HANDOVER_FILES } from './handover.constants.ts'
import { readInstallLine } from './install-guard.ts'

import { describe, expect, it, vi } from 'vitest'

import type { Installer, MergeLotPlan, ResolvedLot } from './handover.types.ts'

/** The word a lot's lines start with. */
const LOT = 'lot'

const LOT_A: ResolvedLot = { message: 'feat: a', files: ['a.txt'], deletedFiles: [] }
const LOT_B: ResolvedLot = { message: 'feat: b', files: ['b.txt'], deletedFiles: [] }

/** A lockfileVersion 3 `package-lock.json` locking each package at its version. */
function lockOf(packages: Record<string, string>): string {
	return `${JSON.stringify({
		name: 'scratch',
		lockfileVersion: 3,
		packages: {
			'': { name: 'scratch' },
			...Object.fromEntries(
				Object.entries(packages).map(([name, version]) => [`node_modules/${name}`, { version }]),
			),
		},
	})}\n`
}

/** `node_modules/<name>/package.json` holding each version. */
function installPackages(params: { root: string; installed: Record<string, string> }): void {
	writeFiles({
		root: params.root,
		files: Object.fromEntries(
			Object.entries(params.installed).map(([name, version]) => [
				`node_modules/${name}/package.json`,
				`${JSON.stringify({ name, version })}\n`,
			]),
		),
	})
}

/** A repository holding a.txt, b.txt and (when given) a lock, `node_modules` installed as given. */
function repositoryWith(params: { lock?: string; installed?: Record<string, string> }): string {
	const root = createScratchRepository({
		'a.txt': 'a\n',
		'b.txt': 'b\n',
		...(params.lock !== undefined && { 'package-lock.json': params.lock }),
	})
	installPackages({ root, installed: params.installed ?? {} })
	// the lots change these files
	writeFiles({ root, files: { 'a.txt': 'a changed\n', 'b.txt': 'b changed\n' } })
	return root
}

function neverInstalling(): Installer & ReturnType<typeof vi.fn> {
	return vi.fn(async () => ({ exitCode: 0, output: '' }))
}

function runLots(params: {
	root: string
	lots: ResolvedLot[]
	lines: string[]
	install: Installer
	installRecord?: string
	now?: () => Date
	worktree?: string
	onInstallRefusal?: (refusal: { exitCode: number }) => void
}) {
	return commitLots({
		root: params.root,
		lots: params.lots,
		commits: [],
		write: (line) => params.lines.push(line),
		clock: createFakeClock(),
		...(params.now && { now: params.now }),
		...(params.worktree !== undefined && { worktree: params.worktree }),
		...(params.onInstallRefusal && { onInstallRefusal: params.onInstallRefusal }),
		install: params.install,
		...(params.installRecord !== undefined && { installRecord: params.installRecord }),
	})
}

function linesOf(lines: string[]): string[] {
	return lines.flatMap((line) => line.split('\n'))
}

function refusalLine(params: { lot: number; root: string }): string {
	return `✗ lot ${params.lot} not committed: node_modules do not match package-lock.json: run npm ci in ${shellQuote(params.root)}`
}

function unstagedLine(lot: number): string {
	return `    its files are unstaged again, nothing else changed; fix the cause, then run the same command: it resumes at lot ${lot}`
}

function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** The sha256 of the lock on the disk of `root`. */
function diskLockHash(root: string): string {
	return sha256Of(readFileSync(join(root, 'package-lock.json'), 'utf8'))
}

/** Every `install.json` under the folder (node_modules left out). */
function installRecordsUnder(folder: string): string[] {
	return readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter(
		(name) => !name.startsWith('node_modules') && basename(name) === HANDOVER_FILES.install,
	)
}

function recordOf(path: string): unknown {
	return JSON.parse(readFileSync(path, 'utf8'))
}

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

function stagedIn(root: string): string {
	return git({ root, args: ['diff', '--cached', '--name-only'] }).trim()
}

const MISMATCHED_ONE = { locked: { 'left-pad': '1.3.0' }, installed: { 'left-pad': '1.0.0' } }

describe(
	'commitLots, case 36: node_modules differ from an unchanged lock',
	{ timeout: 30_000 },
	() => {
		it('one lot → not committed, HEAD unchanged, files unstaged again, the exact line then the mismatched package, installer never called', async () => {
			const root = repositoryWith({
				lock: lockOf(MISMATCHED_ONE.locked),
				installed: MISMATCHED_ONE.installed,
			})
			const head = headOf(root)
			const install = neverInstalling()
			const lines: string[] = []

			await expect(runLots({ root, lots: [LOT_A], lines, install })).resolves.toBeUndefined()

			const all = linesOf(lines)
			const at = all.indexOf(refusalLine({ lot: 1, root }))
			expect(all.slice(at, at + 3)).toEqual([
				refusalLine({ lot: 1, root }),
				'    left-pad: 1.0.0 installed, lock 1.3.0',
				unstagedLine(1),
			])
			expect(headOf(root)).toBe(head)
			expect(stagedIn(root)).toBe('')
			expect(install).not.toHaveBeenCalled()
		})

		it('two lots → neither is committed (the second is not reached: b.txt stays unstaged and uncommitted)', async () => {
			const root = repositoryWith({
				lock: lockOf(MISMATCHED_ONE.locked),
				installed: MISMATCHED_ONE.installed,
			})
			const head = headOf(root)
			const install = neverInstalling()
			const lines: string[] = []

			await expect(runLots({ root, lots: [LOT_A, LOT_B], lines, install })).resolves.toBeUndefined()

			expect(linesOf(lines).filter((line) => line.startsWith('✗ lot'))).toEqual([
				refusalLine({ lot: 1, root }),
			])
			expect(headOf(root)).toBe(head)
			expect(git({ root, args: ['status', '--porcelain', '--', 'a.txt', 'b.txt'] })).toBe(
				' M a.txt\n M b.txt\n',
			)
			expect(install).not.toHaveBeenCalled()
		})

		const manyCases = [
			{ name: '5 mismatched → 5 lines, no "more"', count: 5, tail: [] as string[] },
			{ name: '7 mismatched → 5 lines then "and 2 more"', count: 7, tail: ['    and 2 more'] },
		]
		it.each(manyCases)('$name', async ({ count, tail }) => {
			const names = Array.from({ length: count }, (_, index) => `pkg-${index + 1}`)
			const root = repositoryWith({
				lock: lockOf(Object.fromEntries(names.map((name) => [name, '2.0.0']))),
				installed: Object.fromEntries(names.map((name) => [name, '1.0.0'])),
			})
			const lines: string[] = []

			await expect(
				runLots({ root, lots: [LOT_A], lines, install: neverInstalling() }),
			).resolves.toBeUndefined()

			const all = linesOf(lines)
			const at = all.indexOf(refusalLine({ lot: 1, root }))
			expect(all.slice(at + 1, at + 2 + 5 + tail.length)).toEqual([
				...names.slice(0, 5).map((name) => `    ${name}: 1.0.0 installed, lock 2.0.0`),
				...tail,
				unstagedLine(1),
			])
		})
	},
)

describe('commitLots, case 37: a lot that stages a lock change', { timeout: 30_000 }, () => {
	it('node_modules brought to the staged lock by the installer (called once) → committed, no refusal of the guard', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.0.0' }),
			installed: { 'left-pad': '1.0.0' },
		})
		writeFiles({ root, files: { 'package-lock.json': lockOf({ 'left-pad': '1.3.0' }) } })
		const install: Installer = vi.fn(async () => {
			installPackages({ root, installed: { 'left-pad': '1.3.0' } })
			return { exitCode: 0, output: '' }
		})
		const lines: string[] = []
		const lot: ResolvedLot = {
			message: 'chore: bump left-pad',
			files: ['package-lock.json'],
			deletedFiles: [],
		}

		await expect(runLots({ root, lots: [lot], lines, install })).resolves.toHaveLength(1)

		expect(install).toHaveBeenCalledTimes(1)
		expect(linesOf(lines).filter((line) => line.startsWith('✗'))).toEqual([])
	})

	it('the matching install is recorded: install.json ok for the lock the commit holds', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.0.0' }),
			installed: { 'left-pad': '1.0.0' },
		})
		writeFiles({ root, files: { 'package-lock.json': lockOf({ 'left-pad': '1.3.0' }) } })
		async function install() {
			installPackages({ root, installed: { 'left-pad': '1.3.0' } })
			return { exitCode: 0, output: '' }
		}
		const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
		const lot: ResolvedLot = {
			message: 'chore: bump left-pad',
			files: ['package-lock.json'],
			deletedFiles: [],
		}

		await expect(
			runLots({
				root,
				lots: [lot],
				lines: [],
				install,
				installRecord: record,
				now: () => new Date('2026-11-13T08:00:00.000Z'),
			}),
		).resolves.toHaveLength(1)

		expect(recordOf(record)).toEqual({
			at: '2026-11-13T08:00:00.000Z',
			lock: diskLockHash(root),
			working: diskLockHash(root),
			ok: true,
			mismatched: 0,
		})
	})
})

describe('commitLots, case 38: no package-lock.json', { timeout: 30_000 }, () => {
	it('committed, no install line printed, no install.json written', async () => {
		const root = repositoryWith({})
		const folder = temporaryFolder('dialecte-install-record-')
		const record = join(folder, HANDOVER_FILES.install)
		const install = neverInstalling()
		const lines: string[] = []

		await expect(
			runLots({ root, lots: [LOT_A], lines, install, installRecord: record }),
		).resolves.toHaveLength(1)

		expect(
			linesOf(lines).map((line) =>
				line.replace(/^✓ [0-9a-f]{12} (.*?) {2}\d+\.\d s$/, '✓ <sha> $1'),
			),
		).toEqual([
			`▶ ${LOT} 1/1  1 file(s)  feat: a`,
			'✓ <sha> feat: a',
			'   a.txt | 2 +-',
			'   1 file changed, 1 insertion(+), 1 deletion(-)',
		])
		expect(existsSync(record)).toBe(false)
		expect([...installRecordsUnder(folder), ...installRecordsUnder(root)]).toEqual([])
		expect(install).not.toHaveBeenCalled()
	})
})

describe('commitLots, install.json', { timeout: 30_000 }, () => {
	it('a refused lot leaves ok false with its count, whole object, at the wall-clock time', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.3.0', 'right-pad': '2.0.0', 'mid-pad': '3.0.0' }),
			installed: { 'left-pad': '1.0.0', 'right-pad': '2.0.0', 'mid-pad': '9.9.9' },
		})
		const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
		function now(): Date {
			return new Date('2026-11-13T08:00:00.000Z')
		}

		await expect(
			runLots({
				root,
				lots: [LOT_A],
				lines: [],
				install: neverInstalling(),
				installRecord: record,
				now,
			}),
		).resolves.toBeUndefined()

		expect(recordOf(record)).toEqual({
			at: '2026-11-13T08:00:00.000Z',
			lock: diskLockHash(root),
			working: diskLockHash(root),
			ok: false,
			mismatched: 2,
		})
	})

	it('a green rerun replaces the refused record whole', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.3.0' }),
			installed: { 'left-pad': '1.0.0' },
		})
		const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
		await expect(
			runLots({
				root,
				lots: [LOT_A],
				lines: [],
				install: neverInstalling(),
				installRecord: record,
				now: () => new Date('2026-11-13T08:00:00.000Z'),
			}),
		).resolves.toBeUndefined()
		installPackages({ root, installed: { 'left-pad': '1.3.0' } })

		await expect(
			runLots({
				root,
				lots: [LOT_A],
				lines: [],
				install: neverInstalling(),
				installRecord: record,
				now: () => new Date('2026-11-13T08:01:00.000Z'),
			}),
		).resolves.toHaveLength(1)

		expect(recordOf(record)).toEqual({
			at: '2026-11-13T08:01:00.000Z',
			lock: diskLockHash(root),
			working: diskLockHash(root),
			ok: true,
			mismatched: 0,
		})
	})

	it('the record holds the lock of the worktree given (the repository), not the commit root', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.3.0' }),
			installed: { 'left-pad': '1.3.0' },
		})
		const worktree = temporaryFolder('dialecte-install-worktree-')
		const worktreeLock = lockOf({ 'left-pad': '4.0.0' })
		writeFiles({ root: worktree, files: { 'package-lock.json': worktreeLock } })
		const folder = temporaryFolder('dialecte-install-record-')

		await expect(
			runLots({
				root,
				lots: [LOT_A],
				lines: [],
				install: neverInstalling(),
				installRecord: join(folder, HANDOVER_FILES.install),
				worktree,
				now: () => new Date('2026-11-13T08:00:00.000Z'),
			}),
		).resolves.toHaveLength(1)

		expect(recordOf(join(folder, HANDOVER_FILES.install))).toEqual({
			at: '2026-11-13T08:00:00.000Z',
			lock: diskLockHash(root),
			working: sha256Of(worktreeLock),
			ok: true,
			mismatched: 0,
		})
	})

	it('no installRecord → committed without refusal and no install.json in the repository', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.3.0' }),
			installed: { 'left-pad': '1.3.0' },
		})
		const folder = temporaryFolder('dialecte-install-record-')

		await expect(
			runLots({ root, lots: [LOT_A], lines: [], install: neverInstalling() }),
		).resolves.toHaveLength(1)

		expect([...installRecordsUnder(folder), ...installRecordsUnder(root)]).toEqual([])
	})
})

describe('commitLots, case 5: a lock that cannot be read, unchanged', { timeout: 30_000 }, () => {
	const unreadable = [
		{ name: 'not JSON', lock: 'not json {\n', reason: 'unreadable' },
		{
			name: 'no packages map',
			lock: `${JSON.stringify({ lockfileVersion: 3 })}\n`,
			reason: 'has no packages map',
		},
	]
	it.each(unreadable)(
		'$name → refused naming the reason, never read as ok',
		async ({ lock, reason }) => {
			const root = repositoryWith({ lock })
			const head = headOf(root)
			const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
			const lines: string[] = []
			const install = neverInstalling()

			await expect(
				runLots({
					root,
					lots: [LOT_A],
					lines,
					install,
					installRecord: record,
					now: () => new Date('2026-11-13T08:00:00.000Z'),
				}),
			).resolves.toBeUndefined()

			expect(linesOf(lines).slice(1)).toEqual([
				`✗ ${LOT} 1 not committed: package-lock.json ${reason}: run npm ci in ${shellQuote(root)}`,
				unstagedLine(1),
			])
			expect(headOf(root)).toBe(head)
			expect(stagedIn(root)).toBe('')
			expect(install).not.toHaveBeenCalled()
			expect(recordOf(record)).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: diskLockHash(root),
				working: diskLockHash(root),
				ok: false,
				mismatched: 0,
			})
		},
	)
})

describe(
	'commitLots, the message names the repository, not a rehearsal clone',
	{ timeout: 30_000 },
	() => {
		it('worktree given → the refusal names it (shell-quoted), not the commit root', async () => {
			const root = repositoryWith({
				lock: lockOf(MISMATCHED_ONE.locked),
				installed: MISMATCHED_ONE.installed,
			})
			const worktree = '/work/the repository'
			const lines: string[] = []

			await expect(
				runLots({ root, lots: [LOT_A], lines, install: neverInstalling(), worktree }),
			).resolves.toBeUndefined()

			expect(linesOf(lines).slice(1)).toEqual([
				refusalLine({ lot: 1, root: worktree }),
				'    left-pad: 1.0.0 installed, lock 1.3.0',
				unstagedLine(1),
			])
		})
	},
)

describe(
	'commitLots, the guard reads the lock the commit holds (the index)',
	{ timeout: 30_000 },
	() => {
		const OLD_LOCK = lockOf({ 'left-pad': '1.0.0' })
		const NEW_LOCK = lockOf({ 'left-pad': '1.3.0' })
		const LOT_LOCK: ResolvedLot = {
			message: 'chore: bump left-pad',
			files: ['package-lock.json'],
			deletedFiles: [],
		}
		function fixedNow(): Date {
			return new Date('2026-11-13T08:00:00.000Z')
		}

		/** HEAD holds the old lock, the working copy is a later lot's new lock. */
		function codeThenBump(installed: string): string {
			const root = repositoryWith({ lock: OLD_LOCK, installed: { 'left-pad': installed } })
			writeFiles({ root, files: { 'package-lock.json': NEW_LOCK } })
			return root
		}

		it('(i) code lot then bump lot, node_modules at the old lock → the first lot commits, the second goes through the installer (once) and commits; the record holds the index lock of the second lot', async () => {
			const root = codeThenBump('1.0.0')
			const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
			const install: Installer = vi.fn(async () => {
				installPackages({ root, installed: { 'left-pad': '1.3.0' } })
				return { exitCode: 0, output: '' }
			})
			const lines: string[] = []

			await expect(
				runLots({
					root,
					lots: [LOT_A, LOT_LOCK],
					lines,
					install,
					installRecord: record,
					now: fixedNow,
				}),
			).resolves.toHaveLength(2)

			expect(install).toHaveBeenCalledTimes(1)
			expect(linesOf(lines).filter((line) => line.startsWith('✗'))).toEqual([])
			expect(recordOf(record)).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: sha256Of(NEW_LOCK),
				working: sha256Of(NEW_LOCK),
				ok: true,
				mismatched: 0,
			})
		})

		it("(ii) the same hand-over, node_modules already at the new lock → the first lot refused naming why, nothing committed, installer not called; the record holds the first lot's index lock", async () => {
			const root = codeThenBump('1.3.0')
			const head = headOf(root)
			const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
			const install = neverInstalling()
			const lines: string[] = []

			await expect(
				runLots({
					root,
					lots: [LOT_A, LOT_LOCK],
					lines,
					install,
					installRecord: record,
					now: fixedNow,
				}),
			).resolves.toBeUndefined()

			expect(linesOf(lines).slice(1)).toEqual([
				`✗ ${LOT} 1 not committed: node_modules do not match the package-lock.json ${LOT} 1 commits (a later ${LOT} changes it): run npm ci with that lock, or commit the lock change first`,
				'    left-pad: 1.3.0 installed, lock 1.0.0',
				unstagedLine(1),
			])
			expect(headOf(root)).toBe(head)
			expect(stagedIn(root)).toBe('')
			expect(install).not.toHaveBeenCalled()
			expect(recordOf(record)).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: sha256Of(OLD_LOCK),
				working: sha256Of(NEW_LOCK),
				ok: false,
				mismatched: 1,
				laterLock: true,
			})
		})

		it('(ii) the card of that hand-over folder shows the failed install line with its count; once the working lock moved, no line', async () => {
			const root = codeThenBump('1.3.0')
			const folder = temporaryFolder('dialecte-install-record-')

			await expect(
				runLots({
					root,
					lots: [LOT_A, LOT_LOCK],
					lines: [],
					install: neverInstalling(),
					installRecord: join(folder, HANDOVER_FILES.install),
					now: fixedNow,
				}),
			).resolves.toBeUndefined()

			expect(readInstallLine({ folder, worktree: root })).toEqual({
				name: 'install',
				status: 'failed',
				detail:
					'node_modules do not match the package-lock.json the next lot commits (1 package(s)): a later lot changes it: run npm ci with that lock, or commit the lock change first',
			})
			writeFiles({ root, files: { 'package-lock.json': lockOf({ 'left-pad': '2.0.0' }) } })
			expect(readInstallLine({ folder, worktree: root })).toBeUndefined()
		})
	},
)

describe('commitLots, the working lock differs from the index lock', { timeout: 30_000 }, () => {
	it('node_modules match neither lock → the later-lot line, the packages against the index lock, the undo line', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.0.0' }),
			installed: { 'left-pad': '1.1.0' },
		})
		writeFiles({ root, files: { 'package-lock.json': lockOf({ 'left-pad': '1.3.0' }) } })
		const head = headOf(root)
		const install = neverInstalling()
		const lines: string[] = []

		await expect(
			runLots({
				root,
				lots: [LOT_A, { message: 'chore: bump', files: ['package-lock.json'], deletedFiles: [] }],
				lines,
				install,
			}),
		).resolves.toBeUndefined()

		expect(linesOf(lines).slice(1)).toEqual([
			`✗ ${LOT} 1 not committed: node_modules do not match the package-lock.json ${LOT} 1 commits (a later ${LOT} changes it): run npm ci with that lock, or commit the lock change first`,
			'    left-pad: 1.1.0 installed, lock 1.0.0',
			unstagedLine(1),
		])
		expect(headOf(root)).toBe(head)
		expect(install).not.toHaveBeenCalled()
	})
})

describe('commitLots, install.json across lots and runs', { timeout: 30_000 }, () => {
	it("the first lot passes, its commit hook breaks node_modules, the second is refused → the record is the second lot's check (its `at`, ok false)", async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.3.0' }),
			installed: { 'left-pad': '1.3.0' },
		})
		const hookRuns = join(temporaryFolder('dialecte-hook-runs-'), 'runs.txt')
		writeFiles({
			root,
			files: {
				'.githooks/pre-commit': [
					'#!/bin/sh',
					`echo run >> '${hookRuns}'`,
					`printf '{"name":"left-pad","version":"9.9.9"}\\n' > node_modules/left-pad/package.json`,
					'',
				].join('\n'),
			},
		})
		chmodSync(join(root, '.githooks/pre-commit'), 0o755)
		git({ root, args: ['config', 'core.hooksPath', '.githooks'] })
		const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
		// the minute is the number of hook runs so far: the first lot's check is before its hook, the second's after it
		function now(): Date {
			const runs = existsSync(hookRuns)
				? readFileSync(hookRuns, 'utf8').split('\n').filter(Boolean).length
				: 0
			return new Date(Date.UTC(2026, 10, 13, 8, runs, 0))
		}
		const lines: string[] = []
		removeHookLogs({ lines })

		await expect(
			runLots({
				root,
				lots: [LOT_A, LOT_B],
				lines,
				install: neverInstalling(),
				installRecord: record,
				now,
			}),
		).resolves.toBeUndefined()

		expect(linesOf(lines).filter((line) => line.startsWith('✗ lot'))).toEqual([
			refusalLine({ lot: 2, root }),
		])
		expect(git({ root, args: ['log', '--format=%s', '-1'] }).trim()).toBe('feat: a')
		expect(recordOf(record)).toEqual({
			at: '2026-11-13T08:01:00.000Z',
			lock: diskLockHash(root),
			working: diskLockHash(root),
			ok: false,
			mismatched: 1,
		})
	})

	it('an install.json that already holds other keys → replaced whole, without them', async () => {
		const root = repositoryWith({
			lock: lockOf({ 'left-pad': '1.3.0' }),
			installed: { 'left-pad': '1.3.0' },
		})
		const record = join(temporaryFolder('dialecte-install-record-'), HANDOVER_FILES.install)
		writeFileSync(record, '{"stale":true}\n')

		await expect(
			runLots({
				root,
				lots: [LOT_A],
				lines: [],
				install: neverInstalling(),
				installRecord: record,
				now: () => new Date('2026-11-13T08:00:00.000Z'),
			}),
		).resolves.toHaveLength(1)

		expect(recordOf(record)).toEqual({
			at: '2026-11-13T08:00:00.000Z',
			lock: diskLockHash(root),
			working: diskLockHash(root),
			ok: true,
			mismatched: 0,
		})
	})
})

describe(
	'commitLots, the working lock holds other bytes than the index lock for git (line endings)',
	{ timeout: 30_000 },
	() => {
		const LOCK_LF = lockOf({ 'left-pad': '1.3.0' })
		const LOCK_CRLF = LOCK_LF.replaceAll('\n', '\r\n')

		/** `package-lock.json` is checked out with CRLF (a `.gitattributes` rule): the index holds LF, the disk CRLF. */
		function crlfRepository(installed: string): string {
			const root = createScratchRepository({
				'.gitattributes': 'package-lock.json text eol=crlf\n',
				'a.txt': 'a\n',
				'package-lock.json': LOCK_LF,
			})
			installPackages({ root, installed: { 'left-pad': installed } })
			writeFiles({ root, files: { 'a.txt': 'a changed\n' } })
			writeFileSync(join(root, 'package-lock.json'), LOCK_CRLF)
			return root
		}

		it('git sees the lock unchanged, node_modules mismatched → the plain case-36 line, never the later-lot line', async () => {
			const root = crlfRepository('1.0.0')
			const head = headOf(root)
			const lines: string[] = []
			const folder = temporaryFolder('dialecte-install-record-')

			await expect(
				runLots({
					root,
					lots: [LOT_A],
					lines,
					install: neverInstalling(),
					installRecord: join(folder, HANDOVER_FILES.install),
					now: () => new Date('2026-11-13T08:00:00.000Z'),
				}),
			).resolves.toBeUndefined()

			expect(linesOf(lines).slice(1)).toEqual([
				refusalLine({ lot: 1, root }),
				'    left-pad: 1.0.0 installed, lock 1.3.0',
				unstagedLine(1),
			])
			expect(headOf(root)).toBe(head)
			// git's view: the lock is unchanged, so no later-lot mark
			expect(recordOf(join(folder, HANDOVER_FILES.install))).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: sha256Of(LOCK_LF),
				working: sha256Of(LOCK_CRLF),
				ok: false,
				mismatched: 1,
			})
		})

		it('git sees the lock unchanged, node_modules matching → committed; the record holds both hashes and the card shows the passed line', async () => {
			const root = crlfRepository('1.3.0')
			const folder = temporaryFolder('dialecte-install-record-')

			await expect(
				runLots({
					root,
					lots: [LOT_A],
					lines: [],
					install: neverInstalling(),
					installRecord: join(folder, HANDOVER_FILES.install),
					now: () => new Date('2026-11-13T08:00:00.000Z'),
				}),
			).resolves.toHaveLength(1)

			expect(recordOf(join(folder, HANDOVER_FILES.install))).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: sha256Of(LOCK_LF),
				working: sha256Of(LOCK_CRLF),
				ok: true,
				mismatched: 0,
			})
			expect(readInstallLine({ folder, worktree: root })).toEqual({
				name: 'install',
				status: 'passed',
				detail: `node_modules match package-lock.json (${sha256Of(LOCK_LF).slice(0, 12)})`,
			})
		})
	},
)

describe('commitLots, a check that cannot be made fails closed', { timeout: 60_000 }, () => {
	const LOCK = lockOf({ 'left-pad': '1.3.0' })

	/** Removes the lock's blob from the repository's objects: the index lists the lock, git cannot read it. */
	function loseLockBlob(root: string): void {
		const oid = git({ root, args: ['rev-parse', 'HEAD:package-lock.json'] }).trim()
		unlinkSync(join(root, '.git', 'objects', oid.slice(0, 2), oid.slice(2)))
	}

	it('a lock the index holds but git cannot read → refused naming the lock, nothing committed, files unstaged again', async () => {
		const root = repositoryWith({ lock: LOCK, installed: { 'left-pad': '1.3.0' } })
		loseLockBlob(root)
		const head = headOf(root)
		const lines: string[] = []

		await expect(
			runLots({ root, lots: [LOT_A], lines, install: neverInstalling() }),
		).resolves.toBeUndefined()

		const refusals = linesOf(lines).filter((line) => line.startsWith(`✗ ${LOT} 1 not committed: `))
		expect(refusals).toEqual([
			expect.stringMatching(
				new RegExp(
					`^✗ ${LOT} 1 not committed: package-lock\\.json in the index could not be read: `,
				),
			),
		])
		expect(linesOf(lines)).toContain(unstagedLine(1))
		expect(headOf(root)).toBe(head)
		expect(stagedIn(root)).toBe('')
	})

	it('a lock the index holds but git cannot read, an install.json of an earlier lot in the folder → refused, no install.json left behind', async () => {
		const root = repositoryWith({ lock: LOCK, installed: { 'left-pad': '1.3.0' } })
		const folder = temporaryFolder('dialecte-install-record-')
		const record = join(folder, HANDOVER_FILES.install)
		writeFileSync(
			record,
			`${JSON.stringify({ at: '2026-11-13T07:00:00.000Z', lock: sha256Of(LOCK), working: sha256Of(LOCK), ok: true, mismatched: 0 })}\n`,
		)
		loseLockBlob(root)
		const lines: string[] = []

		await expect(
			runLots({
				root,
				lots: [LOT_A],
				lines,
				install: neverInstalling(),
				installRecord: record,
			}),
		).resolves.toBeUndefined()

		expect(
			linesOf(lines).filter((line) => line.startsWith(`✗ ${LOT} 1 not committed: `)),
		).toHaveLength(1)
		expect(existsSync(record)).toBe(false)
		expect(readInstallLine({ folder, worktree: root })).toBeUndefined()
	})

	describe('a lot staging a lock that does not parse', () => {
		const LOT_LOCK_BROKEN: ResolvedLot = {
			message: 'chore: break the lock',
			files: ['package-lock.json'],
			deletedFiles: [],
		}

		it('commitLots → refused, never a throw: the line, the undo line, HEAD unchanged, nothing staged, installer not called', async () => {
			const root = repositoryWith({ lock: LOCK, installed: { 'left-pad': '1.3.0' } })
			writeFiles({ root, files: { 'package-lock.json': '{ broken\n' } })
			const head = headOf(root)
			const install = neverInstalling()
			const lines: string[] = []
			const onInstallRefusal = vi.fn()

			await expect(
				runLots({ root, lots: [LOT_LOCK_BROKEN], lines, install, onInstallRefusal }),
			).resolves.toBeUndefined()

			const all = linesOf(lines)
			expect(all.filter((line) => line.startsWith(`✗ ${LOT} 1 not committed: `))).toEqual([
				expect.stringMatching(
					new RegExp(
						`^✗ ${LOT} 1 not committed: package-lock\\.json in the index does not parse: .`,
					),
				),
			])
			expect(all).toContain(unstagedLine(1))
			expect(headOf(root)).toBe(head)
			expect(stagedIn(root)).toBe('')
			expect(install).not.toHaveBeenCalled()
			// a sync refusal exits as the guard's: 2
			expect(onInstallRefusal.mock.calls).toEqual([[{ exitCode: 2 }]])
		})
	})

	it('a record folder that does not exist → the lot commits, the line says the record was not written', async () => {
		const root = repositoryWith({ lock: LOCK, installed: { 'left-pad': '1.3.0' } })
		const record = join(
			temporaryFolder('dialecte-install-record-'),
			'no-such-folder',
			'install.json',
		)
		const lines: string[] = []

		await expect(
			runLots({ root, lots: [LOT_A], lines, install: neverInstalling(), installRecord: record }),
		).resolves.toHaveLength(1)

		expect(
			linesOf(lines).filter((line) => line.startsWith('! install.json not written: ')),
		).toEqual([expect.stringMatching(/^! install\.json not written: ENOENT/)])
		expect(existsSync(record)).toBe(false)
	})

	it('a lock entry the check throws on (a link whose resolved is a number) → refused with the reason, nothing committed, files unstaged again', async () => {
		const lock = `${JSON.stringify({
			lockfileVersion: 3,
			packages: { '': {}, 'node_modules/dep': { link: true, resolved: 5 } },
		})}\n`
		const root = repositoryWith({ lock })
		const head = headOf(root)
		const lines: string[] = []

		await expect(
			runLots({ root, lots: [LOT_A], lines, install: neverInstalling() }),
		).resolves.toBeUndefined()

		const refusals = linesOf(lines).filter((line) => line.startsWith(`✗ ${LOT} 1 not committed: `))
		// the refusal carries the thrown reason: it is none of the guard's known texts
		expect(refusals).toHaveLength(1)
		expect(refusals[0]).toMatch(new RegExp(`^✗ ${LOT} 1 not committed: .`))
		expect(refusals[0]).not.toMatch(
			/do not match|run npm ci|could not be read|unreadable|has no packages map/,
		)
		expect(linesOf(lines)).toContain(unstagedLine(1))
		expect(headOf(root)).toBe(head)
		expect(stagedIn(root)).toBe('')
	})
})

describe(
	'commitLots, a lot that stages a lock change is checked after the install',
	{ timeout: 30_000 },
	() => {
		it('the install leaves a link elsewhere than the lock resolves it to → refused by the guard, the record says ok false', async () => {
			const newLock = `${JSON.stringify({
				lockfileVersion: 3,
				packages: {
					'': {},
					'node_modules/left-pad': { version: '1.3.0' },
					'node_modules/dep': { link: true, resolved: 'deps/dep' },
				},
			})}\n`
			const root = repositoryWith({
				lock: lockOf({ 'left-pad': '1.0.0' }),
				installed: { 'left-pad': '1.0.0' },
			})
			writeFiles({
				root,
				files: {
					'package-lock.json': newLock,
					'deps/dep/index.js': '\n',
					'elsewhere/index.js': '\n',
				},
			})
			const install: Installer = vi.fn(async () => {
				installPackages({ root, installed: { 'left-pad': '1.3.0' } })
				mkdirSync(join(root, 'node_modules'), { recursive: true })
				symlinkSync('../elsewhere', join(root, 'node_modules', 'dep'))
				return { exitCode: 0, output: '' }
			})
			const folder = temporaryFolder('dialecte-install-record-')
			const head = headOf(root)
			const lines: string[] = []

			await expect(
				runLots({
					root,
					lots: [{ message: 'chore: bump', files: ['package-lock.json'], deletedFiles: [] }],
					lines,
					install,
					installRecord: join(folder, HANDOVER_FILES.install),
					now: () => new Date('2026-11-13T08:00:00.000Z'),
				}),
			).resolves.toBeUndefined()

			const all = linesOf(lines)
			const at = all.indexOf(refusalLine({ lot: 1, root }))
			expect(all.slice(at, at + 3)).toEqual([
				refusalLine({ lot: 1, root }),
				'    dep: link to deps/dep points elsewhere',
				unstagedLine(1),
			])
			expect(install).toHaveBeenCalledTimes(1)
			expect(headOf(root)).toBe(head)
			expect(recordOf(join(folder, HANDOVER_FILES.install))).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: sha256Of(newLock),
				working: sha256Of(newLock),
				ok: false,
				mismatched: 1,
			})
		})
	},
)

describe(
	'handover run, the lots the guard meets that are no plain commit',
	{ timeout: 60_000 },
	() => {
		const LOCK = lockOf({ 'left-pad': '1.3.0' })

		it('a merge lot refused by the guard → the merge aborted (no merge in progress, HEAD unchanged), exit 2, the record holds the check', async () => {
			const root = createScratchRepository({
				'.gitignore': 'node_modules\n',
				'a.txt': 'a\n',
				'package-lock.json': LOCK,
			})
			installPackages({ root, installed: { 'left-pad': '1.0.0' } })
			git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
			writeFiles({ root, files: { 'b.txt': 'b\n' } })
			git({ root, args: ['add', 'b.txt'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: b'] })
			const tip = headOf(root)
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({ root, files: { 'c.txt': 'c\n' } })
			git({ root, args: ['add', 'c.txt'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: c'] })
			const mergeLot: MergeLotPlan = {
				kind: 'merge',
				branch: 'feat/x',
				tip,
				resolved: {},
				message: 'merge: bring feat/x in',
				// the tree the merge makes, as a rehearsal prints it
				tree: git({ root, args: ['merge-tree', '--write-tree', 'main', 'feat/x'] }).trim(),
			}
			const { out } = writeHandoverFolder({ root, lots: [mergeLot] })
			const head = headOf(root)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(2)
			expect(ran.text.split('\n')).toContain(refusalLine({ lot: 1, root }))
			expect(headOf(root)).toBe(head)
			expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(false)
			expect(git({ root, args: ['status', '--porcelain'] })).toBe('')
			expect(recordOf(join(out, HANDOVER_FILES.install))).toEqual({
				at: expect.any(String),
				lock: sha256Of(LOCK),
				working: sha256Of(LOCK),
				ok: false,
				mismatched: 1,
			})
		})

		it('a lot deleting the lock, after a lot that was checked → committed, no check of its own, the earlier record stays as written and the card shows no line', async () => {
			const root = repositoryWith({ lock: LOCK, installed: { 'left-pad': '1.3.0' } })
			const hookRuns = join(temporaryFolder('dialecte-hook-runs-'), 'runs.txt')
			// the lock is gone from the disk once the first lot's check is made, as the run's second lot leaves it
			writeFiles({
				root,
				files: {
					'.githooks/pre-commit': [
						'#!/bin/sh',
						`echo run >> '${hookRuns}'`,
						'rm -f package-lock.json',
						'',
					].join('\n'),
				},
			})
			chmodSync(join(root, '.githooks/pre-commit'), 0o755)
			git({ root, args: ['config', 'core.hooksPath', '.githooks'] })
			const folder = temporaryFolder('dialecte-install-record-')
			function now(): Date {
				const runs = existsSync(hookRuns)
					? readFileSync(hookRuns, 'utf8').split('\n').filter(Boolean).length
					: 0
				return new Date(Date.UTC(2026, 10, 13, 8, runs, 0))
			}
			const lines: string[] = []
			removeHookLogs({ lines })

			await expect(
				runLots({
					root,
					lots: [
						LOT_A,
						{ message: 'chore: drop the lock', files: [], deletedFiles: ['package-lock.json'] },
					],
					lines,
					install: neverInstalling(),
					installRecord: join(folder, HANDOVER_FILES.install),
					now,
				}),
			).resolves.toHaveLength(2)

			expect(linesOf(lines).filter((line) => line.startsWith('✗'))).toEqual([])
			expect(git({ root, args: ['ls-files', 'package-lock.json'] })).toBe('')
			expect(recordOf(join(folder, HANDOVER_FILES.install))).toEqual({
				at: '2026-11-13T08:00:00.000Z',
				lock: sha256Of(LOCK),
				working: sha256Of(LOCK),
				ok: true,
				mismatched: 0,
			})
			expect(readInstallLine({ folder, worktree: root })).toBeUndefined()
		})
	},
)
