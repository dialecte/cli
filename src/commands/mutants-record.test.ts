import {
	RECORDS_FILE,
	SCOPE_FILE,
	DONE_FILE,
	OTHER_FILE,
} from '../../test/mutation-package.constants.ts'
import {
	ledgerKeyOf,
	parsedOutput,
	recordablePackage,
	recordsFileText,
	runMutantsIn,
	storeFileTexts,
	storedLedger,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { RECORD_REASON_MAX_CHARS } from '../lib/mutation/mutation-agent.constants.ts'

import { describe, expect, it } from 'vitest'

import type { MutationRecords } from '../lib/mutation/mutation.types.ts'

const REASON = 'no output can differ here'
const FAMILY_AND_REASON = ['--family', 'wording', '--reason', REASON]

function recordedFile(root: string): MutationRecords {
	return JSON.parse(recordsFileText(root) ?? '{}') as MutationRecords
}

function filesOf(root: string) {
	return { records: recordsFileText(root), ...storeFileTexts(root) }
}

describe('mutants record: what it records', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each([
		['--key a --key b', ['record', '--key', 'n1', '--key', 'n2', ...FAMILY_AND_REASON]],
		['--key a b', ['record', '--key', 'n1', 'n2', ...FAMILY_AND_REASON]],
		['--key a b before the family', ['record', ...FAMILY_AND_REASON, '--key', 'n1', 'n2']],
	])('%s → both recorded', async (_label, argv) => {
		const root = recordablePackage()

		await expect(runMutantsIn({ root, argv })).resolves.toMatchObject({ exitCode: 0 })
		expect(Object.keys(recordedFile(root)[SCOPE_FILE])).toEqual(['n1'])
		expect(Object.keys(recordedFile(root)[OTHER_FILE])).toEqual(['n2'])
		expect(storedLedger(root)).toMatchObject({
			[ledgerKeyOf({ key: 'n1' })]: { state: 'recorded', movedBy: 'record' },
			[ledgerKeyOf({ key: 'n2' })]: { state: 'recorded', movedBy: 'record' },
		})
	})

	it('--file → the new and scheduled items of the file, no other', async () => {
		const root = recordablePackage()

		await expect(
			runMutantsIn({ root, argv: ['record', '--file', SCOPE_FILE, ...FAMILY_AND_REASON] }),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(Object.keys(recordedFile(root)[SCOPE_FILE]).sort()).toEqual(['n1', 'n3', 'n4', 's1'])
		expect(recordedFile(root)).not.toHaveProperty(OTHER_FILE)
		expect(storedLedger(root)[ledgerKeyOf({ key: 'n2' })]).toMatchObject({ state: 'new' })
	})

	it('--removable with a family that carries it → removable true in the record', async () => {
		const root = recordablePackage()

		await expect(
			runMutantsIn({
				root,
				argv: [
					'record',
					'--key',
					'n1',
					'--family',
					'invariant-guard',
					'--removable',
					'--reason',
					REASON,
				],
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({
			family: 'invariant-guard',
			removable: true,
		})
	})

	it('without --removable → removable false for a family that carries it', async () => {
		const root = recordablePackage()

		await expect(
			runMutantsIn({
				root,
				argv: ['record', '--key', 'n1', '--family', 'fallback-never-taken', '--reason', REASON],
			}),
		).resolves.toMatchObject({ exitCode: 0 })
		expect(recordedFile(root)[SCOPE_FILE].n1).toMatchObject({ removable: false })
	})

	it(`a reason of exactly ${RECORD_REASON_MAX_CHARS} characters → accepted`, async () => {
		await expect(
			runMutantsIn({
				root: recordablePackage(),
				argv: [
					'record',
					'--key',
					'n1',
					'--family',
					'wording',
					'--reason',
					'x'.repeat(RECORD_REASON_MAX_CHARS),
				],
			}),
		).resolves.toMatchObject({ exitCode: 0 })
	})
})

describe('mutants record: its output', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a head line with the count, the family and the file, then one line per item', async () => {
		const root = recordablePackage()

		await expect(
			runMutantsIn({ root, argv: ['record', '--key', 'n1', 'n2', ...FAMILY_AND_REASON] }),
		).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(
				new RegExp(
					`^mutants record: 2 survivors recorded as wording in ${RECORDS_FILE.replaceAll('.', '\\.')}\\n`,
				),
			),
		})
	})

	it('the item lines: key, file:line, from → to', async () => {
		const root = recordablePackage()

		const { output } = await runMutantsIn({
			root,
			argv: ['record', '--key', 'n1', 'n2', ...FAMILY_AND_REASON],
		})

		expect(output).toMatch(/^ {2}n1 {2}src\/engine\/a\.ts:2 {2}new → recorded$/m)
		expect(output).toMatch(/^ {2}n2 {2}src\/engine\/b\.ts:3 {2}new → recorded$/m)
	})

	it('one survivor → "1 survivor recorded"', async () => {
		await expect(
			runMutantsIn({
				root: recordablePackage(),
				argv: ['record', '--key', 'n1', ...FAMILY_AND_REASON],
			}),
		).resolves.toMatchObject({
			output: expect.stringMatching(/^mutants record: 1 survivor recorded as wording in /),
		})
	})

	it('an item that stays as it was → its line says unchanged', async () => {
		await expect(
			runMutantsIn({
				root: recordablePackage(),
				argv: ['record', '--key', 'kd1', ...FAMILY_AND_REASON],
			}),
		).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/^ {2}kd1 {2}src\/engine\/a\.ts:6 {2}.*unchanged/m),
		})
	})

	it('--json → { verb, ok, family, path, items } as one JSON object', async () => {
		const root = recordablePackage()

		await expect(
			runMutantsIn({
				root,
				argv: ['record', '--key', 'n1', 'kd1', ...FAMILY_AND_REASON, '--json'],
			}).then(({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) })),
		).resolves.toEqual({
			exitCode: 0,
			json: {
				verb: 'record',
				ok: true,
				family: 'wording',
				path: RECORDS_FILE,
				items: expect.arrayContaining([
					{ key: 'n1', file: SCOPE_FILE, line: 2, from: 'new', to: 'recorded' },
					{ key: 'kd1', file: SCOPE_FILE, line: 6, from: 'killed', to: 'killed' },
				]),
			},
		})
	})
})

describe(
	'mutants record: refusals (exit 1, nothing written)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			['an unknown family', ['--key', 'n1', '--family', 'bogus', '--reason', REASON], /bogus/],
			[
				'unclassified',
				['--key', 'n1', '--family', 'unclassified', '--reason', REASON],
				/unclassified/,
			],
			['an empty reason', ['--key', 'n1', '--family', 'wording', '--reason', ''], /reason/],
			['a reason of blanks', ['--key', 'n1', '--family', 'wording', '--reason', '   '], /reason/],
			[
				'a reason that is too long',
				['--key', 'n1', '--family', 'wording', '--reason', 'x'.repeat(RECORD_REASON_MAX_CHARS + 1)],
				new RegExp(String(RECORD_REASON_MAX_CHARS)),
			],
			[
				'--removable with another family',
				['--key', 'n1', '--family', 'perf-shortcut', '--removable', '--reason', REASON],
				/removable/,
			],
			['an unknown key beside a known one', ['--key', 'n1', 'nope', ...FAMILY_AND_REASON], /nope/],
			['a file with no pending item', ['--file', DONE_FILE, ...FAMILY_AND_REASON], /done\.ts/],
		])(
			'%s → exit 1, the records file and the ledger as they were',
			async (_label, args, reason) => {
				const root = recordablePackage()
				const before = filesOf(root)

				await expect(runMutantsIn({ root, argv: ['record', ...args] })).resolves.toMatchObject({
					exitCode: 1,
					output: expect.stringMatching(reason),
				})
				expect(filesOf(root)).toEqual(before)
			},
		)

		it('--json refused → { verb, ok: false, reason }, exit 1', async () => {
			await expect(
				runMutantsIn({
					root: recordablePackage(),
					argv: ['record', '--key', 'nope', ...FAMILY_AND_REASON, '--json'],
				}).then(({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) })),
			).resolves.toMatchObject({
				exitCode: 1,
				json: { verb: 'record', ok: false, reason: expect.stringContaining('nope') },
			})
		})
	},
)

describe(
	'mutants record: usage errors (exit 2, nothing written)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			['both --key and --file', ['--key', 'n1', '--file', SCOPE_FILE, ...FAMILY_AND_REASON]],
			['neither --key nor --file', [...FAMILY_AND_REASON]],
			['no --family', ['--key', 'n1', '--reason', REASON]],
			['no --reason', ['--key', 'n1', '--family', 'wording']],
			['an unknown option', ['--key', 'n1', ...FAMILY_AND_REASON, '--bogus']],
		])('%s → usage, exit 2', async (_label, args) => {
			const root = recordablePackage()
			const before = filesOf(root)

			await expect(runMutantsIn({ root, argv: ['record', ...args] })).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringContaining('mutants record'),
			})
			expect(filesOf(root)).toEqual(before)
		})

		it('--json with a usage error → { verb, ok: false, reason }, exit 2', async () => {
			await expect(
				runMutantsIn({
					root: recordablePackage(),
					argv: ['record', ...FAMILY_AND_REASON, '--json'],
				}).then(({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) })),
			).resolves.toMatchObject({
				exitCode: 2,
				json: { verb: 'record', ok: false, reason: expect.any(String) },
			})
		})
	},
)
