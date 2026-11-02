import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import {
	LEGACY_RECORDS_FILE,
	RECORDS_FILE,
	SCOPE_FILE,
} from '../../test/mutation-package.constants.ts'
import {
	fakeStryker,
	mutationPackage,
	reportedRun,
	ledgerKeyOf,
	storedLedger,
	storedRuns,
	survivorLine,
	survivorOf,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { hashLine } from '../lib/mutation/judge.ts'
import { scheduleItems, updateLedger } from '../lib/mutation/ledger.ts'
import { startRun } from '../lib/mutation/run-store.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

const K1 = ledgerKeyOf({ key: 'k1' })
const K2 = ledgerKeyOf({ key: 'k2' })
const TREE = 'c'.repeat(40)
const STARTED = new Date('2026-11-02T10:00:00.000Z')
const FIVE_MINUTES_LATER = new Date('2026-11-02T10:05:00.000Z')
const NO_CALLS = { calls: [], reports: {} }

function dependenciesOf(root: string) {
	return { runStryker: fakeStryker({ root, ...NO_CALLS }) }
}

describe('mutants status', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/** A running run, a died run, a new item (lot-a) and a scheduled item (guard-cleanup). */
	function seededPackage(): string {
		const root = mutationPackage()
		expect(
			startRun({
				root,
				pid: process.pid,
				lot: 'lot-running',
				tree: TREE,
				mode: 'changed',
				now: STARTED,
			}),
		).toBeDefined()
		expect(
			startRun({ root, pid: deadPid(), lot: 'lot-died', tree: TREE, mode: 'audit', now: STARTED }),
		).toBeDefined()
		const run = reportedRun({
			root,
			runId: 'r1',
			lot: 'lot-a',
			survivors: [
				survivorOf({ key: 'k1' }),
				survivorOf({ key: 'k2', mutation: 'ConditionalExpression: x === 1 -> false' }),
			],
		})
		expect(updateLedger({ root, run, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(scheduleItems({ root, keys: ['k2'], followUp: 'guard-cleanup' })).toMatchObject({
			ok: true,
		})
		return root
	}

	it('lists the running run with its age, the died run, the new item under its lot and the scheduled item under its follow-up', async () => {
		const root = seededPackage()

		await expect(
			runMutants({
				cwd: root,
				argv: ['status'],
				dependencies: { ...dependenciesOf(root), now: () => FIVE_MINUTES_LATER },
			}),
		).resolves.toSatisfy(function listsEverythingPending(result: {
			exitCode: number
			output: string
		}) {
			const [running, died] = storedRuns(root)
			const runningRun = [running, died].find((run) => run.lot === 'lot-running')
			const diedRun = [running, died].find((run) => run.lot === 'lot-died')
			const lines = result.output.split('\n')
			expect(result.exitCode).toBe(0)
			expect(lines.find((line) => line.includes(runningRun?.runId ?? '?'))).toMatch(
				/running.*\b(5 ?m|300 ?s)\b|\b(5 ?m|300 ?s)\b.*running/,
			)
			expect(lines.find((line) => line.includes(diedRun?.runId ?? '?'))).toContain('died')
			expect(result.output).toContain('lot-a')
			expect(result.output).toContain(survivorLine({ replacement: 'true', original: 'x === 1' }))
			expect(result.output).toContain('guard-cleanup')
			expect(result.output).toContain(survivorLine({ replacement: 'false', original: 'x === 1' }))
			return true
		})
	})

	it('--json → the same as an object: running, died, new by lot, scheduled by follow-up', async () => {
		const root = seededPackage()

		const json = runMutants({
			cwd: root,
			argv: ['status', '--json'],
			dependencies: { ...dependenciesOf(root), now: () => FIVE_MINUTES_LATER },
		}).then((result) => JSON.parse(result.output))

		await expect(json).resolves.toMatchObject({
			running: [expect.objectContaining({ lot: 'lot-running' })],
			died: [expect.objectContaining({ lot: 'lot-died' })],
			new: { 'lot-a': [expect.objectContaining({ key: 'k1' })] },
			scheduled: { 'guard-cleanup': [expect.objectContaining({ key: 'k2' })] },
		})
	})

	it('--json with nothing pending → empty lists and objects', async () => {
		const root = mutationPackage()

		const json = runMutants({
			cwd: root,
			argv: ['status', '--json'],
			dependencies: dependenciesOf(root),
		}).then((result) => JSON.parse(result.output))

		await expect(json).resolves.toEqual({ running: [], died: [], new: {}, scheduled: {} })
	})
})

describe('mutants schedule', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	function ledgerPackage(): string {
		const root = mutationPackage()
		const run = reportedRun({
			root,
			runId: 'r1',
			survivors: [survivorOf({ key: 'k1' }), survivorOf({ key: 'k2' })],
		})
		expect(updateLedger({ root, run, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		return root
	}

	it('<follow-up> <key> → that item scheduled with the follow-up name, the other still new', async () => {
		const root = ledgerPackage()

		await expect(
			runMutants({
				cwd: root,
				argv: ['schedule', 'guard-cleanup', 'k1'],
				dependencies: dependenciesOf(root),
			}),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(storedLedger(root)).toMatchObject({
			[K1]: { state: 'scheduled', followUp: 'guard-cleanup' },
			[K2]: { state: 'new' },
		})
	})

	it('an unknown key → exit 1 naming it, nothing scheduled', async () => {
		const root = ledgerPackage()

		await expect(
			runMutants({
				cwd: root,
				argv: ['schedule', 'guard-cleanup', 'k1', 'nope'],
				dependencies: dependenciesOf(root),
			}),
		).resolves.toMatchObject({ exitCode: 1, output: expect.stringContaining('nope') })

		expect(storedLedger(root)).toMatchObject({ [K1]: { state: 'new' }, [K2]: { state: 'new' } })
	})

	it('--all-new → every new item scheduled', async () => {
		const root = ledgerPackage()

		await expect(
			runMutants({
				cwd: root,
				argv: ['schedule', 'guard-cleanup', '--all-new'],
				dependencies: dependenciesOf(root),
			}),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(storedLedger(root)).toMatchObject({
			[K1]: { state: 'scheduled', followUp: 'guard-cleanup' },
			[K2]: { state: 'scheduled', followUp: 'guard-cleanup' },
		})
	})

	it('no follow-up name, or no key and no --all-new → usage, exit 2', async () => {
		const root = ledgerPackage()

		await expect(
			runMutants({ cwd: root, argv: ['schedule'], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({ exitCode: 2 })
		await expect(
			runMutants({
				cwd: root,
				argv: ['schedule', 'guard-cleanup'],
				dependencies: dependenciesOf(root),
			}),
		).resolves.toMatchObject({ exitCode: 2 })

		expect(storedLedger(root)).toMatchObject({ [K1]: { state: 'new' }, [K2]: { state: 'new' } })
	})
})

describe('mutants abandon', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a died run → exit 0, the entry is abandoned and kept', async () => {
		const root = mutationPackage()
		expect(
			startRun({ root, pid: deadPid(), lot: 'lot-died', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const [{ runId }] = storedRuns(root)

		await expect(
			runMutants({ cwd: root, argv: ['abandon', runId], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(storedRuns(root)).toEqual([expect.objectContaining({ runId, state: 'abandoned' })])
	})

	it('a running run → exit 1 naming the run, the entry unchanged', async () => {
		const root = mutationPackage()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-running', tree: TREE, mode: 'changed' }),
		).toBeDefined()
		const [{ runId }] = storedRuns(root)

		await expect(
			runMutants({ cwd: root, argv: ['abandon', runId], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({ exitCode: 1, output: expect.stringContaining(runId) })

		expect(storedRuns(root)).toEqual([expect.objectContaining({ runId, state: 'running' })])
	})

	it('an unknown run id → exit 1 naming it', async () => {
		const root = mutationPackage()

		await expect(
			runMutants({
				cwd: root,
				argv: ['abandon', 'no-such-run'],
				dependencies: dependenciesOf(root),
			}),
		).resolves.toMatchObject({ exitCode: 1, output: expect.stringContaining('no-such-run') })
	})

	it('no run id → usage, exit 2', async () => {
		const root = mutationPackage()

		await expect(
			runMutants({ cwd: root, argv: ['abandon'], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({ exitCode: 2 })
	})
})

describe('mutants migrate', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const LEGACY = {
		[SCOPE_FILE]: {
			k1: {
				line: 2,
				mutation: 'ConditionalExpression: x === 1 -> true',
				equivalent: 'a ref always has an id',
			},
		},
	}

	it('the legacy records → .dialecte/mutation-records.json with the same keys, reasons, family unclassified and the line hash; the legacy file stays', async () => {
		const root = mutationPackage()
		writeFiles({ root, files: { [LEGACY_RECORDS_FILE]: `${JSON.stringify(LEGACY)}\n` } })

		await expect(
			runMutants({ cwd: root, argv: ['migrate'], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({ exitCode: 0 })

		expect(JSON.parse(readFileSync(join(root, RECORDS_FILE), 'utf8'))).toEqual({
			[SCOPE_FILE]: {
				k1: {
					line: 2,
					mutation: 'ConditionalExpression: x === 1 -> true',
					family: 'unclassified',
					reason: 'a ref always has an id',
					lineHash: hashLine({ text: '\treturn x === 1' }),
				},
			},
		})
		expect(existsSync(join(root, LEGACY_RECORDS_FILE))).toBe(true)
	})

	it('a records file already there → exit 1, the file untouched', async () => {
		const root = mutationPackage()
		writeFiles({
			root,
			files: { [LEGACY_RECORDS_FILE]: `${JSON.stringify(LEGACY)}\n`, [RECORDS_FILE]: '{}\n' },
		})

		await expect(
			runMutants({ cwd: root, argv: ['migrate'], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining('mutation-records.json'),
		})

		expect(readFileSync(join(root, RECORDS_FILE), 'utf8')).toBe('{}\n')
	})

	it('no legacy file → exit 1 naming it, nothing written', async () => {
		const root = mutationPackage()

		await expect(
			runMutants({ cwd: root, argv: ['migrate'], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining('equivalent-mutants.json'),
		})

		expect(existsSync(join(root, RECORDS_FILE))).toBe(false)
	})
})

describe('mutants usage', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no verb or an unknown one → usage naming the verbs, exit 2', async () => {
		const root = mutationPackage()

		await expect(
			runMutants({ cwd: root, argv: [], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/run.*status.*schedule.*abandon.*migrate/s),
		})
		await expect(
			runMutants({ cwd: root, argv: ['frobnicate'], dependencies: dependenciesOf(root) }),
		).resolves.toMatchObject({ exitCode: 2 })
	})
})
