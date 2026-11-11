import { spawn, spawnSync } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { readEntry } from '../../test/handover-store-scenario.ts'
import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import {
	HOLDING_PROCESS_SECONDS,
	HOLDING_PROCESS_START_MS,
	LOCK_TEXT,
	MARKER_FILE,
	MISMATCHED_LOCK_TEXT,
	OUTSIDE_LINK,
	POOL_COMMAND_CASE_MS,
} from '../../test/worktree-pool.constants.ts'
import {
	createFakeNodeModules,
	createRecordingSpawner,
	poolEntriesOf,
	readPoolFile,
	readTree,
	sha256Of,
	trashedNamesOf,
} from '../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverClosed,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { startRun } from '../lib/mutation/run-store.ts'
import { runLotClose } from './lot-close.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { HandoverEntryState } from '../lib/handover/handover.types.ts'

const NOW = new Date('2026-11-06T10:00:00Z')

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

type Scenario = {
	repository: string
	worktreesFolder: string
}

/** A workspace (real path) with the main checkout `repo`: an ignored node_modules, a committed lockfile. */
function createScenario(): Scenario {
	const workspace = realpathSync(temporaryFolder('dialecte-lot-close-'))
	const repository = initializeRepository({
		root: join(workspace, 'repo'),
		files: {
			'.gitignore': 'node_modules\n',
			'package.json': '{ "name": "demo" }\n',
			'package-lock.json': LOCK_TEXT,
			'src/a.ts': 'a\n',
		},
	})
	return { repository, worktreesFolder: join(workspace, '.worktrees') }
}

/**
 * A lot, registered through the store's own writer as `state`: its worktree `.worktrees/<index>-repo-<tail>` on
 * `feat/<tail>` with one commit of its own (not in main: a committed hand-over has such commits) and its
 * node_modules marked `lot <tail>`; or, with `main`, the main checkout itself (its node_modules marked
 * `lot main`).
 */
function createLot(params: {
	scenario: Scenario
	index: string
	tail: string
	state: HandoverEntryState
	untracked?: boolean
	main?: boolean
	/** False: no registry entry; its `name` is then empty. */
	register?: boolean
	/** Committed with the lot's commit as its `package-lock.json`: the lot's node_modules then differs from it. */
	lockText?: string
	/** A `file:../sib` dependency: the sibling beside the repository, its link under `.worktrees/`, the lot's link to it. */
	sibling?: boolean
}): { name: string; worktree: string } {
	const { repository, worktreesFolder } = params.scenario
	const tail = params.main ? 'main' : params.tail
	const branch = params.main ? 'main' : `feat/${tail}`
	const worktree = params.main ? repository : join(worktreesFolder, `${params.index}-repo-${tail}`)
	if (!params.main) {
		git({ root: repository, args: ['worktree', 'add', '-q', '-b', branch, worktree] })
		writeFiles({
			root: worktree,
			files: {
				[`src/${tail}.ts`]: 'export {}\n',
				...(params.lockText && { 'package-lock.json': params.lockText }),
				...(params.sibling && { 'package-lock.json': SIBLING_LOCK_TEXT }),
			},
		})
		git({ root: worktree, args: ['add', '-A'] })
		git({ root: worktree, args: ['commit', '-q', '-m', `feat: ${tail}`] })
	}
	createFakeNodeModules({ folder: join(worktree, 'node_modules'), marker: `lot ${tail}\n` })
	if (params.sibling) {
		const workspace = join(repository, '..')
		mkdirSync(join(workspace, 'sib'), { recursive: true })
		writeFileSync(join(workspace, 'sib', 'index.js'), 'module.exports = 1\n')
		// what `worktree add` makes for a file: dependency: .worktrees/sib -> ../sib, and the lot's link through it
		symlinkSync('../sib', join(worktreesFolder, 'sib'))
		symlinkSync('../../sib', join(worktree, 'node_modules', 'sib'))
	}
	if (params.untracked) writeFiles({ root: worktree, files: { 'scratch.txt': 'not committed\n' } })
	if (params.register === false) return { name: '', worktree }
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({ root: worktree, folder, branch, now: NOW })
	if (params.state !== 'pending')
		recordHandoverState({ store: handoverStoreOf(repository), folder, state: params.state })
	return { name, worktree }
}

/** The arguments of one `lot close` run in the scenario, with the spawner that records the background removals. */
function closing(params: { scenario: Scenario; argv: string[] }) {
	const { spawner, calls } = createRecordingSpawner()
	return {
		calls,
		call: {
			cwd: params.scenario.repository,
			argv: params.argv,
			now: NOW,
			spawner,
		},
	}
}

/** A `sleep` whose working folder is `folder`, killed when the case ends; returns once the system reports that folder. */
function holdFolder(folder: string): void {
	const child = spawn('sleep', [String(HOLDING_PROCESS_SECONDS)], { cwd: folder, stdio: 'ignore' })
	onTestFinished(function stopHolding() {
		child.kill()
	})
	const deadline = Date.now() + HOLDING_PROCESS_START_MS
	while (Date.now() < deadline) {
		const answer = spawnSync('lsof', ['-a', '-p', String(child.pid), '-d', 'cwd', '-Fn'], {
			encoding: 'utf8',
		})
		if (answer.stdout.includes(`n${folder}`)) return
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
	}
	throw new Error(`the process did not take ${folder} as its working folder`)
}

describe('lot close', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it.each([{ state: 'committed' as const }, { state: 'abandoned' as const }])(
		'a $state hand-over with a clean worktree → node_modules parked, the worktree in _trash/, the branch kept, exit 0',
		({ state }) => {
			const scenario = createScenario()
			const { name, worktree } = createLot({ scenario, index: '0001', tail: 'x', state })
			const { call, calls } = closing({ scenario, argv: [name] })

			expect(runLotClose(call)).toEqual({ exitCode: 0, output: expect.stringContaining(name) })

			const { worktreesFolder, repository } = scenario
			const [entry] = poolEntriesOf(worktreesFolder)
			expect(poolEntriesOf(worktreesFolder)).toHaveLength(1)
			expect(readPoolFile({ worktreesFolder, name: entry })).toMatchObject({
				repository: 'repo',
				lockHash: sha256Of(LOCK_TEXT),
			})
			expect(readTree(join(worktreesFolder, entry, 'node_modules'))[MARKER_FILE]).toBe('lot x\n')
			const trashed = trashedNamesOf(worktreesFolder).filter((trashedName) =>
				trashedName.startsWith('0001-repo-x'),
			)
			expect(trashed).toEqual([expect.stringMatching(/^0001-repo-x-\d/)])
			expect(existsSync(worktree)).toBe(false)
			expect(git({ root: repository, args: ['worktree', 'list', '--porcelain'] })).toContain(
				`worktree ${join(worktreesFolder, '_trash', trashed[0])}\n`,
			)
			expect(calls.filter((entryCall) => entryCall.args[0] === 'worktree')).toEqual([
				expect.objectContaining({ args: ['worktree', 'remove', '--force', expect.any(String)] }),
			])
			// the branch is never touched
			expect(git({ root: repository, args: ['branch', '--list', 'feat/x'] })).toContain('feat/x')
		},
	)

	it('a hand-over whose worktree is the main checkout → kept, the reason named; the main checkout and its node_modules untouched, nothing moved, exit 1', () => {
		const scenario = createScenario()
		const { name } = createLot({
			scenario,
			index: '0001',
			tail: 'main',
			state: 'committed',
			main: true,
		})
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${name}[\\s\\S]*main`)),
		})

		const { repository, worktreesFolder } = scenario
		expect(existsSync(join(repository, '.git'))).toBe(true)
		expect(readTree(join(repository, 'node_modules'))[MARKER_FILE]).toBe('lot main\n')
		expect(poolEntriesOf(worktreesFolder)).toEqual([])
		expect(trashedNamesOf(worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
		expect(git({ root: repository, args: ['branch', '--show-current'] }).trim()).toBe('main')
	})

	it('a pending hand-over → kept, the reason named, nothing moved, exit 1', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'pending',
		})
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${name}[\\s\\S]*pending`)),
		})

		expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('a committed hand-over whose worktree has an untracked file → kept ("dirty"), nothing moved, exit 1', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
			untracked: true,
		})
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${name}[\\s\\S]*dirty`)),
		})

		expect(existsSync(join(worktree, 'scratch.txt'))).toBe(true)
		expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('status.showUntrackedFiles=no in the repository config and an untracked file in the worktree → still kept as dirty', () => {
		const scenario = createScenario()
		git({ root: scenario.repository, args: ['config', 'status.showUntrackedFiles', 'no'] })
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
			untracked: true,
		})
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${name}[\\s\\S]*dirty`)),
		})

		expect(existsSync(join(worktree, 'scratch.txt'))).toBe(true)
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('a process with its working folder in the worktree → kept (a process works there), nothing moved, exit 1', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
		})
		holdFolder(worktree)
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${name}[\\s\\S]*process`)),
		})

		expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	for (const { name, folder } of [
		{ name: 'the worktree itself', folder: '' },
		{ name: 'a folder inside it', folder: 'src' },
	])
		it(`lot close run with the working folder of the cli in ${name} → kept, the reason says it runs from inside that worktree and to run it from another folder; nothing moved, exit 1`, () => {
			const scenario = createScenario()
			const { name: handover, worktree } = createLot({
				scenario,
				index: '0001',
				tail: 'x',
				state: 'committed',
			})
			const here = join(worktree, folder)
			const { call, calls } = closing({ scenario, argv: [handover] })

			const result = runLotClose({
				...call,
				cwd: here,
				// the system lists the cli itself in its own working folder
				listProcesses: () => [{ pid: process.pid, folder: here }],
			})

			expect(result.exitCode).toBe(1)
			expect(result.output).toContain(handover)
			expect(result.output).toContain(worktree)
			expect(result.output).toMatch(/from inside/)
			expect(result.output).toMatch(/from another folder/)
			expect(result.output).not.toContain('a process works in')
			expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
			expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
			expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
			expect(calls).toEqual([])
		})

	it('a run-store entry with a live pid started from the worktree → kept (a mutation run), nothing moved, exit 1', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
		})
		startRun({
			root: worktree,
			pid: process.pid,
			lot: 'feat/x',
			tree: 'a'.repeat(40),
			mode: 'changed',
		})
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${name}[\\s\\S]*mutation`)),
		})

		expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('the process lister times out → everything kept ("the processes are not known"), nothing moved, exit 1', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
		})
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(
			runLotClose({
				...call,
				listProcesses: function timedOut() {
					throw Object.assign(new Error('spawnSync lsof ETIMEDOUT'), { code: 'ETIMEDOUT' })
				},
			}),
		).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/processes (are )?not known/),
		})

		expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('a locked lot worktree → kept ("locked"), its node_modules still in place; the other named lot is closed all the same, exit 1', () => {
		const scenario = createScenario()
		const locked = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		const other = createLot({ scenario, index: '0002', tail: 'y', state: 'committed' })
		git({ root: scenario.repository, args: ['worktree', 'lock', locked.worktree] })
		const { call } = closing({ scenario, argv: [locked.name, other.name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${locked.name}[\\s\\S]*locked`)),
		})

		expect(readTree(join(locked.worktree, 'node_modules'))[MARKER_FILE]).toBe('lot x\n')
		expect(existsSync(other.worktree)).toBe(false)
		const [entry] = poolEntriesOf(scenario.worktreesFolder)
		expect(poolEntriesOf(scenario.worktreesFolder)).toHaveLength(1)
		expect(readTree(join(scenario.worktreesFolder, entry, 'node_modules'))[MARKER_FILE]).toBe(
			'lot y\n',
		)
	})

	it('a lot worktree whose node_modules holds a relative link leaving it → parked with the link absolute to the original target, never to _trash/', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		const target = resolve(join(worktree, 'node_modules/@dialecte'), OUTSIDE_LINK)
		const { call } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({ exitCode: 0, output: expect.stringContaining(name) })

		const [entry] = poolEntriesOf(scenario.worktreesFolder)
		expect(poolEntriesOf(scenario.worktreesFolder)).toHaveLength(1)
		const link = readlinkSync(join(scenario.worktreesFolder, entry, 'node_modules/@dialecte/core'))
		expect(link).toBe(target)
		expect(link).not.toContain('_trash')
	})

	it('a lot whose lockfile holds a link entry (file:../sib, the sibling beside the repository) → node_modules parked (pooled in), the pooled link absolute to the sibling', () => {
		const scenario = createScenario()
		const { name } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
			sibling: true,
		})
		const { call } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 0,
			output: expect.stringMatching(new RegExp(`closed +${name}[^\\n]*pooled in _pool-repo-1`)),
		})

		const [entry] = poolEntriesOf(scenario.worktreesFolder)
		expect(poolEntriesOf(scenario.worktreesFolder)).toHaveLength(1)
		const link = join(scenario.worktreesFolder, entry, 'node_modules/sib')
		expect(isAbsolute(readlinkSync(link))).toBe(true)
		expect(realpathSync(link)).toBe(realpathSync(join(scenario.worktreesFolder, '..', 'sib')))
	})

	it.each(['name', 'index'])(
		'two committed hand-overs registered on one worktree, named by their name and then their %s → the worktree closed once, one outcome per argument, no raw error, exit 0',
		(second) => {
			const scenario = createScenario()
			const first = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			const secondName = registerHandover({
				root: first.worktree,
				folder,
				branch: 'feat/x',
				now: NOW,
			})
			recordHandoverState({
				store: handoverStoreOf(scenario.repository),
				folder,
				state: 'committed',
			})
			const argument = second === 'name' ? secondName : '0001'
			const { call, calls } = closing({ scenario, argv: [first.name, argument] })

			expect(runLotClose(call)).toEqual({
				exitCode: 0,
				output: expect.stringMatching(
					new RegExp(`(?=[\\s\\S]*${first.name})(?=[\\s\\S]*${argument})`),
				),
			})

			expect(existsSync(first.worktree)).toBe(false)
			expect(poolEntriesOf(scenario.worktreesFolder)).toHaveLength(1)
			expect(calls.filter((entryCall) => entryCall.args[0] === 'worktree')).toHaveLength(1)
		},
	)

	it.each([
		{ order: 'committed then pending', pendingFirst: false },
		{ order: 'pending then committed', pendingFirst: true },
	])(
		'a committed and a pending hand-over on one worktree, named $order → both kept, the pending one named, nothing moved, exit 1',
		({ pendingFirst }) => {
			const scenario = createScenario()
			const committed = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
			const pendingFolder = realpathSync(temporaryFolder('dialecte-handover-'))
			const pending = registerHandover({
				root: committed.worktree,
				folder: pendingFolder,
				branch: 'feat/x',
				now: NOW,
			})
			const { call, calls } = closing({
				scenario,
				argv: pendingFirst ? [pending, committed.name] : [committed.name, pending],
			})

			expect(runLotClose(call)).toEqual({
				exitCode: 1,
				output: expect.stringMatching(
					new RegExp(`(?=[\\s\\S]*${committed.name})(?=[\\s\\S]*${pending}[^\\n]*pending)`),
				),
			})

			expect(existsSync(committed.worktree)).toBe(true)
			expect(readTree(join(committed.worktree, 'node_modules'))[MARKER_FILE]).toBe('lot x\n')
			expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
			expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
			expect(calls).toEqual([])
		},
	)

	it.each([
		{ order: 'A then B', bFirst: false },
		{ order: 'B then A', bFirst: true },
	])(
		'two committed hand-overs on one worktree, B recorded on another branch, named $order → both kept, B branch reason named, nothing moved, exit 1',
		({ bFirst }) => {
			const scenario = createScenario()
			const first = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			const other = registerHandover({
				root: first.worktree,
				folder,
				branch: 'feat/other',
				now: NOW,
			})
			recordHandoverState({
				store: handoverStoreOf(scenario.repository),
				folder,
				state: 'committed',
			})
			const { call, calls } = closing({
				scenario,
				argv: bFirst ? [other, first.name] : [first.name, other],
			})

			expect(runLotClose(call)).toEqual({
				exitCode: 1,
				output: expect.stringMatching(
					new RegExp(`(?=[\\s\\S]*${first.name})(?=[\\s\\S]*${other}[^\\n]*feat/other)`),
				),
			})

			expect(existsSync(first.worktree)).toBe(true)
			expect(readTree(join(first.worktree, 'node_modules'))[MARKER_FILE]).toBe('lot x\n')
			expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
			expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
			expect(calls).toEqual([])
		},
	)

	it('a committed hand-over on feat/five whose worktree was switched to feat/six (a commit, an ignored .env.local) → kept, both branches named, nothing moved, .env.local intact', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'five',
			state: 'committed',
		})
		git({ root: worktree, args: ['switch', '-q', '-c', 'feat/six'] })
		writeFiles({ root: worktree, files: { 'src/six.ts': 'export {}\n' } })
		git({ root: worktree, args: ['add', '-A'] })
		git({ root: worktree, args: ['commit', '-q', '-m', 'feat: six'] })
		writeFiles({ root: scenario.repository, files: { '.git/info/exclude': '.env.local\n' } })
		writeFiles({ root: worktree, files: { '.env.local': 'SECRET=1\n' } })
		const { call, calls } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/feat\/five[\s\S]*feat\/six|feat\/six[\s\S]*feat\/five/),
		})

		expect(existsSync(join(worktree, '.env.local'))).toBe(true)
		expect(readFileSync(join(worktree, '.env.local'), 'utf8')).toBe('SECRET=1\n')
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('a close whose park worked → the line says where node_modules went: pooled in <entry>', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		const { call } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 0,
			output: expect.stringMatching(new RegExp(`closed +${name}[^\\n]*pooled in _pool-repo-1`)),
		})
	})

	it('a close whose park was refused (node_modules differs from the lockfile) → the line says node_modules was trashed, with the reason', () => {
		const scenario = createScenario()
		const { name } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
			lockText: MISMATCHED_LOCK_TEXT,
		})
		const { call } = closing({ scenario, argv: [name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 0,
			output: expect.stringMatching(new RegExp(`closed +${name}[^\\n]*trashed: \\S`)),
		})
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
	})

	it.each([{ state: 'committed' as const }, { state: 'abandoned' as const }])(
		'a $state lot on feat/q and another lot checked out on feat/q-verify (clean, never marked, an ignored .env.local) → the first is closed alone: the second, its files and its branch intact',
		({ state }) => {
			const scenario = createScenario()
			const { repository, worktreesFolder } = scenario
			const first = createLot({ scenario, index: '0001', tail: 'q', state })
			// another lot whose branch happens to be named like a verify branch
			const other = join(worktreesFolder, '0002-repo-q-verify')
			git({ root: repository, args: ['worktree', 'add', '-q', '-b', 'feat/q-verify', other] })
			writeFiles({ root: other, files: { 'src/other.ts': 'export {}\n' } })
			git({ root: other, args: ['add', '-A'] })
			git({ root: other, args: ['commit', '-q', '-m', 'feat: another lot'] })
			writeFiles({ root: repository, files: { '.git/info/exclude': '.env.local\n' } })
			writeFiles({ root: other, files: { '.env.local': 'SECRET=1\n' } })
			const { call, calls } = closing({ scenario, argv: [first.name] })

			expect(runLotClose(call)).toEqual({
				exitCode: 0,
				output: expect.stringContaining(first.name),
			})

			expect(existsSync(first.worktree)).toBe(false)
			expect(existsSync(join(other, '.env.local'))).toBe(true)
			expect(readFileSync(join(other, '.env.local'), 'utf8')).toBe('SECRET=1\n')
			expect(existsSync(join(other, '.git'))).toBe(true)
			expect(existsSync(join(other, 'src/other.ts'))).toBe(true)
			expect(git({ root: repository, args: ['worktree', 'list', '--porcelain'] })).toContain(
				`worktree ${other}\n`,
			)
			expect(git({ root: repository, args: ['branch', '--list', 'feat/q-verify'] })).toContain(
				'feat/q-verify',
			)
			expect(trashedNamesOf(worktreesFolder).filter((name) => name.startsWith('0002'))).toEqual([])
			expect(calls.filter((entryCall) => entryCall.args.includes(other))).toEqual([])
		},
	)

	it('<index> where no hand-over holds the index and a lot own unmarked worktree folder ends in -verify (feat/email-verify, clean) → nothing moved, the reason named', () => {
		const scenario = createScenario()
		const { worktree } = createLot({
			scenario,
			index: '0003',
			tail: 'email-verify',
			state: 'pending',
			register: false,
		})
		const { call, calls } = closing({ scenario, argv: ['0003'] })

		expect(runLotClose(call).exitCode).toBeGreaterThan(0)

		expect(existsSync(worktree)).toBe(true)
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('lot email-verify\n')
		expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
		expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})

	it('<index> → the same as by name', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		const { call, calls } = closing({ scenario, argv: ['0001'] })

		expect(runLotClose(call)).toEqual({ exitCode: 0, output: expect.stringContaining(name) })

		expect(existsSync(worktree)).toBe(false)
		expect(poolEntriesOf(scenario.worktreesFolder)).toHaveLength(1)
		expect(calls.filter((entryCall) => entryCall.args[0] === 'worktree')).toHaveLength(1)
	})

	it.each(['no-such-handover', '0099'])(
		'a name or an index the registry does not hold (%s) → exit 2 naming it, nothing moved',
		(argument) => {
			const scenario = createScenario()
			const { worktree } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
			const { call, calls } = closing({ scenario, argv: [argument] })

			expect(runLotClose(call)).toEqual({ exitCode: 2, output: expect.stringContaining(argument) })

			expect(existsSync(worktree)).toBe(true)
			expect(poolEntriesOf(scenario.worktreesFolder)).toEqual([])
			expect(trashedNamesOf(scenario.worktreesFolder)).toEqual([])
			expect(calls).toEqual([])
		},
	)

	it('two names, one kept → the other closed, exit 1', () => {
		const scenario = createScenario()
		const first = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		const second = createLot({
			scenario,
			index: '0002',
			tail: 'y',
			state: 'committed',
			untracked: true,
		})
		const { call } = closing({ scenario, argv: [first.name, second.name] })

		expect(runLotClose(call)).toEqual({
			exitCode: 1,
			output: expect.stringMatching(new RegExp(`${second.name}[\\s\\S]*dirty`)),
		})

		expect(existsSync(first.worktree)).toBe(false)
		expect(existsSync(second.worktree)).toBe(true)
		expect(poolEntriesOf(scenario.worktreesFolder)).toHaveLength(1)
	})

	it('a hand-over closed by an earlier run, closed again → <name> already closed, exit 0, nothing moved again', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		expect(runLotClose(closing({ scenario, argv: [name] }).call).exitCode).toBe(0)
		const trashedBefore = trashedNamesOf(scenario.worktreesFolder)
		const again = closing({ scenario, argv: [name] })

		const result = runLotClose(again.call)

		expect({
			exitCode: result.exitCode,
			says: result.output.includes(`${name} already closed`),
			refusal: result.output.includes('nothing to close'),
			trashed: trashedNamesOf(scenario.worktreesFolder),
			calls: again.calls,
		}).toEqual({
			exitCode: 0,
			says: true,
			refusal: false,
			trashed: trashedBefore,
			calls: [],
		})
	})

	it('the first close of a hand-over → its registry entry holds closed, the time of the close', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		expect(readEntry({ root: scenario.repository, name })).not.toHaveProperty('closed')

		runLotClose(closing({ scenario, argv: [name] }).call)

		expect(readEntry({ root: scenario.repository, name })).toMatchObject({
			closed: expect.stringMatching(/^2026-11-06T10:00:00/),
		})
	})

	it('a hand-over closed, then the _trash/ folder emptied, closed again → still <name> already closed, exit 0', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		expect(runLotClose(closing({ scenario, argv: [name] }).call).exitCode).toBe(0)
		rmSync(join(scenario.worktreesFolder, '_trash'), { recursive: true, force: true })
		git({ root: scenario.repository, args: ['worktree', 'prune'] })

		const result = runLotClose(closing({ scenario, argv: [name] }).call)

		expect({
			exitCode: result.exitCode,
			says: result.output.includes(`${name} already closed`),
		}).toEqual({ exitCode: 0, says: true })
	})

	it('a committed hand-over whose worktree was removed by hand (never closed) → still kept, nothing to close, exit 1', () => {
		const scenario = createScenario()
		const { name, worktree } = createLot({
			scenario,
			index: '0001',
			tail: 'x',
			state: 'committed',
		})
		rmSync(worktree, { recursive: true, force: true })
		git({ root: scenario.repository, args: ['worktree', 'prune'] })

		const result = runLotClose(closing({ scenario, argv: [name] }).call)

		expect({
			exitCode: result.exitCode,
			refusal: result.output.includes('nothing to close'),
			says: result.output.includes('already closed'),
		}).toEqual({ exitCode: 1, refusal: true, says: false })
	})

	it.each([
		{ order: 'A then B', bFirst: false },
		{ order: 'B then A', bFirst: true },
	])(
		'A already closed and B not closed, both registered on one live worktree, named $order → A already closed, B decided on its own and closed now (never "the same worktree as"), closed recorded on B only, exit 0',
		({ bFirst }) => {
			const scenario = createScenario()
			const first = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			const second = registerHandover({
				root: first.worktree,
				folder,
				branch: 'feat/x',
				now: NOW,
			})
			recordHandoverState({
				store: handoverStoreOf(scenario.repository),
				folder,
				state: 'committed',
			})
			recordHandoverClosed({
				store: handoverStoreOf(scenario.repository),
				name: first.name,
				at: new Date('2026-11-05T09:00:00Z'),
			})
			const { call } = closing({
				scenario,
				argv: bFirst ? [second, first.name] : [first.name, second],
			})

			const result = runLotClose(call)

			expect({
				exitCode: result.exitCode,
				firstAlreadyClosed: result.output.includes(`${first.name} already closed`),
				secondClosedNow: new RegExp(`closed +${second}(?! already)`).test(result.output),
				sameWorktree: result.output.includes('the same worktree as'),
				worktreeGone: !existsSync(first.worktree),
				pooled: poolEntriesOf(scenario.worktreesFolder).length,
				firstClosed: readEntry({ root: scenario.repository, name: first.name }),
				secondRecorded: readEntry({ root: scenario.repository, name: second }),
			}).toEqual({
				exitCode: 0,
				firstAlreadyClosed: true,
				secondClosedNow: true,
				sameWorktree: false,
				worktreeGone: true,
				pooled: 1,
				firstClosed: expect.objectContaining({ closed: '2026-11-05T09:00:00.000Z' }),
				secondRecorded: expect.objectContaining({ closed: '2026-11-06T10:00:00.000Z' }),
			})
		},
	)

	it.each([
		{ order: 'A then B', bFirst: false },
		{ order: 'B then A', bFirst: true },
	])(
		'A already closed and B not closed, both registered on one dirty worktree, named $order → A already closed, B kept with its own reason (dirty), closed not recorded on B, nothing moved, exit 1',
		({ bFirst }) => {
			const scenario = createScenario()
			const first = createLot({
				scenario,
				index: '0001',
				tail: 'x',
				state: 'committed',
				untracked: true,
			})
			const folder = realpathSync(temporaryFolder('dialecte-handover-'))
			const second = registerHandover({
				root: first.worktree,
				folder,
				branch: 'feat/x',
				now: NOW,
			})
			recordHandoverState({
				store: handoverStoreOf(scenario.repository),
				folder,
				state: 'committed',
			})
			recordHandoverClosed({
				store: handoverStoreOf(scenario.repository),
				name: first.name,
				at: new Date('2026-11-05T09:00:00Z'),
			})
			const { call, calls } = closing({
				scenario,
				argv: bFirst ? [second, first.name] : [first.name, second],
			})

			const result = runLotClose(call)

			expect({
				exitCode: result.exitCode,
				firstAlreadyClosed: result.output.includes(`${first.name} already closed`),
				secondDirty: new RegExp(`${second}[^\\n]*dirty`).test(result.output),
				sameWorktree: result.output.includes('the same worktree as'),
				worktreeKept: existsSync(join(first.worktree, 'node_modules')),
				pooled: poolEntriesOf(scenario.worktreesFolder),
				trashed: trashedNamesOf(scenario.worktreesFolder),
				calls,
				secondRecorded: readEntry({ root: scenario.repository, name: second }),
			}).toEqual({
				exitCode: 1,
				firstAlreadyClosed: true,
				secondDirty: true,
				sameWorktree: false,
				worktreeKept: true,
				pooled: [],
				trashed: [],
				calls: [],
				secondRecorded: expect.not.objectContaining({ closed: expect.anything() }),
			})
		},
	)

	it('--json → one outcome per named hand-over, { handover, closed: true }', () => {
		const scenario = createScenario()
		const { name } = createLot({ scenario, index: '0001', tail: 'x', state: 'committed' })
		const { call } = closing({ scenario, argv: [name, '--json'] })

		expect(runLotClose(call)).toEqual({
			exitCode: 0,
			output: expect.stringMatching(new RegExp(`"handover": "${name}"[\\s\\S]*"closed": true`)),
		})
	})
})
