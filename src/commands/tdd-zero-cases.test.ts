import {
	ALL_SKIPPED_REFUSAL,
	CANNOT_LIST,
	CASES_HELPER,
	CASES_HELPER_TEXT,
	CONSTANT_GLOB_CONFIG_TEXT,
	DEFAULT_CONFIG,
	DEFAULT_CONFIG_TEXT,
	GLOB_CONSTANTS_FILE,
	GLOB_CONSTANTS_TEXT,
	HELPER_CASES_TEST_TEXT,
	IMPORT_ASSERTION_TEXT,
	LISTING_CONFIG_TEXT,
	NO_CASE_REFUSAL,
	NON_VITEST_SPEC,
	NON_VITEST_SPEC_TEXT,
	NOT_VITEST_LINE,
	OTHER_CONFIG_REFUSAL,
	SRC_TEST,
	SYNTAX_ERROR_TEXT,
	UNIT_CONFIG,
	UNIT_CONFIG_TEXT,
	UNIT_TEST,
} from '../../test/tdd-bugs-zero-cases.constants.ts'
import {
	createZeroCasePackage,
	redCaseCall,
	zeroCaseTestText,
} from '../../test/tdd-bugs-zero-cases.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
/**
 * A test file whose run reports no case is refused by `tdd red` and `tdd green` (and fails the gate's tdd step),
 * with the reason the package's vitest configs give: held by a config the default run does not list, held by the
 * default config yet no case, every case skipped. A file no vitest config includes leaves the selection with one
 * line, never refused nor frozen.
 */
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { readLedger } from '../lib/tdd/tdd-files.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { TddFreeze } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-12T12:00:00.000Z')

/** The package's two configs: the default one runs `src/`, the unit one `unit/` and is not listed. */
const UNLISTED_CONFIGS = { [DEFAULT_CONFIG]: DEFAULT_CONFIG_TEXT, [UNIT_CONFIG]: UNIT_CONFIG_TEXT }

/** The default config only. */
const DEFAULT_ONLY_CONFIGS = { [DEFAULT_CONFIG]: DEFAULT_CONFIG_TEXT }

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

/** The freeze entries naming `file`. */
function freezesNaming(params: { root: string; file: string }): TddFreeze[] {
	return freezes(params.root).filter((freeze) => params.file in freeze.files)
}

/** The files the `frozen:` list of a red run's summary names. */
function frozenList(output: string): string[] {
	const line = output.split('\n').find((candidate) => candidate.startsWith('tdd red: '))
	const list = line?.split('frozen: ')[1] ?? ''
	return list === '' ? [] : list.split(', ')
}

/** The lines of the output. */
function linesOf(output: string): string[] {
	return output.split('\n')
}

/** A file whose test calls are all skipped, or none runs. */
const SKIPPED_CALL = "it.skip('skipped one → never runs', () => { expect(1).toBe(2) })"
const SKIPPED_CALL_TWO = "it.skip('skipped two → never runs either', () => { expect(1).toBe(2) })"
const TODO_CALL = "it.todo('todo one → never written')"
const SKIP_IF_CALL =
	"it.skipIf(true)('skipped by its condition → never runs', () => { expect(1).toBe(2) })"

/** The default config and a unit config whose include is a constant: no config the reader can read holds the unit file. */
const CONSTANT_GLOB_CONFIGS = {
	[DEFAULT_CONFIG]: DEFAULT_CONFIG_TEXT,
	[UNIT_CONFIG]: CONSTANT_GLOB_CONFIG_TEXT,
	[GLOB_CONSTANTS_FILE]: GLOB_CONSTANTS_TEXT,
}

const REFUSED_SCENARIOS: {
	title: string
	configs: Record<string, string>
	file: string
	text: string
	reason: string
}[] = [
	{
		title:
			'a new file only the unit config includes, the default config listing no projects → refused naming the unit config',
		configs: UNLISTED_CONFIGS,
		file: UNIT_TEST,
		text: zeroCaseTestText({ body: [redCaseCall()] }),
		reason: OTHER_CONFIG_REFUSAL,
	},
	{
		title:
			'a new file the default config holds with an empty describe → refused: ran no case of the file',
		configs: DEFAULT_ONLY_CONFIGS,
		file: SRC_TEST,
		text: zeroCaseTestText({ body: [] }),
		reason: NO_CASE_REFUSAL,
	},
	{
		title:
			'a new file the default config holds without any test call → refused: ran no case of the file',
		configs: DEFAULT_ONLY_CONFIGS,
		file: SRC_TEST,
		text: "import { describe } from 'vitest'\nexport const none = describe\n",
		reason: NO_CASE_REFUSAL,
	},
	{
		title: 'a new file whose every case is skipped → refused: every case is skipped',
		configs: DEFAULT_ONLY_CONFIGS,
		file: SRC_TEST,
		text: zeroCaseTestText({ body: [SKIPPED_CALL, SKIPPED_CALL_TWO] }),
		reason: ALL_SKIPPED_REFUSAL,
	},
	{
		title: 'a new file whose every case is a todo → refused: every case is skipped',
		configs: DEFAULT_ONLY_CONFIGS,
		file: SRC_TEST,
		text: zeroCaseTestText({ body: [TODO_CALL] }),
		reason: ALL_SKIPPED_REFUSAL,
	},
	{
		title: 'a new file whose cases are a skip and a todo → refused: every case is skipped',
		configs: DEFAULT_ONLY_CONFIGS,
		file: SRC_TEST,
		text: zeroCaseTestText({ body: [SKIPPED_CALL, TODO_CALL] }),
		reason: ALL_SKIPPED_REFUSAL,
	},
	{
		title:
			'a new unit file, a unit config whose include is an imported constant (unreadable), the default config not holding it → refused: ran no case of the file, never left out as not a vitest file',
		configs: CONSTANT_GLOB_CONFIGS,
		file: UNIT_TEST,
		text: zeroCaseTestText({ body: [redCaseCall()] }),
		reason: NO_CASE_REFUSAL,
	},
	{
		title: 'a new file whose only case is it.skipIf(true) → refused: every case is skipped',
		configs: DEFAULT_ONLY_CONFIGS,
		file: SRC_TEST,
		text: zeroCaseTestText({ body: [SKIP_IF_CALL] }),
		reason: ALL_SKIPPED_REFUSAL,
	},
]

describe(
	'tdd and a test file whose run reports no case',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		for (const subcommand of ['red', 'green'] as const)
			for (const scenario of REFUSED_SCENARIOS)
				it(`${scenario.title} (tdd ${subcommand}) → exit 1, the file refused with the reason, nothing frozen for it`, async () => {
					const root = createZeroCasePackage({
						configs: scenario.configs,
						written: { [scenario.file]: scenario.text },
					})

					const result = await tdd({ cwd: root, argv: [subcommand] })

					expect(result.exitCode).toBe(1)
					expect(linesOf(result.output)).toContain(`refused  ${scenario.file}  ${scenario.reason}`)
					expect(freezesNaming({ root, file: scenario.file })).toEqual([])
				})

		it('the same unit file listed by the default config projects → red judges it red and freezes it', async () => {
			const root = createZeroCasePackage({
				configs: { [DEFAULT_CONFIG]: LISTING_CONFIG_TEXT, [UNIT_CONFIG]: UNIT_CONFIG_TEXT },
				written: { [UNIT_TEST]: zeroCaseTestText({ body: [redCaseCall()] }) },
			})

			const result = await tdd({ cwd: root, argv: ['red'] })

			expect(result.exitCode).toBe(0)
			expect(frozenList(result.output)).toEqual([UNIT_TEST])
		})

		for (const subcommand of ['red', 'green'] as const) {
			it(`a non-vitest spec no config includes beside a real new test file (tdd ${subcommand}) → the spec gets the not-a-vitest line and no refusal, not frozen`, async () => {
				const root = createZeroCasePackage({
					configs: DEFAULT_ONLY_CONFIGS,
					written: {
						[NON_VITEST_SPEC]: NON_VITEST_SPEC_TEXT,
						[SRC_TEST]: zeroCaseTestText({ body: [redCaseCall()] }),
					},
				})

				const result = await tdd({ cwd: root, argv: [subcommand] })

				const specLines = linesOf(result.output).filter((line) => line.includes(NON_VITEST_SPEC))
				expect(specLines.some((line) => line.includes(NOT_VITEST_LINE))).toBe(true)
				expect(specLines.some((line) => line.startsWith('refused'))).toBe(false)
				expect(freezesNaming({ root, file: NON_VITEST_SPEC })).toEqual([])
			})

			it(`only a non-vitest spec in the change (tdd ${subcommand}) → the not-a-vitest line, no refusal, not frozen, exit 0`, async () => {
				const root = createZeroCasePackage({
					configs: DEFAULT_ONLY_CONFIGS,
					written: { [NON_VITEST_SPEC]: NON_VITEST_SPEC_TEXT },
				})

				const result = await tdd({ cwd: root, argv: [subcommand] })

				const specLines = linesOf(result.output).filter((line) => line.includes(NON_VITEST_SPEC))
				expect(specLines.some((line) => line.includes(NOT_VITEST_LINE))).toBe(true)
				expect(specLines.some((line) => line.startsWith('refused'))).toBe(false)
				expect(freezesNaming({ root, file: NON_VITEST_SPEC })).toEqual([])
				expect(result.exitCode).toBe(0)
			})
		}

		it('a non-vitest spec beside a real new test file (tdd red) → the real file is frozen alone, exit 0', async () => {
			const root = createZeroCasePackage({
				configs: DEFAULT_ONLY_CONFIGS,
				written: {
					[NON_VITEST_SPEC]: NON_VITEST_SPEC_TEXT,
					[SRC_TEST]: zeroCaseTestText({ body: [redCaseCall()] }),
				},
			})

			const result = await tdd({ cwd: root, argv: ['red'] })

			expect(frozenList(result.output)).toEqual([SRC_TEST])
			expect(result.exitCode).toBe(0)
		})

		it("a non-vitest spec alone in the change, tdd red run first → the gate's tdd step passes and no line names the spec but the not-a-vitest line", async () => {
			const root = createZeroCasePackage({
				configs: DEFAULT_ONLY_CONFIGS,
				written: { [NON_VITEST_SPEC]: NON_VITEST_SPEC_TEXT },
			})
			await tdd({ cwd: root, argv: ['red'] })

			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

			const naming = [check.reason ?? '', ...(check.lines ?? []), ...(check.details ?? [])].filter(
				(line) => line.includes(NON_VITEST_SPEC),
			)
			expect(freezesNaming({ root, file: NON_VITEST_SPEC })).toEqual([])
			expect(check.status).toBe('passed')
			expect(naming.filter((line) => !line.includes(NOT_VITEST_LINE))).toEqual([])
		})

		it('a test file whose top level throws an AssertionError at import → refused: cannot list its cases, the message naming the assertion', async () => {
			const root = createZeroCasePackage({
				configs: DEFAULT_ONLY_CONFIGS,
				written: { [SRC_TEST]: IMPORT_ASSERTION_TEXT },
			})

			const result = await tdd({ cwd: root, argv: ['red'] })

			const refusal = linesOf(result.output).find((line) => line.startsWith(`refused  ${SRC_TEST}`))
			expect(refusal).toMatch(
				new RegExp(`^refused  ${SRC_TEST}  ${CANNOT_LIST}: .*expected 1 to be 2`),
			)
			expect(freezesNaming({ root, file: SRC_TEST })).toEqual([])
		})

		it('one real case and one skipped case → judged as today: the real one red, the file frozen, exit 0', async () => {
			const root = createZeroCasePackage({
				configs: DEFAULT_ONLY_CONFIGS,
				written: { [SRC_TEST]: zeroCaseTestText({ body: [redCaseCall(), SKIPPED_CALL] }) },
			})

			const result = await tdd({ cwd: root, argv: ['red'] })

			expect(result.exitCode).toBe(0)
			expect(frozenList(result.output)).toEqual([SRC_TEST])
			expect(linesOf(result.output).some((line) => line.startsWith('refused'))).toBe(false)
		})

		it('cases registered by an imported helper beside an it.todo → red freezes the file and the gate does not refuse it as every case skipped', async () => {
			const root = createZeroCasePackage({
				configs: DEFAULT_ONLY_CONFIGS,
				written: { [CASES_HELPER]: CASES_HELPER_TEXT, [SRC_TEST]: HELPER_CASES_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

			expect(red.exitCode).toBe(0)
			expect(frozenList(red.output)).toEqual([SRC_TEST])
			expect(
				[check.reason ?? '', ...(check.lines ?? [])].filter((line) =>
					line.includes(ALL_SKIPPED_REFUSAL),
				),
			).toEqual([])
		})

		it('a test file that does not parse → refused: cannot list its cases, nothing frozen for it', async () => {
			const root = createZeroCasePackage({
				configs: DEFAULT_ONLY_CONFIGS,
				written: { [SRC_TEST]: SYNTAX_ERROR_TEXT },
			})

			const result = await tdd({ cwd: root, argv: ['red'] })

			expect(result.exitCode).toBe(1)
			expect(
				linesOf(result.output).some((line) =>
					line.startsWith(`refused  ${SRC_TEST}  ${CANNOT_LIST}`),
				),
			).toBe(true)
			expect(freezesNaming({ root, file: SRC_TEST })).toEqual([])
		})

		for (const scenario of REFUSED_SCENARIOS)
			it(`${scenario.title} (the gate's tdd step) → failed, naming the file and the reason`, async () => {
				const root = createZeroCasePackage({
					configs: scenario.configs,
					written: { [scenario.file]: scenario.text },
				})

				const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

				expect(check.status).toBe('failed')
				expect(
					[check.reason ?? '', ...(check.lines ?? [])].some(
						(line) => line.includes(scenario.file) && line.includes(scenario.reason),
					),
				).toBe(true)
			})
	},
)
