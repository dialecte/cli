import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { crashingRecord, recordWith } from '../../../test/mutation-agent.ts'
import {
	RECORDS_FILE,
	SCOPE_FILE,
	DONE_FILE,
	OTHER_FILE,
} from '../../../test/mutation-package.constants.ts'
import {
	ledgerKeyOf,
	mutationPackage,
	recordablePackage,
	recordsFileText,
	reportedRun,
	storeFileTexts,
	storedLedger,
	survivorOf,
} from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { readLedger, updateLedger } from './ledger.ts'
import { RECORD_REASON_MAX_CHARS } from './mutation-agent.constants.ts'
import {
	MUTATION_FAMILIES,
	MUTATION_LEDGER_LOCK_FILE,
	MUTATION_RUNS_FOLDER,
	MUTATION_STORE_FOLDER,
	RECORD_MOVER,
	REMOVABLE_FAMILIES,
} from './mutation.constants.ts'
import { readRecordsFile } from './records-file.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { MutationFamily, MutationRecords } from './mutation.types.ts'

const REASON = 'no output can differ here'
const MUTATION = 'ConditionalExpression: x === 1 -> true'

function ledgerKey(key: string): string {
	return ledgerKeyOf({ key })
}

function recordedFile(root: string): MutationRecords {
	return JSON.parse(recordsFileText(root) ?? '{}') as MutationRecords
}

/** Everything a refused call must leave alone: the records file, the ledger, the applied runs. */
function filesOf(root: string) {
	return { records: recordsFileText(root), ...storeFileTexts(root) }
}

type Call = Partial<Parameters<typeof recordWith>[0]>

describe('record: the transition table', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('new → recorded, moved by record', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: ['n1'] })).toMatchObject({
			ok: true,
			family: 'wording',
			items: [{ key: 'n1', file: SCOPE_FILE, line: 2, from: 'new', to: 'recorded' }],
		})
		expect(storedLedger(root)[ledgerKey('n1')]).toMatchObject({
			state: 'recorded',
			movedBy: RECORD_MOVER,
		})
	})

	it('scheduled → recorded, moved by record, keeping its follow-up', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: ['s1'] })).toMatchObject({
			ok: true,
			items: [{ key: 's1', from: 'scheduled', to: 'recorded' }],
		})
		expect(storedLedger(root)[ledgerKey('s1')]).toMatchObject({
			state: 'recorded',
			movedBy: RECORD_MOVER,
			followUp: 'later',
		})
	})

	it('killed → unchanged (still killed, still moved by its run), the record written', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: ['kd1'] })).toMatchObject({
			ok: true,
			items: [{ key: 'kd1', from: 'killed', to: 'killed' }],
		})
		expect(storedLedger(root)[ledgerKey('kd1')]).toMatchObject({ state: 'killed', movedBy: 'r2' })
		expect(recordedFile(root)[SCOPE_FILE].kd1).toMatchObject({ family: 'wording', reason: REASON })
	})

	it('recorded → unchanged, its record replaced by the new family and reason', () => {
		const root = recordablePackage()
		writeFiles({
			root,
			files: {
				[RECORDS_FILE]: `${JSON.stringify({
					[SCOPE_FILE]: {
						rc1: {
							line: 7,
							mutation: MUTATION,
							family: 'perf-shortcut',
							reason: 'the old reason',
							lineHash: 'hash-rc1',
						},
					},
				})}\n`,
			},
		})

		expect(
			recordWith({ root, keys: ['rc1'], family: 'static-init', reason: 'the new reason' }),
		).toMatchObject({
			ok: true,
			items: [{ key: 'rc1', from: 'recorded', to: 'recorded' }],
		})
		expect(storedLedger(root)[ledgerKey('rc1')]).toMatchObject({ state: 'recorded', movedBy: 'r2' })
		expect(recordedFile(root)[SCOPE_FILE].rc1).toMatchObject({
			family: 'static-init',
			reason: 'the new reason',
		})
	})

	it('--file → the new and scheduled items of that file only', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: undefined, file: SCOPE_FILE })).toMatchObject({
			ok: true,
			items: expect.arrayContaining([
				expect.objectContaining({ key: 'n1', from: 'new', to: 'recorded' }),
				expect.objectContaining({ key: 'n3' }),
				expect.objectContaining({ key: 'n4' }),
				expect.objectContaining({ key: 's1', from: 'scheduled', to: 'recorded' }),
			]),
		})
		expect(Object.keys(recordedFile(root)[SCOPE_FILE]).sort()).toEqual(['n1', 'n3', 'n4', 's1'])
		expect(storedLedger(root)[ledgerKey('n2')]).toMatchObject({ state: 'new' })
		expect(storedLedger(root)[ledgerKey('kd1')]).toMatchObject({ state: 'killed' })
	})
})

describe('record: the records file', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a record holds line, mutation, family, the trimmed reason and the hashes of its line and tests', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: ['n1'], reason: `  ${REASON} \n` })).toMatchObject({ ok: true })
		expect(recordedFile(root)[SCOPE_FILE].n1).toEqual({
			line: 2,
			mutation: 'ConditionalExpression: x === 1 -> true',
			family: 'wording',
			reason: REASON,
			lineHash: 'hash-n1',
			testsHash: 'th-n1',
		})
	})

	it('an item without a tests hash → a record without one', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: ['n3'] })).toMatchObject({ ok: true })
		expect(recordedFile(root)[SCOPE_FILE].n3).not.toHaveProperty('testsHash')
	})

	it.each(MUTATION_FAMILIES.filter((family) => family !== 'unclassified'))(
		'family %s → written, with removable false only for the two families that carry it',
		(family) => {
			const root = recordablePackage()
			const carries = (REMOVABLE_FAMILIES as readonly string[]).includes(family)

			expect(recordWith({ root, keys: ['n1'], family })).toMatchObject({ ok: true })
			expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({ family })
			expect(Object.hasOwn(recordedFile(root)[SCOPE_FILE].n1, 'removable')).toBe(carries)
			expect(recordedFile(root)[SCOPE_FILE].n1.removable).toBe(carries ? false : undefined)
		},
	)

	it.each(['invariant-guard', 'fallback-never-taken'] as const)(
		'--removable with %s → removable true',
		(family) => {
			const root = recordablePackage()

			expect(recordWith({ root, keys: ['n1'], family, removable: true })).toMatchObject({
				ok: true,
			})
			expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({ family, removable: true })
		},
	)

	it('the other records of the file, and of other files, are kept as they were', () => {
		const root = recordablePackage()
		const migrated = {
			line: 12,
			mutation: 'StringLiteral: "a" -> ""',
			family: 'unclassified',
			reason: 'a migrated reason',
			lineHash: 'old-hash',
		}
		const elsewhere = { ...migrated, line: 3, reason: 'in another file' }
		writeFiles({
			root,
			files: {
				[RECORDS_FILE]: `${JSON.stringify({ [SCOPE_FILE]: { 'migrated-key': migrated }, [OTHER_FILE]: { other: elsewhere } })}\n`,
			},
		})

		expect(recordWith({ root, keys: ['n1'] })).toMatchObject({ ok: true })
		expect(recordedFile(root)).toMatchObject({
			[SCOPE_FILE]: { 'migrated-key': migrated, n1: { family: 'wording' } },
			[OTHER_FILE]: { other: elsewhere },
		})
		expect(recordedFile(root)[SCOPE_FILE]['migrated-key']).not.toHaveProperty('testsHash')
	})

	it('files come out sorted by name, the records of a file by line then key', () => {
		const root = recordablePackage()
		const old = {
			line: 9,
			mutation: MUTATION,
			family: 'wording',
			reason: 'kept',
			lineHash: 'h',
		}
		writeFiles({
			root,
			files: { [RECORDS_FILE]: `${JSON.stringify({ [OTHER_FILE]: { zz: old } })}\n` },
		})

		expect(recordWith({ root, keys: ['s1', 'n4', 'n3', 'n2', 'n1'] })).toMatchObject({ ok: true })
		const written = recordedFile(root)
		expect(Object.keys(written)).toEqual([SCOPE_FILE, OTHER_FILE])
		expect(Object.keys(written[SCOPE_FILE])).toEqual(['n1', 'n3', 's1', 'n4'])
		expect(Object.keys(written[OTHER_FILE])).toEqual(['n2', 'zz'])
	})

	it('tab-indented JSON with a final newline, written through no leftover temporary file', () => {
		const root = recordablePackage()

		expect(recordWith({ root, keys: ['n1'] })).toMatchObject({ ok: true })
		expect(recordsFileText(root)).toBe(`${JSON.stringify(recordedFile(root), null, '\t')}\n`)
		expect(readdirSync(join(root, '.dialecte'))).toEqual(['mutation-records.json'])
	})
})

describe(
	'record: refusals leave the records file and the ledger as they were',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const CASES: [string, Call, RegExp][] = [
			[
				'an unknown family',
				{ family: 'bogus' as MutationFamily },
				/bogus.*wording|wording.*bogus/s,
			],
			['unclassified', { family: 'unclassified' }, /unclassified/],
			['an empty reason', { reason: '' }, /reason/],
			['a reason of blanks', { reason: ' \t\n ' }, /reason/],
			[
				`a reason of ${RECORD_REASON_MAX_CHARS + 1} characters`,
				{ reason: 'x'.repeat(RECORD_REASON_MAX_CHARS + 1) },
				new RegExp(String(RECORD_REASON_MAX_CHARS)),
			],
			[
				'--removable with a family that does not carry it',
				{ family: 'perf-shortcut', removable: true },
				/removable/,
			],
			['an unknown key', { keys: ['nope'] }, /nope/],
			['an unknown key beside a known one', { keys: ['n1', 'nope'] }, /nope/],
			[
				'a file with no item at all',
				{ keys: undefined, file: 'src/engine/none.ts' },
				/src\/engine\/none\.ts/,
			],
			[
				'a file whose items are all killed or recorded',
				{ keys: undefined, file: DONE_FILE },
				/done\.ts/,
			],
		]

		it.each(CASES)('%s → refused', (_label, call, reason) => {
			const root = recordablePackage()
			const before = filesOf(root)

			expect(recordWith({ root, ...call })).toMatchObject({
				ok: false,
				reason: expect.stringMatching(reason),
			})
			expect(filesOf(root)).toEqual(before)
		})

		it('a key that exists only under another package’s ledger key → unknown, nothing written', () => {
			const root = recordablePackage()
			const foreign = {
				...reportedRun({ root, runId: 'rf', survivors: [survivorOf({ key: 'foreign' })] }),
				package: 'other-package',
			}
			expect(
				updateLedger({ root, run: foreign, records: {}, targets: [SCOPE_FILE] }),
			).toBeUndefined()
			const before = filesOf(root)

			expect(recordWith({ root, keys: ['foreign'] })).toMatchObject({
				ok: false,
				reason: expect.stringContaining('foreign'),
			})
			expect(filesOf(root)).toEqual(before)
		})

		it('every unknown key is named', () => {
			const root = recordablePackage()

			expect(recordWith({ root, keys: ['nope', 'n1', 'nada'] })).toMatchObject({
				ok: false,
				reason: expect.stringMatching(/nope[\s\S]*nada|nada[\s\S]*nope/),
			})
		})

		it('a package with no ledger yet → refused, still no records file and no ledger', () => {
			const root = mutationPackage()
			const before = filesOf(root)

			expect(recordWith({ root, keys: ['n1'] })).toMatchObject({ ok: false })
			expect(filesOf(root)).toEqual(before)
			expect(before).toEqual({ records: undefined, ledger: undefined, applied: undefined })
		})

		it(`a reason of exactly ${RECORD_REASON_MAX_CHARS} characters → accepted`, () => {
			const root = recordablePackage()

			expect(
				recordWith({ root, keys: ['n1'], reason: 'x'.repeat(RECORD_REASON_MAX_CHARS) }),
			).toMatchObject({
				ok: true,
			})
		})
	},
)

/** The bound of the case that waits for a child process holding the ledger lock: a guard against a hang. */
const LOCK_CHILD_TIMEOUT = 120_000
/** How long the child holds the lock, in milliseconds: long enough that a call which ignored the lock would finish first. */
const LOCK_HOLD_MS = 2000
/** How long the test waits for the child to say it holds the lock. */
const CHILD_LOCKED_WAIT_MS = 60_000

/**
 * A process that takes the ledger lock as `ledger.ts` `createLock` does (its pid, and its start time as
 * `processStartTime` reads it: `ps -o lstart=` in the C locale and UTC), says `locked`, holds the lock, then writes
 * the reported run entry it was given and removes the lock.
 */
const LOCK_HOLDER_SCRIPT = `
const { openSync, writeSync, closeSync, writeFileSync, rmSync, mkdirSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { dirname } = require('node:path')
const [lock, runFile, runText, holdMs] = process.argv.slice(1)
mkdirSync(dirname(lock), { recursive: true })
mkdirSync(dirname(runFile), { recursive: true })
const descriptor = openSync(lock, 'wx')
const started = spawnSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], {
	encoding: 'utf8',
	env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
}).stdout.trim()
writeSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: started }) + '\\n')
closeSync(descriptor)
process.stdout.write('locked\\n')
setTimeout(() => {
	writeFileSync(runFile, runText)
	rmSync(lock)
}, Number(holdMs))
`

describe('record: forced orders', { timeout: LOCK_CHILD_TIMEOUT }, () => {
	it('while a run holds the ledger lock → waits for its release, then both the run’s survivor and the record are in the ledger', async () => {
		const root = recordablePackage()
		const store = join(commonGitDirOf(root), MUTATION_STORE_FOLDER)
		const run = {
			...reportedRun({
				root,
				runId: 'child-run',
				startedAt: '2026-11-02T12:00:00.000Z',
				survivors: [survivorOf({ key: 'from-run', line: 4 })],
			}),
			packageRoot: root,
		}
		const child = spawn(
			process.execPath,
			[
				'-e',
				LOCK_HOLDER_SCRIPT,
				join(store, MUTATION_LEDGER_LOCK_FILE),
				join(store, MUTATION_RUNS_FOLDER, 'child-run.json'),
				JSON.stringify(run),
				String(LOCK_HOLD_MS),
			],
			{ stdio: ['ignore', 'pipe', 'inherit'] },
		)
		const exited = new Promise<void>((resolve) => child.once('close', () => resolve()))
		onTestFinished(async function stopChild() {
			child.kill()
			await exited
		})
		await new Promise<void>((resolve, reject) => {
			const wait = setTimeout(
				() => reject(new Error('the child never took the lock')),
				CHILD_LOCKED_WAIT_MS,
			)
			child.stdout.once('data', () => {
				clearTimeout(wait)
				resolve()
			})
		})

		expect(recordWith({ root, keys: ['n1'] })).toMatchObject({
			ok: true,
			items: [{ key: 'n1', from: 'new', to: 'recorded' }],
		})
		await exited
		expect(storedLedger(root)).toMatchObject({
			[ledgerKey('from-run')]: { state: 'new' },
			[ledgerKey('n1')]: { state: 'recorded', movedBy: RECORD_MOVER },
		})
		expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({ family: 'wording' })
	})

	describe('a crash after the records write and before the ledger move', () => {
		const CRASH = 'crash between the two writes'

		it('→ the call throws, the records file holds the record, the item is still new', () => {
			const root = recordablePackage()

			expect(crashingRecord({ root, message: CRASH })).toThrow(CRASH)
			expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({ family: 'wording', reason: REASON })
			expect(storedLedger(root)[ledgerKey('n1')]).toMatchObject({ state: 'new' })
		})

		it.each([
			['a later run that reports the item', true],
			['a later run that does not report it', false],
		])('→ %s, with the records file as its records, moves it to recorded', (_label, reports) => {
			const root = recordablePackage()
			expect(crashingRecord({ root, message: CRASH })).toThrow(CRASH)
			const later = reportedRun({
				root,
				runId: 'r3',
				startedAt: '2026-11-02T12:00:00.000Z',
				survivors: reports ? [survivorOf({ key: 'n1', line: 2 })] : [],
			})

			expect(
				updateLedger({
					root,
					run: later,
					records: readRecordsFile({ root }),
					targets: [SCOPE_FILE],
				}),
			).toBeUndefined()
			expect(storedLedger(root)[ledgerKey('n1')]).toMatchObject({
				state: 'recorded',
				movedBy: 'r3',
			})
		})

		it('→ a second record moves it to recorded', () => {
			const root = recordablePackage()
			expect(crashingRecord({ root, message: CRASH })).toThrow(CRASH)

			expect(recordWith({ root, keys: ['n1'] })).toMatchObject({
				ok: true,
				items: [{ key: 'n1', from: 'new', to: 'recorded' }],
			})
			expect(storedLedger(root)[ledgerKey('n1')]).toMatchObject({ state: 'recorded' })
		})
	})

	it('a key a run just killed → stays killed, the records file holds the record', () => {
		const root = recordablePackage()
		const killer = {
			...reportedRun({ root, runId: 'r3', startedAt: '2026-11-02T12:00:00.000Z', survivors: [] }),
			detected: ['n1'],
		}
		expect(updateLedger({ root, run: killer, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(readLedger({ root })[ledgerKey('n1')]).toMatchObject({ state: 'killed', movedBy: 'r3' })

		expect(recordWith({ root, keys: ['n1'] })).toMatchObject({
			ok: true,
			items: [{ key: 'n1', from: 'killed', to: 'killed' }],
		})
		expect(storedLedger(root)[ledgerKey('n1')]).toMatchObject({ state: 'killed', movedBy: 'r3' })
		expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({ family: 'wording' })
	})
})
