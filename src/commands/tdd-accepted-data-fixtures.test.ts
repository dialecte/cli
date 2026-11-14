import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	CHANGED_SINCE_RED,
	CODE_GLOB_MATCH,
	CODE_GLOB_MATCH_TEXT,
	CODE_HELPER,
	CODE_HELPER_TEXT,
	CODE_RAW_HELPER,
	CODE_RAW_HELPER_TEXT,
	COUNTER,
	COUNTER_DONE_TEXT,
	COUNTER_TEST,
	COUNTER_TEST_TEXT,
	COUNTER_TEXT,
	DATA_JSON_FIXTURE,
	DATA_JSON_TEXT,
	ONE_IED_EDITED_TEXT,
	ONE_IED_FIXTURE,
	ONE_IED_TEXT,
	READER_CASE,
	READER_TEST,
	RED_TEST,
	RED_TEST_TEXT,
	TWO_IEDS_FIXTURE,
	TWO_IEDS_TEXT,
} from '../../test/tdd-bugs-data-fixtures.constants.ts'
import { createDataFixturePackage, readerTestText } from '../../test/tdd-bugs-data-fixtures.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { hashTestCode, readLedger } from '../lib/tdd/tdd-files.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { ReaderTestParts } from '../../test/tdd-bugs-data-fixtures.types.ts'
import type { TddFreeze } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-12T12:00:00.000Z')

/** The reader of the one `.xml` fixture, read with `?raw`: the repro. */
const XML_RAW_READER: ReaderTestParts = {
	imports: [`import OneIedXml from './fixtures/one-ied.xml?raw'`],
	assertions: [`expect(OneIedXml).toContain('<IED name="A"')`],
}

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** The freeze entries of the package's ledger, oldest first. */
function freezes(root: string): TddFreeze[] {
	const ledger = readLedger(root)
	if ('failure' in ledger) throw new Error(ledger.failure)
	return ledger.entries.filter((entry): entry is TddFreeze => entry.kind === 'freeze')
}

/** The hashes the ledger froze `file` at, oldest first. */
function frozenHashes(params: { root: string; file: string }): string[] {
	return freezes(params.root).flatMap((freeze) => {
		const hash = freeze.files[params.file]
		return hash === undefined ? [] : [hash]
	})
}

/** The files the `frozen:` list of a red run's summary names. */
function frozenList(output: string): string[] {
	const line = output.split('\n').find((candidate) => candidate.startsWith('tdd red: '))
	const list = line?.split('frozen: ')[1] ?? ''
	return list === '' ? [] : list.split(', ')
}

const READER_SCENARIOS: {
	title: string
	written: Record<string, string>
	parts: ReaderTestParts
	frozen: string[]
	notFrozen: string[]
}[] = [
	{
		title:
			'an accepted file importing a `.ts` helper and reading a `.ts` file with `?raw` → red freezes the test file, neither of the two code files',
		written: { [CODE_HELPER]: CODE_HELPER_TEXT, [CODE_RAW_HELPER]: CODE_RAW_HELPER_TEXT },
		parts: {
			imports: [
				"import { HELPER_NAME } from '../test/helper.ts'",
				"import RawHelper from '../test/helper-text.ts?raw'",
			],
			assertions: ["expect(HELPER_NAME).toBe('A')", "expect(RawHelper).toContain('RAW_NAME')"],
		},
		frozen: [READER_TEST],
		notFrozen: [CODE_HELPER, CODE_RAW_HELPER],
	},
	{
		title:
			'an accepted file importing a `.json` file → red freezes the test file and the `.json` file',
		written: { [DATA_JSON_FIXTURE]: DATA_JSON_TEXT },
		parts: {
			imports: ["import Data from './fixtures/data.json'"],
			assertions: ["expect(Data.name).toBe('A')"],
		},
		frozen: [READER_TEST, DATA_JSON_FIXTURE],
		notFrozen: [],
	},
	{
		title:
			'an accepted file with an `import.meta.glob` of `.xml` fixtures → red freezes the test file and the matched fixture',
		written: { [ONE_IED_FIXTURE]: ONE_IED_TEXT },
		parts: {
			imports: [],
			setup: [
				"const documents = import.meta.glob('./fixtures/*.xml', { query: '?raw', import: 'default', eager: true })",
			],
			assertions: ["expect(Object.keys(documents)).toEqual(['./fixtures/one-ied.xml'])"],
		},
		frozen: [READER_TEST, ONE_IED_FIXTURE],
		notFrozen: [],
	},
	{
		title:
			'an accepted file with an `import.meta.glob` of `.ts` files → red freezes the test file, not the matched `.ts` file',
		written: { [CODE_GLOB_MATCH]: CODE_GLOB_MATCH_TEXT },
		parts: {
			imports: [],
			setup: ["const modules = import.meta.glob('./fixtures/code/*.ts', { eager: true })"],
			assertions: ["expect(Object.keys(modules)).toEqual(['./fixtures/code/glob-match.ts'])"],
		},
		frozen: [READER_TEST],
		notFrozen: [CODE_GLOB_MATCH],
	},
]

describe(
	'a red run over a test file whose cases are all accepted, and the files it depends on',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('a new test file whose one passing case is accepted, reading a `.xml` fixture with `?raw` → red lists the test file and the fixture in `frozen:` and the ledger holds the fixture hash', async () => {
			const root = createDataFixturePackage({
				written: {
					[READER_TEST]: readerTestText(XML_RAW_READER),
					[ONE_IED_FIXTURE]: ONE_IED_TEXT,
				},
				accepted: [READER_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(frozenList(red.output).sort()).toEqual([READER_TEST, ONE_IED_FIXTURE].sort())
			expect(frozenHashes({ root, file: ONE_IED_FIXTURE })).toEqual([
				hashTestCode({ root, file: ONE_IED_FIXTURE }),
			])
		})

		it('the same, then tdd green with nothing edited → green is not refused for a changed test code file', async () => {
			const root = createDataFixturePackage({
				written: {
					[READER_TEST]: readerTestText(XML_RAW_READER),
					[ONE_IED_FIXTURE]: ONE_IED_TEXT,
				},
				accepted: [READER_CASE],
			})
			await tdd({ cwd: root, argv: ['red'] })

			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(green.output).not.toContain(CHANGED_SINCE_RED)
		})

		for (const { title, written, parts, frozen, notFrozen } of READER_SCENARIOS)
			it(title, async () => {
				const root = createDataFixturePackage({
					written: { ...written, [READER_TEST]: readerTestText(parts) },
					accepted: [READER_CASE],
				})

				const red = await tdd({ cwd: root, argv: ['red'] })

				expect(frozenList(red.output).sort()).toEqual([...frozen].sort())
				for (const file of notFrozen) expect(frozenHashes({ root, file })).toEqual([])
			})

		it('a fixture read by a red file and by an accepted file, the accepted file also reading a second fixture → one freeze entry holds the shared fixture at one hash, the second fixture is frozen, nothing is refused', async () => {
			const root = createDataFixturePackage({
				written: {
					[RED_TEST]: RED_TEST_TEXT,
					[READER_TEST]: readerTestText({
						imports: [
							"import SharedXml from './fixtures/one-ied.xml?raw'",
							"import SecondXml from './fixtures/two-ieds.xml?raw'",
						],
						assertions: [
							`expect(SharedXml).toContain('<IED name="A"')`,
							`expect(SecondXml).toContain('<IED name="B"')`,
						],
					}),
					[ONE_IED_FIXTURE]: ONE_IED_TEXT,
					[TWO_IEDS_FIXTURE]: TWO_IEDS_TEXT,
				},
				accepted: [READER_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output).toContain('1 red, 0 unchanged, 0 kept, 1 accepted, 0 revised, 0 refused')
			expect(frozenHashes({ root, file: ONE_IED_FIXTURE })).toEqual([
				hashTestCode({ root, file: ONE_IED_FIXTURE }),
			])
			expect(frozenHashes({ root, file: TWO_IEDS_FIXTURE })).toEqual([
				hashTestCode({ root, file: TWO_IEDS_FIXTURE }),
			])
		})

		it('an accepted file’s fixture edited after the red run → green refuses naming the fixture, which red had frozen at its first text', async () => {
			const root = createDataFixturePackage({
				written: {
					[READER_TEST]: readerTestText(XML_RAW_READER),
					[ONE_IED_FIXTURE]: ONE_IED_TEXT,
				},
				accepted: [READER_CASE],
			})
			const firstHash = hashTestCode({ root, file: ONE_IED_FIXTURE })
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, ONE_IED_FIXTURE), ONE_IED_EDITED_TEXT)

			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(frozenHashes({ root, file: ONE_IED_FIXTURE })).toEqual([firstHash])
			expect(green.exitCode).toBe(1)
			expect(green.output).toContain(`${CHANGED_SINCE_RED}: ${ONE_IED_FIXTURE}`)
		})

		it('a case proven red then green, its fixture edited after the green, then tdd red (guard) → the edited fixture is not frozen, green refuses naming it', async () => {
			const root = createDataFixturePackage({
				committed: { [COUNTER]: COUNTER_TEXT },
				written: { [COUNTER_TEST]: COUNTER_TEST_TEXT, [ONE_IED_FIXTURE]: ONE_IED_TEXT },
			})
			const firstHash = hashTestCode({ root, file: ONE_IED_FIXTURE })
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, COUNTER), COUNTER_DONE_TEXT)
			await tdd({ cwd: root, argv: ['green'] })
			writeFileSync(join(root, ONE_IED_FIXTURE), ONE_IED_EDITED_TEXT)
			const editedHash = hashTestCode({ root, file: ONE_IED_FIXTURE })

			const secondRed = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(secondRed.output).toMatch(
				/^kept +src\/count\.test\.ts::.*proven before \(green\) +flags: test code changed around it$/m,
			)
			expect(frozenHashes({ root, file: ONE_IED_FIXTURE })).not.toContain(editedHash)
			expect(frozenHashes({ root, file: ONE_IED_FIXTURE })).toContain(firstHash)
			expect(green.exitCode).toBe(1)
			expect(green.output).toContain(`${CHANGED_SINCE_RED}: ${ONE_IED_FIXTURE}`)
		})

		it('a committed test file and its committed fixture, the fixture edited in the working tree (guard) → red does not freeze the fixture', async () => {
			const root = createDataFixturePackage({
				committed: {
					[READER_TEST]: readerTestText(XML_RAW_READER),
					[ONE_IED_FIXTURE]: ONE_IED_TEXT,
				},
				written: {
					[READER_TEST]: `// edited at review, the case untouched\n${readerTestText(XML_RAW_READER)}`,
					[ONE_IED_FIXTURE]: ONE_IED_EDITED_TEXT,
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.output).toContain('0 red, 1 unchanged, 0 kept, 0 accepted')
			expect(frozenList(red.output)).not.toContain(ONE_IED_FIXTURE)
			expect(frozenHashes({ root, file: ONE_IED_FIXTURE })).toEqual([])
		})
	},
)
