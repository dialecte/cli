import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import {
	ledgerKeyOf,
	reportedRun,
	storedLedger,
	storedRuns,
	survivorOf,
} from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { pendingOf, readLedger, scheduleAllNew, scheduleItems, updateLedger } from './ledger.ts'
import { finishRun, startRun } from './run-store.ts'

import { describe, expect, it } from 'vitest'

import type { MutationRecords } from './mutation.types.ts'

const OTHER_PACKAGE = 'other-pkg'
const OTHER_FOLDER = 'packages/other'
const OTHER_FILE = 'src/engine/other.ts'
const TREE_ONE = '1'.repeat(40)
const TREE_TWO = '2'.repeat(40)

const K1 = ledgerKeyOf({ key: 'k1' })
const K2 = ledgerKeyOf({ key: 'k2' })
const OTHER_K3 = ledgerKeyOf({ packageName: OTHER_PACKAGE, key: 'k3' })
const OTHER_K1 = ledgerKeyOf({ packageName: OTHER_PACKAGE, key: 'k1' })

const NO_RECORDS: MutationRecords = {}

function recordsListing(params: { key: string; reason: string; family?: string }): MutationRecords {
	return {
		[SCOPE_FILE]: {
			[params.key]: {
				line: 2,
				mutation: 'ConditionalExpression: x === 1 -> true',
				family: (params.family ?? 'invariant-guard') as 'wording',
				reason: params.reason,
				lineHash: 'h',
			},
		},
	}
}

/** A repository holding two packages: the root one and `packages/other`. */
function repository(): { root: string; other: string } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
		[`${OTHER_FOLDER}/package.json`]: `${JSON.stringify({ name: OTHER_PACKAGE })}\n`,
	})
	return { root, other: join(root, OTHER_FOLDER) }
}

describe('updateLedger', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a survivor the records do not list → new, with its fields, its package and its first seen run, tree and lot', () => {
		const { root } = repository()
		const run = reportedRun({
			root,
			runId: 'r1',
			tree: TREE_ONE,
			lot: 'lot-a',
			survivors: [survivorOf({ key: 'k1' })],
		})

		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({
				state: 'new',
				file: SCOPE_FILE,
				line: 2,
				mutation: 'ConditionalExpression: x === 1 -> true',
				lineHash: 'hash-k1',
				package: PACKAGE_NAME,
				firstSeen: { runId: 'r1', tree: TREE_ONE, lot: 'lot-a' },
			}),
		})
	})

	it('the ledger is the file <git-common-dir>/dialecte-mutation/ledger.json', () => {
		const { root } = repository()
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })

		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(Object.keys(storedLedger(root))).toEqual([K1])
	})

	it('a survivor the records list with a reason and a known family → not new', () => {
		const { root } = repository()
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })

		expect(
			updateLedger({
				root,
				run,
				records: recordsListing({ key: 'k1', reason: 'a ref always has an id' }),
				targets: [SCOPE_FILE],
			}),
		).toBeUndefined()

		expect(Object.values(readLedger({ root })).filter(({ state }) => state === 'new')).toEqual([])
	})

	it('a survivor whose record has an empty reason → new', () => {
		const { root } = repository()
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })

		expect(
			updateLedger({
				root,
				run,
				records: recordsListing({ key: 'k1', reason: '' }),
				targets: [SCOPE_FILE],
			}),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('a survivor seen again in a later run → still new, with the first seen of the first run', () => {
		const { root } = repository()
		const first = reportedRun({
			root,
			runId: 'r1',
			tree: TREE_ONE,
			lot: 'lot-a',
			survivors: [survivorOf({ key: 'k1' })],
		})
		const second = reportedRun({
			root,
			runId: 'r2',
			tree: TREE_TWO,
			lot: 'lot-b',
			survivors: [survivorOf({ key: 'k1' })],
		})
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(
			updateLedger({ root, run: second, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({
				state: 'new',
				firstSeen: { runId: 'r1', tree: TREE_ONE, lot: 'lot-a' },
			}),
		})
	})

	it('a later run that detected the survivor’s mutant (killed or timed out) → killed', () => {
		const { root } = repository()
		const first = reportedRun({
			root,
			runId: 'r1',
			survivors: [survivorOf({ key: 'k1' }), survivorOf({ key: 'k2' })],
		})
		const second = {
			...reportedRun({ root, runId: 'r2', survivors: [survivorOf({ key: 'k2' })] }),
			detected: ['k1'],
			tested: ['k1', 'k2'],
		}
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(
			updateLedger({ root, run: second, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'killed' }),
			[K2]: expect.objectContaining({ state: 'new' }),
		})
	})

	it('a later run on another file → the survivor stays new', () => {
		const { root } = repository()
		const first = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		const second = reportedRun({ root, runId: 'r2', survivors: [] })
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(
			updateLedger({ root, run: second, records: NO_RECORDS, targets: [OTHER_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('a later run whose records now list the survivor with a reason and a known family → recorded', () => {
		const { root } = repository()
		const first = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		const second = reportedRun({ root, runId: 'r2', survivors: [survivorOf({ key: 'k1' })] })
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(
			updateLedger({
				root,
				run: second,
				records: recordsListing({ key: 'k1', reason: 'a ref always has an id' }),
				targets: [SCOPE_FILE],
			}),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'recorded' }) })
	})

	it('a record with a reason but an unknown family → the survivor stays new', () => {
		const { root } = repository()
		const first = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		const second = reportedRun({ root, runId: 'r2', survivors: [survivorOf({ key: 'k1' })] })
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(
			updateLedger({
				root,
				run: second,
				records: recordsListing({ key: 'k1', reason: 'because', family: 'gap' }),
				targets: [SCOPE_FILE],
			}),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})
})

describe('readLedger', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no ledger yet → empty', () => {
		expect(readLedger({ root: repository().root })).toEqual({})
	})
})

describe('scheduleItems', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	function seeded(): string {
		return repository().root
	}

	it('known keys → scheduled with the follow-up name, the others untouched', () => {
		const root = seeded()
		const run = reportedRun({
			root,
			runId: 'r1',
			survivors: [survivorOf({ key: 'k1' }), survivorOf({ key: 'k2' })],
		})
		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(scheduleItems({ root, keys: ['k1'], followUp: 'guard-cleanup' })).toEqual({
			ok: true,
			scheduled: ['k1'],
		})

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'scheduled', followUp: 'guard-cleanup' }),
			[K2]: expect.objectContaining({ state: 'new' }),
		})
	})

	it('an unknown key → refused naming it, and nothing is scheduled, not even the known keys', () => {
		const root = seeded()
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(scheduleItems({ root, keys: ['k1', 'nope'], followUp: 'guard-cleanup' })).toMatchObject({
			ok: false,
			reason: expect.stringContaining('nope'),
		})

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it("--all-new → every new item of the package scheduled; killed ones and other packages' items are not", () => {
		const { root, other } = repository()
		const first = reportedRun({
			root,
			runId: 'r1',
			survivors: [survivorOf({ key: 'k1' }), survivorOf({ key: 'k2' })],
		})
		const second = {
			...reportedRun({ root, runId: 'r2', survivors: [survivorOf({ key: 'k2' })] }),
			detected: ['k1'],
			tested: ['k1', 'k2'],
		}
		const foreign = {
			...reportedRun({
				root: other,
				runId: 'r3',
				survivors: [survivorOf({ key: 'k3', file: OTHER_FILE })],
			}),
			package: OTHER_PACKAGE,
		}
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()
		expect(
			updateLedger({ root, run: second, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()
		expect(
			updateLedger({ root: other, run: foreign, records: NO_RECORDS, targets: [OTHER_FILE] }),
		).toBeUndefined()

		expect(scheduleAllNew({ root, followUp: 'guard-cleanup' })).toEqual({
			ok: true,
			scheduled: ['k2'],
		})

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'killed' }),
			[K2]: expect.objectContaining({ state: 'scheduled', followUp: 'guard-cleanup' }),
			[OTHER_K3]: expect.objectContaining({ state: 'new' }),
		})
	})
})

describe('pendingOf', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('→ the new items of the package, with their keys, and nothing of the other states', () => {
		const { root } = repository()
		const run = reportedRun({
			root,
			runId: 'r1',
			survivors: [
				survivorOf({ key: 'k1' }),
				survivorOf({ key: 'k2' }),
				survivorOf({ key: 'k3' }),
				survivorOf({ key: 'k4' }),
			],
		})
		const later = {
			...reportedRun({
				root,
				runId: 'r2',
				survivors: [
					survivorOf({ key: 'k2' }),
					survivorOf({ key: 'k3' }),
					survivorOf({ key: 'k4' }),
				],
			}),
			detected: ['k1'],
			tested: ['k1', 'k2', 'k3', 'k4'],
		}
		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(
			updateLedger({
				root,
				run: later,
				records: recordsListing({ key: 'k2', reason: 'a ref always has an id' }),
				targets: [SCOPE_FILE],
			}),
		).toBeUndefined()
		expect(scheduleItems({ root, keys: ['k3'], followUp: 'guard-cleanup' })).toMatchObject({
			ok: true,
		})

		expect(pendingOf({ root })).toMatchObject({
			new: [expect.objectContaining({ key: 'k4', state: 'new' })],
			died: [],
			running: [],
		})
	})

	it('→ the died runs and the running runs of the package; a reported run is neither', () => {
		const { root } = repository()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-running', tree: TREE_ONE, mode: 'changed' }),
		).toBeDefined()
		expect(
			startRun({ root, pid: deadPid(), lot: 'lot-died', tree: TREE_ONE, mode: 'changed' }),
		).toBeDefined()
		expect(
			startRun({ root, pid: process.pid, lot: 'lot-done', tree: TREE_ONE, mode: 'changed' }),
		).toBeDefined()
		const done = readRunByLot({ root, lot: 'lot-done' })
		expect(
			finishRun({
				root,
				runId: done,
				counts: { killed: 1, survived: 0, timedOut: 0, noCoverage: 0 },
				survivors: [],
			}),
		).toBeDefined()

		const pending = pendingOf({ root })

		expect(pending.running.map(({ lot }) => lot)).toEqual(['lot-running'])
		expect(pending.died.map(({ lot }) => lot)).toEqual(['lot-died'])
	})

	it('→ nothing of another package of the same repository', () => {
		const { root, other } = repository()
		const foreign = {
			...reportedRun({
				root: other,
				runId: 'r3',
				survivors: [survivorOf({ key: 'k3', file: OTHER_FILE })],
			}),
			package: OTHER_PACKAGE,
		}
		expect(
			updateLedger({ root: other, run: foreign, records: NO_RECORDS, targets: [OTHER_FILE] }),
		).toBeUndefined()
		expect(
			startRun({
				root: other,
				pid: deadPid(),
				lot: 'lot-other',
				tree: TREE_ONE,
				mode: 'changed',
				now: new Date('2026-11-02T11:00:00.000Z'),
			}),
		).toBeDefined()
		expect(
			startRun({
				root: other,
				pid: process.pid,
				lot: 'lot-other',
				tree: TREE_ONE,
				mode: 'changed',
				now: new Date('2026-11-02T11:00:00.000Z'),
			}),
		).toBeDefined()

		expect(pendingOf({ root })).toEqual({ new: [], died: [], running: [] })
		expect(pendingOf({ root: other })).toMatchObject({
			new: [expect.objectContaining({ key: 'k3' })],
			died: [expect.objectContaining({ lot: 'lot-other' })],
			running: [expect.objectContaining({ lot: 'lot-other' })],
		})
	})

	it('no store yet → nothing pending', () => {
		expect(pendingOf({ root: repository().root })).toEqual({ new: [], died: [], running: [] })
	})
})

function readRunByLot(params: { root: string; lot: string }): string {
	// read the run files directly: the id of the run of this lot
	const runs = storedRuns(params.root)
	return (runs.find((run) => run.lot === params.lot) as { runId: string }).runId
}

describe('updateLedger: what a run covers', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	function seenOnce(): string {
		const { root } = repository()
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()
		return root
	}

	it('a later changed run that mutates only another line range of the same file → the survivor stays new', () => {
		const root = seenOnce()
		const later = reportedRun({ root, runId: 'r2', survivors: [] })

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [`${SCOPE_FILE}:5-9`] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('a later run of its first-seen lot whose line range holds the survivor and no mutant with its key (the line changed) → the survivor stays new', () => {
		const root = seenOnce()
		const later = { ...reportedRun({ root, runId: 'r2', survivors: [] }), detected: [], tested: [] }

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [`${SCOPE_FILE}:1-3`] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('a later audit of its first-seen lot (a whole-file target) holding no mutant with its key → the survivor stays new', () => {
		const root = seenOnce()
		const later = { ...reportedRun({ root, runId: 'r2', survivors: [] }), detected: [], tested: [] }

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('a later changed run of its first-seen lot targeting only the first line of a survivor spanning several lines → the survivor stays new', () => {
		const { root } = repository()
		const spanning = { ...survivorOf({ key: 'k1' }), range: `${SCOPE_FILE}:2:8-4:1` }
		const first = reportedRun({ root, runId: 'r1', survivors: [spanning] })
		expect(
			updateLedger({ root, run: first, records: NO_RECORDS, targets: [`${SCOPE_FILE}:2-4`] }),
		).toBeUndefined()
		const later = { ...reportedRun({ root, runId: 'r2', survivors: [] }), detected: [], tested: [] }

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [`${SCOPE_FILE}:2-2`] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('a later run of another lot covering the survivor, holding no mutant with its key → the survivor stays new', () => {
		const root = seenOnce()
		const later = {
			...reportedRun({ root, runId: 'r2', lot: 'lot-b', survivors: [] }),
			detected: [],
			tested: [],
		}

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [`${SCOPE_FILE}:1-3`] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})

	it('an audit of another lot whose tree lacks the line (no mutant with its key) → the survivor stays new', () => {
		const root = seenOnce()
		const later = {
			...reportedRun({ root, runId: 'r2', lot: 'main', tree: '9'.repeat(40), survivors: [] }),
			mode: 'audit' as const,
			detected: ['other-key'],
			tested: ['other-key'],
		}

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({ [K1]: expect.objectContaining({ state: 'new' }) })
	})
})

describe('updateLedger: a scheduled item', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	function scheduledOnce(): string {
		const { root } = repository()
		const run = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		expect(updateLedger({ root, run, records: NO_RECORDS, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(scheduleItems({ root, keys: ['k1'], followUp: 'guard-cleanup' })).toMatchObject({
			ok: true,
		})
		return root
	}

	it('a later run that detected its mutant → killed, its follow-up kept', () => {
		const root = scheduledOnce()
		const later = {
			...reportedRun({ root, runId: 'r2', survivors: [] }),
			detected: ['k1'],
			tested: ['k1'],
		}

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'killed', followUp: 'guard-cleanup' }),
		})
	})

	it('a later run of its first-seen lot covering it, holding no mutant with its key → it stays scheduled, its follow-up kept', () => {
		const root = scheduledOnce()
		const later = { ...reportedRun({ root, runId: 'r2', survivors: [] }), detected: [], tested: [] }

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'scheduled', followUp: 'guard-cleanup' }),
		})
	})

	it('a later run whose records list it with a reason and a known family → recorded, its follow-up kept', () => {
		const root = scheduledOnce()
		const later = reportedRun({ root, runId: 'r2', survivors: [survivorOf({ key: 'k1' })] })

		expect(
			updateLedger({
				root,
				run: later,
				records: recordsListing({ key: 'k1', reason: 'a ref always has an id' }),
				targets: [SCOPE_FILE],
			}),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'recorded', followUp: 'guard-cleanup' }),
		})
	})

	it('a later run that reports it again → it stays scheduled and keeps its follow-up', () => {
		const root = scheduledOnce()
		const later = reportedRun({ root, runId: 'r2', survivors: [survivorOf({ key: 'k1' })] })

		expect(
			updateLedger({ root, run: later, records: NO_RECORDS, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[K1]: expect.objectContaining({ state: 'scheduled', followUp: 'guard-cleanup' }),
		})
	})
})

describe(
	'the ledger is keyed by package and survivor key',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the same survivor key in two packages → two items, each pending only to its own package', () => {
			const { root, other } = repository()
			const mine = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
			const theirs = {
				...reportedRun({
					root: other,
					runId: 'r2',
					survivors: [survivorOf({ key: 'k1' })],
				}),
				package: OTHER_PACKAGE,
			}
			expect(
				updateLedger({ root, run: mine, records: NO_RECORDS, targets: [SCOPE_FILE] }),
			).toBeUndefined()
			expect(
				updateLedger({ root: other, run: theirs, records: NO_RECORDS, targets: [SCOPE_FILE] }),
			).toBeUndefined()

			expect(readLedger({ root })).toEqual({
				[K1]: expect.objectContaining({ package: PACKAGE_NAME, file: SCOPE_FILE }),
				[OTHER_K1]: expect.objectContaining({ package: OTHER_PACKAGE, file: SCOPE_FILE }),
			})
			expect(pendingOf({ root }).new).toEqual([
				expect.objectContaining({ key: 'k1', package: PACKAGE_NAME }),
			])
			expect(pendingOf({ root: other }).new).toEqual([
				expect.objectContaining({ key: 'k1', package: OTHER_PACKAGE }),
			])
		})

		/** Both packages saw `k1` on the same file path. */
		function bothSawK1(): { root: string; other: string } {
			const { root, other } = repository()
			const mine = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
			const theirs = {
				...reportedRun({ root: other, runId: 'r2', survivors: [survivorOf({ key: 'k1' })] }),
				package: OTHER_PACKAGE,
			}
			expect(
				updateLedger({ root, run: mine, records: NO_RECORDS, targets: [SCOPE_FILE] }),
			).toBeUndefined()
			expect(
				updateLedger({ root: other, run: theirs, records: NO_RECORDS, targets: [SCOPE_FILE] }),
			).toBeUndefined()
			return { root, other }
		}

		it("a run of one package detecting a survivor key → only its own item is killed; the other package's item of that key on the same path stays new", () => {
			const { root } = bothSawK1()
			const later = {
				...reportedRun({ root, runId: 'r3', survivors: [] }),
				detected: ['k1'],
				tested: ['k1'],
			}

			expect(
				updateLedger({ root, run: later, records: NO_RECORDS, targets: [SCOPE_FILE] }),
			).toBeUndefined()

			expect(readLedger({ root })).toEqual({
				[K1]: expect.objectContaining({ state: 'killed' }),
				[OTHER_K1]: expect.objectContaining({ state: 'new' }),
			})
		})

		it("one package's records listing a survivor key → never move the other package's item of that key to recorded", () => {
			const { root } = bothSawK1()
			const later = reportedRun({ root, runId: 'r3', survivors: [survivorOf({ key: 'k1' })] })

			expect(
				updateLedger({
					root,
					run: later,
					records: recordsListing({ key: 'k1', reason: 'a ref always has an id' }),
					targets: [SCOPE_FILE],
				}),
			).toBeUndefined()

			expect(readLedger({ root })).toEqual({
				[K1]: expect.objectContaining({ state: 'recorded' }),
				[OTHER_K1]: expect.objectContaining({ state: 'new' }),
			})
		})
	},
)
