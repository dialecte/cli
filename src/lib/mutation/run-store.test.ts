import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { PACKAGE_NAME } from '../../../test/mutation-package.constants.ts'
import { runFiles, storedRuns, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { addWorktree, commonGitDirOf } from '../../../test/scratch-tree.ts'
import { MUTATION_RUNS_FOLDER, MUTATION_STORE_FOLDER } from './mutation.constants.ts'
import { abandonRun, finishRun, readRuns, startRun } from './run-store.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { RunCounts } from './mutation.types.ts'

const TREE = 'b'.repeat(40)
const COUNTS: RunCounts = { killed: 5, survived: 1, timedOut: 0, noCoverage: 0 }

function repository(): string {
	return createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
	})
}

const WAIT_FOR_EXIT_MS = 30_000

/** A child process that lives until killed; it is killed when the test ends. */
function longLivedChild() {
	const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
	onTestFinished(function killChild() {
		child.kill('SIGKILL')
	})
	return child
}

function exitOf(child: ReturnType<typeof longLivedChild>): Promise<void> {
	return new Promise(function waitForExit(resolve, reject) {
		const timer = setTimeout(() => reject(new Error('the child did not exit')), WAIT_FOR_EXIT_MS)
		child.once('exit', () => {
			clearTimeout(timer)
			resolve()
		})
	})
}

describe('startRun', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('→ the running entry with the pid, worktree, branch, lot, tree, mode and a start time, as returned', () => {
		const root = repository()
		git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })

		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toMatchObject({
			runId: expect.any(String),
			pid: process.pid,
			branch: 'feat/x',
			lot: 'lot-a',
			tree: TREE,
			mode: 'changed',
			state: 'running',
			package: PACKAGE_NAME,
			startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
		})
	})

	it('→ the entry is a file of <git-common-dir>/dialecte-mutation/runs/ holding the returned entry, and the worktree is this one', () => {
		const root = repository()

		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'audit' }),
		).toBeDefined()

		const [stored] = storedRuns(root)
		expect(
			existsSync(join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER)),
		).toBe(true)
		expect(realpathSync(stored.worktree)).toBe(realpathSync(root))
		expect(stored.state).toBe('running')
	})

	it('a base given → the entry carries it; none given (an audit) → the entry has no base', () => {
		const root = repository()

		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed', base: 'main' }),
		).toMatchObject({ base: 'main' })
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'audit' }),
		).not.toHaveProperty('base')
		expect(storedRuns(root).find((run) => run.mode === 'audit')).not.toHaveProperty('base')
	})

	it('two runs → two entries with different ids', () => {
		const root = repository()

		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()

		const ids = storedRuns(root).map((run) => run.runId)
		expect(new Set(ids).size).toBe(2)
	})
})

describe('finishRun', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('→ the entry is reported with the counts, the survivors and a finish time; the other fields stay', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const { runId } = storedRuns(root)[0]
		const survivors = [survivorOf({ key: 'k1' })]

		expect(finishRun({ root, runId, counts: COUNTS, survivors })).toMatchObject({
			runId,
			state: 'reported',
			counts: COUNTS,
			survivors,
			lot: 'lot-a',
			tree: TREE,
			finishedAt: expect.any(String),
		})
		expect(storedRuns(root)).toEqual([
			expect.objectContaining({ runId, state: 'reported', survivors }),
		])
	})

	it('→ the replacement leaves one file in the runs folder: no temporary name stays', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const { runId } = storedRuns(root)[0]

		expect(finishRun({ root, runId, counts: COUNTS, survivors: [] })).toBeDefined()

		expect(runFiles(root)).toEqual([`${runId}.json`])
	})

	it('a partial file left beside the entries by a write that never finished → never read as a run', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const folder = join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER)
		writeFileSync(join(folder, 'half-written.json.tmp'), '{"runId": "half')

		expect(readRuns({ root })).toEqual([expect.objectContaining({ state: 'running' })])
	})

	it('an unknown run id → refused with an error naming it', () => {
		const root = repository()

		expect(() => finishRun({ root, runId: 'no-such-run', counts: COUNTS, survivors: [] })).toThrow(
			/no-such-run/,
		)
	})
})

describe('readRuns', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a running entry whose process is alive → running', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()

		expect(readRuns({ root })).toEqual([expect.objectContaining({ state: 'running' })])
	})

	it('a running entry whose process is gone → died, the file itself still says running', () => {
		const root = repository()
		expect(
			startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()

		expect(readRuns({ root })).toEqual([expect.objectContaining({ state: 'died', lot: 'lot-a' })])
		expect(storedRuns(root)[0].state).toBe('running')
	})

	it('the liveness is the injected one when given', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()

		expect(readRuns({ root, isAlive: () => false })).toEqual([
			expect.objectContaining({ state: 'died' }),
		])
	})

	it('a reported entry stays reported, whatever its pid', () => {
		const root = repository()
		expect(
			startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const { runId } = storedRuns(root)[0]
		expect(finishRun({ root, runId, counts: COUNTS, survivors: [] })).toBeDefined()

		expect(readRuns({ root })).toEqual([expect.objectContaining({ runId, state: 'reported' })])
	})

	it('no store yet → no runs', () => {
		expect(readRuns({ root: repository() })).toEqual([])
	})

	it('a run started in one worktree → read from another worktree of the same repository', () => {
		const root = repository()
		const second = addWorktree(root)
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()

		expect(readRuns({ root: second })).toEqual([expect.objectContaining({ lot: 'lot-a' })])
	})

	it('a run killed mid-way (a real owner process killed) → died, with its lot and tree', async () => {
		const root = repository()
		const owner = longLivedChild()
		expect(
			startRun({ root, pid: owner.pid as number, lot: 'lot-killed', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		expect(readRuns({ root })).toEqual([expect.objectContaining({ state: 'running' })])

		owner.kill('SIGKILL')
		await exitOf(owner)

		expect(readRuns({ root })).toEqual([
			expect.objectContaining({ state: 'died', lot: 'lot-killed', tree: TREE }),
		])
	})
})

describe('abandonRun', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a died run → abandoned, its entry kept with its lot and tree', () => {
		const root = repository()
		expect(
			startRun({ root, pid: deadPid(), lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const { runId } = storedRuns(root)[0]

		expect(abandonRun({ root, runId })).toEqual({ ok: true })

		expect(readRuns({ root })).toEqual([
			expect.objectContaining({ runId, state: 'abandoned', lot: 'lot-a', tree: TREE }),
		])
	})

	it('a running run → refused, the entry unchanged', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const before = readFileSync(
			join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER, runFiles(root)[0]),
			'utf8',
		)
		const { runId } = storedRuns(root)[0]

		expect(abandonRun({ root, runId })).toMatchObject({ ok: false, reason: expect.any(String) })

		expect(storedRuns(root)).toEqual([JSON.parse(before)])
	})

	it('a reported run → refused', () => {
		const root = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-a', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const { runId } = storedRuns(root)[0]
		expect(finishRun({ root, runId, counts: COUNTS, survivors: [] })).toBeDefined()

		expect(abandonRun({ root, runId })).toMatchObject({ ok: false })
		expect(storedRuns(root)[0].state).toBe('reported')
	})

	it('an unknown run id → refused naming it', () => {
		expect(abandonRun({ root: repository(), runId: 'no-such-run' })).toMatchObject({
			ok: false,
			reason: expect.stringContaining('no-such-run'),
		})
	})
})
