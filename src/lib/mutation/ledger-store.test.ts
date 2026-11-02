import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import {
	ledgerKeyOf,
	reportedRun,
	storedLedger,
	survivorOf,
} from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { pendingOf, readLedger, updateLedger } from './ledger.ts'
import { MUTATION_STORE_FOLDER } from './mutation.constants.ts'
import { finishRun, startRun } from './run-store.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

const OTHER_PACKAGE = 'other-pkg'
const OTHER_FOLDER = 'packages/other'
const TREE = 'd'.repeat(40)
const LOCK_FILE = 'ledger.lock'
const LEDGER_MODULE = join(import.meta.dirname, 'ledger.ts')
const UPDATES_PER_WRITER = 40
const WRITER_EXIT_TIMEOUT_MS = 120_000
/** The missed run starts and reports before the later run starts: explicit times, never the wall clock. */
const MISSED_STARTED_AT = '2026-11-02T09:00:00.000Z'
const MISSED_FINISHED_AT = '2026-11-02T09:05:00.000Z'
const LATER_STARTED_AT = '2026-11-02T11:00:00.000Z'
const COUNTS = { killed: 0, survived: 1, timedOut: 0, noCoverage: 0 }

/** A repository holding two packages: the root one and `packages/other`. */
function repository(): { root: string; other: string } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
		[`${OTHER_FOLDER}/package.json`]: `${JSON.stringify({ name: OTHER_PACKAGE })}\n`,
	})
	return { root, other: join(root, OTHER_FOLDER) }
}

/**
 * A process that waits for `go` to exist, then takes `count` runs of `packageName` into the ledger one after the
 * other, each reporting one survivor of its own (`<tag>-<n>`) and covering nothing.
 */
function ledgerWriter(params: {
	root: string
	packageName: string
	tag: string
	go: string
}): Promise<number | null> {
	const { root, packageName, tag, go } = params
	const script = `
const { existsSync } = await import('node:fs')
const { updateLedger } = await import(${JSON.stringify(LEDGER_MODULE)})
while (!existsSync(${JSON.stringify(go)})) {}
for (let index = 0; index < ${UPDATES_PER_WRITER}; index++) {
	const key = ${JSON.stringify(tag)} + '-' + index
	updateLedger({
		root: ${JSON.stringify(root)},
		run: {
			runId: key, pid: 1, startedAt: '2026-11-02T10:00:00.000Z', worktree: ${JSON.stringify(root)},
			branch: 'main', lot: 'lot-a', tree: ${JSON.stringify(TREE)}, mode: 'changed',
			package: ${JSON.stringify(packageName)}, state: 'reported',
			survivors: [{ file: ${JSON.stringify(SCOPE_FILE)}, key, line: 2, mutation: 'm', range: 'r', lineHash: 'h' }],
		},
		records: {},
		targets: [],
	})
}
`
	const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
		stdio: 'ignore',
	})
	onTestFinished(function killWriter() {
		child.kill('SIGKILL')
	})
	return new Promise(function waitForWriter(resolve, reject) {
		const timer = setTimeout(
			() => reject(new Error(`the ${tag} writer did not exit`)),
			WRITER_EXIT_TIMEOUT_MS,
		)
		child.once('exit', (code) => {
			clearTimeout(timer)
			resolve(code)
		})
	})
}

describe('the ledger under concurrent writers', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('two processes taking runs of two packages into the ledger at once → every survivor of both is kept', async () => {
		const { root, other } = repository()
		const go = join(root, '.go')
		const writers = [
			ledgerWriter({ root, packageName: PACKAGE_NAME, tag: 'mine', go }),
			ledgerWriter({ root: other, packageName: OTHER_PACKAGE, tag: 'theirs', go }),
		]
		writeFileSync(go, '')

		await expect(Promise.all(writers)).resolves.toEqual([0, 0])

		expect(Object.keys(storedLedger(root)).length).toBe(2 * UPDATES_PER_WRITER)
	})

	it('a lock left by a process that is gone → taken over: the update lands and the lock is released', () => {
		const { root } = repository()
		const store = join(commonGitDirOf(root), MUTATION_STORE_FOLDER)
		mkdirSync(store, { recursive: true })
		writeFileSync(join(store, LOCK_FILE), `${JSON.stringify({ pid: deadPid() })}\n`)
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })

		expect(updateLedger({ root, run, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(Object.keys(storedLedger(root))).toEqual([ledgerKeyOf({ key: 'k1' })])
		expect(existsSync(join(store, LOCK_FILE))).toBe(false)
	})
})

describe(
	'a reported run whose ledger update was missed',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** A run started and reported in the store, its survivors never taken into the ledger. */
		function missedRun(params: { root: string; key: string }): string {
			const entry = startRun({
				root: params.root,
				pid: process.pid,
				lot: 'lot-missed',
				tree: TREE,
				mode: 'changed',
				now: new Date(MISSED_STARTED_AT),
			})
			expect(
				finishRun({
					root: params.root,
					runId: entry.runId,
					counts: COUNTS,
					survivors: [survivorOf({ key: params.key })],
					now: new Date(MISSED_FINISHED_AT),
				}),
			).toMatchObject({ state: 'reported' })
			return entry.runId
		}

		it('→ folded in by pendingOf: its survivor is new, first seen in that run', () => {
			const { root } = repository()
			const runId = missedRun({ root, key: 'k1' })

			expect(pendingOf({ root }).new).toEqual([
				expect.objectContaining({ key: 'k1', firstSeen: { runId, tree: TREE, lot: 'lot-missed' } }),
			])
		})

		it('→ folded in by the next updateLedger: the ledger file holds both runs’ survivors', () => {
			const { root } = repository()
			missedRun({ root, key: 'k1' })
			const next = reportedRun({
				root,
				runId: 'r2',
				startedAt: LATER_STARTED_AT,
				survivors: [survivorOf({ key: 'k2' })],
			})

			expect(updateLedger({ root, run: next, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()

			expect(Object.keys(storedLedger(root)).sort()).toEqual(
				[ledgerKeyOf({ key: 'k1' }), ledgerKeyOf({ key: 'k2' })].sort(),
			)
		})

		it('→ folded in once: a survivor killed after the fold is not brought back by the next reader', () => {
			const { root } = repository()
			missedRun({ root, key: 'k1' })
			expect(pendingOf({ root }).new).toEqual([expect.objectContaining({ key: 'k1' })])
			const killing = {
				...reportedRun({ root, runId: 'r2', startedAt: LATER_STARTED_AT, survivors: [] }),
				detected: ['k1'],
				tested: ['k1'],
			}
			expect(
				updateLedger({ root, run: killing, records: {}, targets: [SCOPE_FILE] }),
			).toBeUndefined()

			expect(pendingOf({ root }).new).toEqual([])
			expect(readLedger({ root })).toEqual({
				[ledgerKeyOf({ key: 'k1' })]: expect.objectContaining({ state: 'killed' }),
			})
		})
	},
)
