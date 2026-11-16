/**
 * `tdd red`, `tdd green`, `tdd status` and the gate's tdd state over a package of `node --test` files: the cases of
 * a node file get the same receipts, freezes and refusals as a vitest one.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../test/scratch-repository.ts'
import { ALL_SKIPPED_REFUSAL } from '../../test/tdd-bugs-zero-cases.constants.ts'
import {
	ADD_AND_MULTIPLY_TEXT,
	ADD_CASE,
	ADD_PYTEST_CASE,
	ADD_SECOND_CASE,
	BASE_RED_SCENARIO_TIMEOUT,
	EDITABLE_DIST_FILES,
	EDITABLE_INTERPRETER_TEXT,
	EXPECTED_BASE_TEXT,
	EXPECTED_FILE,
	EXPECTED_REVISED_TEXT,
	IGNORED_VALUES_FILE,
	IGNORED_VALUES_TEXT,
	IGNORING_VALUES_GITIGNORE_TEXT,
	LEFTOVER_AGE_MS,
	LOT_ACCEPT_HINT_PATTERN,
	LOT_FIRST_INTERPRETER_TEXT,
	NAMED_PROJECT_TOML_TEXT,
	NO_PYTHONPATH_TOML_TEXT,
	NODE_REVISED_TEST_TEXT,
	PYTEST_REVISED_TEST_TEXT,
	REVISION_REASON,
	TOTAL_FILE,
	TOTAL_TEXT,
	VITEST_CORRECTED_TEST_TEXT,
	VITEST_HELPER_TEST_TEXT,
	VITEST_NEW_EXPORT_TEST_TEXT,
	VITEST_REVISED_TEST_TEXT,
	VITEST_TOTAL_TEST_TEXT,
	VITEST_TWO_CASES_TEST_TEXT,
} from '../../test/tdd-runners-base-red-workspace.constants.ts'
import {
	createBaseRedPackage,
	folderLoggingInterpreter,
	loggingVitestTestText,
	snapshotTree,
} from '../../test/tdd-runners-base-red-workspace.ts'
import { FLAG_CARD_CASE_TIMEOUT } from '../../test/tdd-runners-handover-flags.constants.ts'
import { handoverFlagRows } from '../../test/tdd-runners-handover-flags.ts'
import {
	ADD_FILE,
	ADD_IMPLEMENTED_TEXT,
	ADD_MISSING_EXPORT_TEST_TEXT,
	ADD_ONE_AND_SKIP_TEST_TEXT,
	ADD_ONE_TEST_TEXT,
	ADD_OUTSIDE_TEST_TEXT,
	ADD_STUB_TEXT,
	ADD_SUBTRACTING_TEXT,
	ADD_TEST_FILE,
	ADD_TWO_TEST_TEXT,
	LOOP_TEST_FILE,
	LOOP_TEST_TEXT,
	NODE_PACKAGE_FILES,
	OTHER_ASSERTIONS_TEST_TEXT,
	SKIPS_ONLY_TEST_FILE,
	SKIPS_ONLY_TEST_TEXT,
	SLOW_TEST_TEXT,
	TDD_RUNNERS_SCENARIO_TIMEOUT,
	THROWING_DESCRIBE_TEST_TEXT,
} from '../../test/tdd-runners-node-workspace.constants.ts'
import { createNodePackage } from '../../test/tdd-runners-node-workspace.ts'
import {
	PROGRESS_SCENARIO_TIMEOUT,
	SUM_FILE,
	SUM_IMPLEMENTED_TEXT,
	THROWING_VITEST_CONFIG_TEXT,
} from '../../test/tdd-runners-progress-workspace.constants.ts'
import {
	createMixedPackage,
	recordingLiveOutput,
	withoutDurations,
	writeText,
} from '../../test/tdd-runners-progress-workspace.ts'
import {
	ADDER_FILE,
	ADDER_IMPLEMENTED_TEXT,
	ADDER_LIMITED_TEXT,
	ADDER_STUB_TEXT,
	ADDER_SUBTRACTING_TEXT,
	ADD_MISSING_EXPORT_PYTEST_TEXT,
	ADD_ONE_PYTEST_TEXT,
	ADD_OUTSIDE_PYTEST_TEXT,
	ADD_PYTEST_FILE,
	ADD_RAISES_TEST_TEXT,
	CONFTEST_FILE,
	CONFTEST_TEXT,
	FIRST_AND_STAY_TEST_TEXT,
	FIRST_TEST_FILE,
	FIXTURE_EDITED_TEXT,
	FIXTURE_FILE,
	FIXTURE_MODULE_FILE,
	FIXTURE_MODULE_TEXT,
	FIXTURE_TEXT,
	HELPERS_EDITED_TEXT,
	HELPERS_FILE,
	HELPERS_TEXT,
	IDS_TEST_FILE,
	IDS_TEST_TEXT,
	IGNORED_TEST_FILE,
	IGNORING_CONFTEST_TEXT,
	IMPORTING_CONFTEST_TEXT,
	INDENTATION_ERROR_TEST_TEXT,
	NORECURSE_FIXTURES_TOML_TEXT,
	PYTEST_IGNORED_OUTSIDE_LINE,
	READS_TEST_FILE,
	READS_TEST_TEXT,
	ROWS_BASE_TEST_TEXT,
	ROWS_REWRITTEN_TEST_TEXT,
	ROWS_TEST_FILE,
	ROWS_THREE_TEST_TEXT,
	SAMPLE_TEST_FILE,
	SAMPLE_TEST_TEXT,
	SECOND_TEST_FILE,
	SETUP_ERROR_TEST_TEXT,
	SKIPS_ONLY_PYTEST_FILE,
	SKIPS_ONLY_PYTEST_TEXT,
	SLOW_ROWS_BASE_TEST_TEXT,
	SLOW_ROWS_THREE_TEST_TEXT,
	STAY_ONLY_TEST_TEXT,
	SUPPORT_FILE,
	SUPPORT_TEXT,
	SYNTAX_ERROR_TEST_TEXT,
	TOML_PYTEST_TEXT,
	TOOL_SCRIPT_FILE,
	TOOL_SCRIPT_TEXT,
	TRIVIAL_TEST_TEXT,
	WITHOUT_PYTEST_INTERPRETER_TEXT,
} from '../../test/tdd-runners-python-workspace.constants.ts'
import { createPythonPackage, installInterpreter } from '../../test/tdd-runners-python-workspace.ts'
import { TDD_LEGEND_TERMS } from '../lib/legend/legend.constants.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { hashProduction, hashTestCode, readLedger } from '../lib/tdd/tdd-files.ts'
import {
	BASE_LACKS_IGNORED_INPUT,
	BASE_RED_FOLDER_PREFIX,
	BASE_RED_OWNER_FILE,
	INSTALLED_EDITABLE,
	PASSES_ON_BASE_TOO,
	PROVES_NOTHING,
	RED_ON_BASE_FLAG,
} from '../lib/tdd/tdd.constants.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TddFreeze, TddReceipt } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-16T12:00:00.000Z')

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** The lines of an output that report a case or a file. */
function caseLines(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised) /.test(line))
}

/** The entries of the package's ledger, oldest first. */
function ledgerEntries(root: string) {
	const ledger = readLedger(root)
	if ('failure' in ledger) throw new Error(ledger.failure)
	return ledger.entries
}

/** The receipts of the ledger (its freezes left out), oldest first. */
function receiptsOf(root: string): TddReceipt[] {
	return ledgerEntries(root).filter((entry): entry is TddReceipt => entry.kind !== 'freeze')
}

/** The receipts of the ledger as `<kind> <name>`. */
function receiptLines(root: string): string[] {
	return receiptsOf(root).map((receipt) => `${receipt.kind} ${receipt.name}`)
}

/** The files frozen by the ledger's freeze entries. */
function frozenFiles(root: string): string[] {
	return ledgerEntries(root)
		.filter((entry): entry is TddFreeze => entry.kind === 'freeze')
		.flatMap((freeze) => Object.keys(freeze.files))
}

describe(
	'tdd over a package of node --test files',
	{ timeout: TDD_RUNNERS_SCENARIO_TIMEOUT },
	() => {
		it('a stub inside assert.equal → red with its receipt and freeze, then the production fix → green, the same entries as a vitest case with an empty project', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > one  not-implemented: not implemented: add',
			])
			const testHash = hashTestCode({ root, file: ADD_TEST_FILE })
			expect(ledgerEntries(root)).toEqual([
				{
					kind: 'red',
					file: ADD_TEST_FILE,
					name: 'add > one',
					project: '',
					testFileHash: testHash,
					caseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
					productionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
					message: 'not implemented: add',
					at: NOW.toISOString(),
				},
				{ kind: 'freeze', files: { [ADD_TEST_FILE]: testHash }, at: NOW.toISOString() },
			])

			const [redReceipt] = receiptsOf(root)
			writeFileSync(join(root, ADD_FILE), ADD_IMPLEMENTED_TEXT)
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(caseLines(green.output)).toEqual(['green    src/add.test.ts::add > one'])
			expect(receiptsOf(root).at(-1)).toEqual({
				kind: 'green',
				file: ADD_TEST_FILE,
				name: 'add > one',
				project: '',
				testFileHash: testHash,
				caseHash: redReceipt.caseHash,
				productionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				at: NOW.toISOString(),
			})
			expect(receiptsOf(root).at(-1)?.productionHash).not.toBe(redReceipt.productionHash)
			expect(receiptLines(root)).toEqual(['red add > one', 'green add > one'])
		})

		it('an existing wrong code failing assert.equal → red, kind assertion', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_SUBTRACTING_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > one  assertion: -1 == 3',
			])
		})

		it('two stub cases in one file, tdd red naming file::add > one → only that case ran and was recorded', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_TWO_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red', `${ADD_TEST_FILE}::add > one`] })

			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > one  not-implemented: not implemented: add',
			])
			expect(receiptLines(root)).toEqual(['red add > one'])
		})

		it('two cases made by one loop line, stubbed → two reds with their own names', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [LOOP_TEST_FILE]: LOOP_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				'red      src/loop.test.ts::row 1  not-implemented: not implemented: add',
				'red      src/loop.test.ts::row 2  not-implemented: not implemented: add',
			])
		})

		it('the stub thrown inside t.assert.equal and inside a named deepStrictEqual of node:assert/strict → both red, not-implemented', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: OTHER_ASSERTIONS_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > through the test context  not-implemented: not implemented: add',
				'red      src/add.test.ts::add > through a named binding  not-implemented: not implemented: add',
			])
		})

		it('one stub case and one it.skip → the case is red, the skip refuses nothing, the file is frozen, exit 0', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_ONE_AND_SKIP_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > one  not-implemented: not implemented: add',
			])
			expect(frozenFiles(root)).toEqual([ADD_TEST_FILE])
		})

		it('a nested node run, NODE_TEST_CONTEXT in the cli environment → the case is still red', async () => {
			vi.stubEnv('NODE_TEST_CONTEXT', 'child-v8')
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > one  not-implemented: not implemented: add',
			])
		})
	},
)

describe(
	'tdd red refuses a node file that proves nothing yet',
	{ timeout: TDD_RUNNERS_SCENARIO_TIMEOUT },
	() => {
		it('an import of an export the module lacks → refused: cannot list its cases, missing-export, nothing frozen', async () => {
			const root = createNodePackage({
				written: {
					[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
					[ADD_TEST_FILE]: ADD_MISSING_EXPORT_TEST_TEXT,
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}src\/add\.test\.ts {2}cannot list its cases: missing-export/,
				),
			])
			expect(frozenFiles(root)).toEqual([])
		})

		it('a describe whose callback throws → refused: cannot list its cases, never frozen with no case', async () => {
			const root = createNodePackage({
				written: { [ADD_TEST_FILE]: THROWING_DESCRIBE_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(/^refused {2}src\/add\.test\.ts {2}cannot list its cases/),
			])
			expect(frozenFiles(root)).toEqual([])
		})

		it('a case outliving its timeout → refused: timeout, not a red', async () => {
			const root = createNodePackage({ written: { [ADD_TEST_FILE]: SLOW_TEST_TEXT } })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}src\/add\.test\.ts::add > slow {2}timeout \(not a red\): Test timed out in 10ms/,
				),
			])
		})

		it('the stub called in a const before assert.equal → refused: not-implemented-outside-assertion', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_OUTSIDE_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				'refused  src/add.test.ts::add > one  not-implemented-outside-assertion (not a red): not implemented: add',
			])
		})

		it('a file of it.skip cases only → refused: every case is skipped, nothing frozen', async () => {
			const root = createNodePackage({
				written: { [SKIPS_ONLY_TEST_FILE]: SKIPS_ONLY_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				`refused  ${SKIPS_ONLY_TEST_FILE}  ${ALL_SKIPPED_REFUSAL}`,
			])
			expect(frozenFiles(root)).toEqual([])
		})
	},
)

describe(
	'the tdd state of a changed node test file',
	{ timeout: TDD_RUNNERS_SCENARIO_TIMEOUT },
	() => {
		it('tdd status on a new node file with no receipt → its cases listed, missing receipt', async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_TWO_TEST_TEXT },
			})

			const status = await tdd({ cwd: root, argv: ['status', '--json'] })

			expect(status.exitCode).toBe(0)
			expect(JSON.parse(status.output)).toMatchObject({
				cases: [
					{ file: ADD_TEST_FILE, name: 'add > one', project: '', status: 'missing receipt' },
					{ file: ADD_TEST_FILE, name: 'add > two', project: '', status: 'missing receipt' },
				],
			})
		})

		it("the gate's tdd step on a new node file with no receipt → failed, its cases judged and listed", async () => {
			const root = createNodePackage({
				written: { [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT },
			})

			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'failed',
				cases: [{ label: 'src/add.test.ts::add > one', status: 'missing receipt' }],
			})
		})

		it("the gate's tdd step in a package without vitest, its only node:test file deleted → run, not skipped: the deleted file shown", async () => {
			const root = createNodePackage({
				committed: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT },
			})
			rmSync(join(root, ADD_TEST_FILE))

			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'passed',
				details: expect.arrayContaining([
					`deleted  ${ADD_TEST_FILE}  the test file of the base is deleted`,
				]),
			})
		})
	},
)

/** The files red froze, sorted: the order a run lists them in is not the behaviour. */
function sortedFrozenFiles(root: string): string[] {
	return [...frozenFiles(root)].sort()
}

describe('tdd over a package of pytest files', { timeout: TDD_RUNNERS_SCENARIO_TIMEOUT }, () => {
	it('a stub raising NotImplementedError inside an assert → red with its receipt, then the production fix → green', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(/^red {6}tests\/test_add\.py::test_one {2}not-implemented/),
		])
		expect(receiptLines(root)).toEqual(['red test_one'])

		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green.exitCode).toBe(0)
		expect(caseLines(green.output)).toEqual(['green    tests/test_add.py::test_one'])
		expect(receiptLines(root)).toEqual(['red test_one', 'green test_one'])
	})

	it('an existing wrong code failing the assert → red, kind assertion', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_SUBTRACTING_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(/^red {6}tests\/test_add\.py::test_one {2}assertion/),
		])
	})

	it('pytest.raises around a call that does not raise → red, kind assertion', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_IMPLEMENTED_TEXT, [ADD_PYTEST_FILE]: ADD_RAISES_TEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(
				/^red {6}tests\/test_add\.py::test_rejects_negative {2}assertion: DID NOT RAISE/,
			),
		])
	})

	it("a stubbed file a conftest's collect_ignore names, beside a stubbed case → that file outside, neither refused nor frozen; the other case red", async () => {
		const root = createPythonPackage({
			written: {
				[ADDER_FILE]: ADDER_STUB_TEXT,
				[CONFTEST_FILE]: IGNORING_CONFTEST_TEXT,
				[ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT,
				[IGNORED_TEST_FILE]: ADD_ONE_PYTEST_TEXT,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect({
			exitCode: red.exitCode,
			outside: red.output.split('\n').filter((line) => line.startsWith('outside')),
			receipts: receiptLines(root),
			frozen: sortedFrozenFiles(root),
		}).toEqual({
			exitCode: 0,
			outside: [`outside  ${IGNORED_TEST_FILE}  ${PYTEST_IGNORED_OUTSIDE_LINE}`],
			receipts: ['red test_one'],
			frozen: [CONFTEST_FILE, ADD_PYTEST_FILE],
		})
	})

	it('a case reading a data file, importing a helper, under a conftest, over a production module → red freezes the test file, the conftest, the helper and the data file, never the production module', async () => {
		const root = createPythonPackage({
			written: {
				[ADDER_FILE]: ADDER_STUB_TEXT,
				[CONFTEST_FILE]: CONFTEST_TEXT,
				[HELPERS_FILE]: HELPERS_TEXT,
				[FIXTURE_FILE]: FIXTURE_TEXT,
				[READS_TEST_FILE]: READS_TEST_TEXT,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(
				/^red {6}tests\/test_reads\.py::test_reads_everything {2}not-implemented/,
			),
		])
		expect(sortedFrozenFiles(root)).toEqual(
			[CONFTEST_FILE, FIXTURE_FILE, HELPERS_FILE, READS_TEST_FILE].sort(),
		)
	})

	it('a case using a fixture of a conftest that imports a support module → red freezes the support module beside the conftest and the test file', async () => {
		const root = createPythonPackage({
			written: {
				[ADDER_FILE]: ADDER_STUB_TEXT,
				[CONFTEST_FILE]: IMPORTING_CONFTEST_TEXT,
				[SUPPORT_FILE]: SUPPORT_TEXT,
				[SAMPLE_TEST_FILE]: SAMPLE_TEST_TEXT,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(/^red {6}tests\/test_sample\.py::test_uses_sample {2}not-implemented/),
		])
		expect(sortedFrozenFiles(root)).toEqual([CONFTEST_FILE, SAMPLE_TEST_FILE, SUPPORT_FILE].sort())
	})

	it('the stub raised inside the body of with pytest.raises(ValueError) → red, not-implemented', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_RAISES_TEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(
				/^red {6}tests\/test_add\.py::test_rejects_negative {2}not-implemented: NotImplementedError$/,
			),
		])
	})

	it('the data file edited after red → tdd green refuses naming it, and records no green', async () => {
		const root = createPythonPackage({
			written: {
				[ADDER_FILE]: ADDER_STUB_TEXT,
				[CONFTEST_FILE]: CONFTEST_TEXT,
				[HELPERS_FILE]: HELPERS_TEXT,
				[FIXTURE_FILE]: FIXTURE_TEXT,
				[READS_TEST_FILE]: READS_TEST_TEXT,
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, ADDER_FILE), ADDER_IMPLEMENTED_TEXT)
		writeFileSync(join(root, FIXTURE_FILE), FIXTURE_EDITED_TEXT)

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			`tdd green: test code changed since the last red run: ${FIXTURE_FILE}`,
		)
		expect(receiptLines(root)).toEqual(['red test_reads_everything'])
	})

	it('a class holding a parametrized method of two rows, stubbed → two reds named TestRows > test_row[1] and TestRows > test_row[2]', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ROWS_TEST_FILE]: ROWS_BASE_TEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(
				/^red {6}tests\/test_rows\.py::TestRows > test_row\[1\] {2}not-implemented/,
			),
			expect.stringMatching(
				/^red {6}tests\/test_rows\.py::TestRows > test_row\[2\] {2}not-implemented/,
			),
		])
	})

	it('the same table, tdd red naming file::TestRows > test_row[2] → only that row ran and was recorded', async () => {
		const root = createPythonPackage({
			written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ROWS_TEST_FILE]: ROWS_BASE_TEST_TEXT },
		})

		const red = await tdd({
			cwd: root,
			argv: ['red', `${ROWS_TEST_FILE}::TestRows > test_row[2]`],
		})

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(
				/^red {6}tests\/test_rows\.py::TestRows > test_row\[2\] {2}not-implemented/,
			),
		])
		expect(receiptLines(root)).toEqual(['red TestRows > test_row[2]'])
	})

	it('a row added to a table the base holds → only the new row is judged a change: the two others are unchanged, the new one red', async () => {
		const root = createPythonPackage({
			committed: { [ADDER_FILE]: ADDER_LIMITED_TEXT, [ROWS_TEST_FILE]: ROWS_BASE_TEST_TEXT },
			written: { [ROWS_TEST_FILE]: ROWS_THREE_TEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(/^unchanged +tests\/test_rows\.py::TestRows > test_row\[1\] *$/),
			expect.stringMatching(/^unchanged +tests\/test_rows\.py::TestRows > test_row\[2\] *$/),
			expect.stringMatching(
				/^red {6}tests\/test_rows\.py::TestRows > test_row\[3\] {2}not-implemented/,
			),
		])
	})

	it('a row added to a table under a slow mark the base holds → the two old rows unchanged, the new one red', async () => {
		const root = createPythonPackage({
			committed: { [ADDER_FILE]: ADDER_LIMITED_TEXT, [ROWS_TEST_FILE]: SLOW_ROWS_BASE_TEST_TEXT },
			written: { [ROWS_TEST_FILE]: SLOW_ROWS_THREE_TEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(/^unchanged +tests\/test_rows\.py::TestRows > test_row\[1\] *$/),
			expect.stringMatching(/^unchanged +tests\/test_rows\.py::TestRows > test_row\[2\] *$/),
			expect.stringMatching(
				/^red {6}tests\/test_rows\.py::TestRows > test_row\[3\] {2}not-implemented/,
			),
		])
	})

	it('the body of a parametrized test rewritten and still passing → every row is a change that proves nothing, both refused', async () => {
		const root = createPythonPackage({
			committed: { [ADDER_FILE]: ADDER_LIMITED_TEXT, [ROWS_TEST_FILE]: ROWS_BASE_TEST_TEXT },
			written: { [ROWS_TEST_FILE]: ROWS_REWRITTEN_TEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(caseLines(red.output)).toEqual([
			`refused  tests/test_rows.py::TestRows > test_row[1]  ${PROVES_NOTHING}`,
			`refused  tests/test_rows.py::TestRows > test_row[2]  ${PROVES_NOTHING}`,
		])
	})

	it('a case moved to another file, its call unchanged → a new case that proves nothing, refused; the case left in the first file is unchanged', async () => {
		const root = createPythonPackage({
			committed: {
				[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
				[FIRST_TEST_FILE]: FIRST_AND_STAY_TEST_TEXT,
			},
			written: { [FIRST_TEST_FILE]: STAY_ONLY_TEST_TEXT, [SECOND_TEST_FILE]: ADD_ONE_PYTEST_TEXT },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(/^unchanged +tests\/test_first\.py::test_stay *$/),
			`refused  tests/test_second.py::test_one  ${PROVES_NOTHING}`,
		])
	})

	it('a node:test file and a pytest file in one package, each stubbed → both red in one run, one receipt each', async () => {
		const root = createPythonPackage({
			committed: NODE_PACKAGE_FILES,
			written: {
				[ADD_FILE]: ADD_STUB_TEXT,
				[ADD_TEST_FILE]: ADD_ONE_TEST_TEXT,
				[ADDER_FILE]: ADDER_STUB_TEXT,
				[ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			'red      src/add.test.ts::add > one  not-implemented: not implemented: add',
			expect.stringMatching(/^red {6}tests\/test_add\.py::test_one {2}not-implemented/),
		])
		expect(receiptLines(root)).toEqual(['red add > one', 'red test_one'])
	})
})

describe(
	'tdd red refuses a pytest file that proves nothing yet',
	{ timeout: TDD_RUNNERS_SCENARIO_TIMEOUT },
	() => {
		it('the stub called before the assert → refused: not-implemented-outside-assertion', async () => {
			const root = createPythonPackage({
				written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_OUTSIDE_PYTEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}tests\/test_add\.py::test_one {2}not-implemented-outside-assertion \(not a red\)/,
				),
			])
		})

		it('an import of a name the module lacks → refused: cannot list its cases, missing-export, nothing frozen', async () => {
			const root = createPythonPackage({
				written: {
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: ADD_MISSING_EXPORT_PYTEST_TEXT,
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}tests\/test_add\.py {2}cannot list its cases: missing-export/,
				),
			])
			expect(frozenFiles(root)).toEqual([])
		})

		it('a syntax error in the test file → refused: cannot list its cases, syntax-error, nothing frozen', async () => {
			const root = createPythonPackage({ written: { [ADD_PYTEST_FILE]: SYNTAX_ERROR_TEST_TEXT } })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}tests\/test_add\.py {2}cannot list its cases: syntax-error/,
				),
			])
			expect(frozenFiles(root)).toEqual([])
		})

		it('an unexpected indent in the test file → refused: cannot list its cases, syntax-error', async () => {
			const root = createPythonPackage({
				written: { [ADD_PYTEST_FILE]: INDENTATION_ERROR_TEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}tests\/test_add\.py {2}cannot list its cases: syntax-error/,
				),
			])
		})

		it('a fixture raising at setup → refused: error, not a red', async () => {
			const root = createPythonPackage({ written: { [ADD_PYTEST_FILE]: SETUP_ERROR_TEST_TEXT } })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}tests\/test_add\.py::test_uses_broken {2}error \(not a red\): .*boom/,
				),
			])
		})

		it('a file of a skip and a skipif(True) only → refused: every case is skipped, nothing frozen', async () => {
			const root = createPythonPackage({
				written: { [SKIPS_ONLY_PYTEST_FILE]: SKIPS_ONLY_PYTEST_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				`refused  ${SKIPS_ONLY_PYTEST_FILE}  ${ALL_SKIPPED_REFUSAL}`,
			])
			expect(frozenFiles(root)).toEqual([])
		})

		it('a parameter id holding > → refused by its name with a reason naming the node id, nothing recorded as a red', async () => {
			const root = createPythonPackage({ written: { [IDS_TEST_FILE]: IDS_TEST_TEXT } })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(/^refused {2}tests\/test_ids\.py::test_id\[a > b\] {2}.*node id/),
			])
			expect(receiptLines(root)).not.toContain('red test_id[a > b]')
		})

		it('a python with no pytest for the pytest folder → exit 1 naming the folder, nothing recorded', async () => {
			const root = createPythonPackage({
				committed: { 'python/pyproject.toml': TOML_PYTEST_TEXT },
				written: { 'python/tests/test_a.py': TRIVIAL_TEST_TEXT },
			})
			installInterpreter({ root, folder: 'python', script: WITHOUT_PYTEST_INTERPRETER_TEXT })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(red.output).toContain('tdd red: pytest is not installed for python/')
			expect(ledgerEntries(root)).toEqual([])
		})
	},
)

describe(
	'the tdd state of a changed pytest test file',
	{ timeout: TDD_RUNNERS_SCENARIO_TIMEOUT },
	() => {
		it('tdd status on a new file of a two-row table with no receipt → each row listed as a case, missing receipt', async () => {
			const root = createPythonPackage({
				written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ROWS_TEST_FILE]: ROWS_BASE_TEST_TEXT },
			})

			const status = await tdd({ cwd: root, argv: ['status', '--json'] })

			expect(status.exitCode).toBe(0)
			expect(JSON.parse(status.output)).toMatchObject({
				cases: [
					{
						file: ROWS_TEST_FILE,
						name: 'TestRows > test_row[1]',
						project: '',
						status: 'missing receipt',
					},
					{
						file: ROWS_TEST_FILE,
						name: 'TestRows > test_row[2]',
						project: '',
						status: 'missing receipt',
					},
				],
			})
		})

		it("the gate's tdd step on a new pytest file with no receipt → failed, its case judged and listed", async () => {
			const root = createPythonPackage({
				written: { [ADDER_FILE]: ADDER_STUB_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
			})

			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'failed',
				cases: [{ label: 'tests/test_add.py::test_one', status: 'missing receipt' }],
			})
		})

		it("the gate's tdd step in a package without vitest, only a helper of its pytest files edited → run, not skipped: failed naming the helper changed outside tdd red", async () => {
			const root = createPythonPackage({
				committed: {
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[CONFTEST_FILE]: CONFTEST_TEXT,
					[HELPERS_FILE]: HELPERS_TEXT,
					[FIXTURE_FILE]: FIXTURE_TEXT,
					[READS_TEST_FILE]: READS_TEST_TEXT,
				},
				written: { [HELPERS_FILE]: HELPERS_EDITED_TEXT },
			})

			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'failed',
				reason: `test code changed outside tdd red: ${HELPERS_FILE}`,
			})
		})

		it("the gate's tdd step in a package without vitest, norecursedirs = fixtures, only tests/fixtures/test_x.py written → no pytest test file, no case of it listed: failed naming it as test code changed outside tdd red", async () => {
			const root = createPythonPackage({
				committed: {
					'pyproject.toml': NORECURSE_FIXTURES_TOML_TEXT,
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT,
				},
				written: { [FIXTURE_MODULE_FILE]: FIXTURE_MODULE_TEXT },
			})

			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'failed',
				reason: `test code changed outside tdd red: ${FIXTURE_MODULE_FILE}`,
				cases: [],
			})
		})

		it("the gate's tdd step in a package without vitest, testpaths = tests, only scripts/test_tool.py written → no pytest test file, no test code: skipped", async () => {
			const root = createPythonPackage({
				committed: { [ADDER_FILE]: ADDER_IMPLEMENTED_TEXT, [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
				written: { [TOOL_SCRIPT_FILE]: TOOL_SCRIPT_TEXT },
			})

			await expect(checkTddReceipts({ root, packageJson: readPackageJson(root) })).resolves.toEqual(
				{ status: 'skipped', reason: 'the package does not test with vitest' },
			)
		})

		it("the gate's tdd step on a pytest file of skips only → failed, the file refused: every case is skipped, the skip marks read from a collect", async () => {
			const root = createPythonPackage({
				written: { [SKIPS_ONLY_PYTEST_FILE]: SKIPS_ONLY_PYTEST_TEXT },
			})

			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'failed',
				lines: expect.arrayContaining([
					`refused  ${SKIPS_ONLY_PYTEST_FILE}  ${ALL_SKIPPED_REFUSAL}`,
				]),
			})
		})
	},
)

describe(
	'tdd red and tdd green announce one progress step per runner',
	{ timeout: PROGRESS_SCENARIO_TIMEOUT },
	() => {
		it('a package of one vitest file, one node:test file and one pytest file, tdd red → one step per runner in the order vitest, node --test, pytest, each announced before its run and finished by its own line', async () => {
			const root = createMixedPackage({ vitest: true, node: true, pytest: true })
			const { live, lines } = recordingLiveOutput()

			const red = await runTdd({ cwd: root, argv: ['red'], now: () => NOW, live })

			expect(red.exitCode).toBe(0)
			expect(withoutDurations(lines)).toEqual([
				'▶ tdd red: vitest - 1 test file(s)',
				'✓ tdd red: vitest ran 1 test file(s)',
				'▶ tdd red: node --test - 1 test file(s)',
				'✓ tdd red: node --test ran 1 test file(s)',
				'▶ tdd red: pytest - 1 test file(s)',
				'✓ tdd red: pytest ran 1 test file(s)',
			])
			expect(lines.filter((line) => line.startsWith('✓'))).toEqual([
				expect.stringMatching(/^✓ tdd red: vitest ran 1 test file\(s\) {2}\d/u),
				expect.stringMatching(/^✓ tdd red: node --test ran 1 test file\(s\) {2}\d/u),
				expect.stringMatching(/^✓ tdd red: pytest ran 1 test file\(s\) {2}\d/u),
			])
		})

		it('a package of one vitest file only, tdd red → the one vitest step, announced then finished by its line', async () => {
			const root = createMixedPackage({ vitest: true, node: false, pytest: false })
			const { live, lines } = recordingLiveOutput()

			const red = await runTdd({ cwd: root, argv: ['red'], now: () => NOW, live })

			expect(red.exitCode).toBe(0)
			expect(withoutDurations(lines)).toEqual([
				'▶ tdd red: vitest - 1 test file(s)',
				'✓ tdd red: vitest ran 1 test file(s)',
			])
		})

		it('a package of a vitest file, a node:test file and a pytest file, the vitest run answering a failure, tdd red → the vitest line starts with ✗ and the node --test and pytest steps announce nothing', async () => {
			const root = createMixedPackage({
				vitest: true,
				node: true,
				pytest: true,
				extra: { 'vitest.config.ts': THROWING_VITEST_CONFIG_TEXT },
			})
			const { live, lines } = recordingLiveOutput()

			const red = await runTdd({ cwd: root, argv: ['red'], now: () => NOW, live })

			expect(red.exitCode).toBe(1)
			expect(withoutDurations(lines)).toEqual([
				'▶ tdd red: vitest - 1 test file(s)',
				'✗ tdd red: vitest ran 1 test file(s)',
			])
		})

		it('a package of one vitest file, one node:test file and one pytest file, all red then implemented, tdd green → the same three steps named green, in the same order', async () => {
			const root = createMixedPackage({ vitest: true, node: true, pytest: true })
			await runTdd({ cwd: root, argv: ['red'], now: () => NOW })
			writeText({ root, file: SUM_FILE, text: SUM_IMPLEMENTED_TEXT })
			writeText({ root, file: ADD_FILE, text: ADD_IMPLEMENTED_TEXT })
			writeText({ root, file: ADDER_FILE, text: ADDER_IMPLEMENTED_TEXT })
			const { live, lines } = recordingLiveOutput()

			const green = await runTdd({ cwd: root, argv: ['green'], now: () => NOW, live })

			expect(green.exitCode).toBe(0)
			expect(withoutDurations(lines)).toEqual([
				'▶ tdd green: vitest - 1 test file(s)',
				'✓ tdd green: vitest ran 1 test file(s)',
				'▶ tdd green: node --test - 1 test file(s)',
				'✓ tdd green: node --test ran 1 test file(s)',
				'▶ tdd green: pytest - 1 test file(s)',
				'✓ tdd green: pytest ran 1 test file(s)',
			])
		})
	},
)

describe('the red on base flag in the hand-over card and its legend', () => {
	it(
		'a ledger holding red on base, test code changed around it, rollback and an unknown flag → the card counts them in the flag order: rollback, red after green, test code changed around it, red on base, then the unknown one',
		{ timeout: FLAG_CARD_CASE_TIMEOUT },
		() => {
			expect(
				handoverFlagRows({
					flags: [
						'an unknown flag',
						RED_ON_BASE_FLAG,
						'test code changed around it',
						'red after green',
						'rollback',
					],
				}),
			).toEqual([
				'1 flag: rollback',
				'1 flag: red after green',
				'1 flag: test code changed around it',
				`1 flag: ${RED_ON_BASE_FLAG}`,
				'1 flag: an unknown flag',
			])
		},
	)

	it('the tdd legend → a red on base term with a meaning and a look line', () => {
		const term = TDD_LEGEND_TERMS.find((entry) => entry.term === RED_ON_BASE_FLAG)

		expect(term).toEqual({
			term: RED_ON_BASE_FLAG,
			meaning: expect.stringMatching(/\S/),
			look: expect.stringMatching(/^look/),
		})
	})
})

/** The package's production hash with only the base's files in it: what a base run's receipt holds. */
function baseProductionHash(params: {
	runner: 'vitest' | 'node' | 'pytest'
	committed: Record<string, string>
}) {
	const root = createBaseRedPackage({ runner: params.runner, committed: params.committed })
	return hashProduction({ root, packageJson: readPackageJson(root) })
}

describe(
	'tdd red runs a revised case on the base when it passes now',
	{ timeout: BASE_RED_SCENARIO_TIMEOUT },
	() => {
		/** A base holding the wrong production only: a case of a test file the lot adds is not of the base. */
		const WRONG_PRODUCTION_BASE = { [ADD_FILE]: ADD_SUBTRACTING_TEXT }
		const RED_ON_BASE_LINE = new RegExp(
			`^red {6}${ADD_CASE.replaceAll('/', '\\/')} {2}(assertion|not-implemented): .+ {2}flags: ${RED_ON_BASE_FLAG}$`,
		)

		it('a vitest case revised, not of the base, passing now, failing on the base production → a red receipt flagged red on base at the production hash of the base, its file frozen; green then counts it proven for the gate', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: WRONG_PRODUCTION_BASE,
				written: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT, [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([expect.stringMatching(RED_ON_BASE_LINE)])
			expect(receiptsOf(root)).toEqual([
				expect.objectContaining({
					kind: 'red',
					file: ADD_TEST_FILE,
					name: 'add > one',
					flags: [RED_ON_BASE_FLAG],
					productionHash: baseProductionHash({
						runner: 'vitest',
						committed: WRONG_PRODUCTION_BASE,
					}),
					testFileHash: hashTestCode({ root, file: ADD_TEST_FILE }),
				}),
			])
			expect(frozenFiles(root)).toEqual([ADD_TEST_FILE])
			await expect(tdd({ cwd: root, argv: ['status'] })).resolves.toMatchObject({
				output: `red  ${ADD_CASE}  flags: ${RED_ON_BASE_FLAG}`,
			})

			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(caseLines(green.output)).toEqual([`green    ${ADD_CASE}`])
			expect(receiptLines(root)).toEqual(['red add > one', 'green add > one'])
			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'passed',
				cases: [{ label: ADD_CASE, status: 'green' }],
			})
		})

		it('a vitest case revised, not of the base, that passes on the base production too → refused: the revision proves nothing, no receipt, nothing frozen', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT },
				written: { [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([`refused  ${ADD_CASE}  ${PASSES_ON_BASE_TOO}`])
			expect(receiptLines(root)).toEqual(['refused add > one'])
			expect(receiptsOf(root).map((receipt) => receipt.kind)).not.toContain('red')
			expect(frozenFiles(root)).toEqual([])
		})

		it('a new vitest case passing now, no revised entry → refused as it ran green, and the base is never run', async () => {
			const log = join(temporaryFolder('dialecte-loads-log-'), 'loads.log')
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: { [ADD_FILE]: ADD_SUBTRACTING_TEXT },
				written: {
					[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
					[ADD_TEST_FILE]: loggingVitestTestText({ log, expected: 3 }),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([`refused  ${ADD_CASE}  ${PROVES_NOTHING}`])
			expect(readFileSync(log, 'utf8')).toBe('loaded\n')
		})

		it('a vitest case red on a stub, its test corrected before review and passing now, declared revised → a second red flagged red on base at the production hash of the base; green then counts it proven for the gate', async () => {
			const committed = { [ADD_FILE]: ADD_STUB_TEXT }
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed,
				written: { [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
				revised: [ADD_CASE],
			})
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, ADD_FILE), ADD_IMPLEMENTED_TEXT)
			writeFileSync(join(root, ADD_TEST_FILE), VITEST_CORRECTED_TEST_TEXT)

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([expect.stringMatching(RED_ON_BASE_LINE)])
			expect(receiptsOf(root).at(-1)).toMatchObject({
				kind: 'red',
				flags: [RED_ON_BASE_FLAG],
				productionHash: baseProductionHash({ runner: 'vitest', committed }),
				testFileHash: hashTestCode({ root, file: ADD_TEST_FILE }),
			})

			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(receiptLines(root)).toEqual(['red add > one', 'red add > one', 'green add > one'])
			await expect(
				checkTddReceipts({ root, packageJson: readPackageJson(root) }),
			).resolves.toMatchObject({
				status: 'passed',
				cases: [{ label: ADD_CASE, status: 'green' }],
			})
		})

		it('a vitest case revised that the base holds, passing now → recorded revised at once, and the base is never run', async () => {
			const log = join(temporaryFolder('dialecte-loads-log-'), 'loads.log')
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: {
					...WRONG_PRODUCTION_BASE,
					[ADD_TEST_FILE]: loggingVitestTestText({ log, expected: -1 }),
				},
				written: {
					[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
					[ADD_TEST_FILE]: loggingVitestTestText({ log, expected: 3 }),
				},
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([`revised  ${ADD_CASE}  ${REVISION_REASON}`])
			expect(receiptLines(root)).toEqual(['revised add > one'])
			expect(readFileSync(log, 'utf8')).toBe('loaded\n')
		})

		it('a revised file entry naming the test file, its case passing now and failing on the base production → red on base', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: WRONG_PRODUCTION_BASE,
				written: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT, [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
				revised: [ADD_TEST_FILE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([expect.stringMatching(RED_ON_BASE_LINE)])
			expect(receiptsOf(root)).toEqual([
				expect.objectContaining({ kind: 'red', name: 'add > one', flags: [RED_ON_BASE_FLAG] }),
			])
		})

		it("a revised case whose test imports an export the base lacks → refused with the base run's kind (missing-export), no receipt, nothing frozen", async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: WRONG_PRODUCTION_BASE,
				written: {
					[ADD_FILE]: ADD_AND_MULTIPLY_TEXT,
					[ADD_TEST_FILE]: VITEST_NEW_EXPORT_TEST_TEXT,
				},
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					new RegExp(`^refused {2}${ADD_CASE.replaceAll('/', '\\/')} {2}.*missing-export`),
				),
			])
			expect(receiptLines(root)).toEqual(['refused add > one'])
			expect(receiptsOf(root).map((receipt) => receipt.kind)).not.toContain('red')
			expect(frozenFiles(root)).toEqual([])
		})

		it('a file of two cases, the revised one passing on the base production and the other failing there → the revised one refused: passes on the base too (the base run is filtered to its case)', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: WRONG_PRODUCTION_BASE,
				written: {
					[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
					[ADD_TEST_FILE]: VITEST_TWO_CASES_TEST_TEXT,
				},
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				`refused  ${ADD_CASE}  ${PASSES_ON_BASE_TOO}`,
				`refused  ${ADD_SECOND_CASE}  ${PROVES_NOTHING}`,
			])
			expect(receiptLines(root)).toEqual(['refused add > one', 'refused add > two'])
			expect(receiptsOf(root).map((receipt) => receipt.kind)).not.toContain('red')
		})

		it('a node:test case revised, not of the base, passing now, failing on the base production → a red flagged red on base, then green', async () => {
			const committed = WRONG_PRODUCTION_BASE
			const root = createBaseRedPackage({
				runner: 'node',
				committed,
				written: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT, [ADD_TEST_FILE]: NODE_REVISED_TEST_TEXT },
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([expect.stringMatching(RED_ON_BASE_LINE)])
			expect(receiptsOf(root)[0]).toMatchObject({
				kind: 'red',
				flags: [RED_ON_BASE_FLAG],
				productionHash: baseProductionHash({ runner: 'node', committed }),
			})
			expect(green.exitCode).toBe(0)
			expect(receiptLines(root)).toEqual(['red add > one', 'green add > one'])
		})

		it('a pytest case revised, not of the base, passing now, failing on the base production → a red flagged red on base, then green', async () => {
			const committed = { [ADDER_FILE]: ADDER_SUBTRACTING_TEXT }
			const root = createBaseRedPackage({
				runner: 'pytest',
				committed,
				written: {
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: PYTEST_REVISED_TEST_TEXT,
				},
				revised: [ADD_PYTEST_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					new RegExp(
						`^red {6}${ADD_PYTEST_CASE} {2}(assertion|not-implemented): .+ {2}flags: ${RED_ON_BASE_FLAG}$`,
					),
				),
			])
			expect(receiptsOf(root)[0]).toMatchObject({
				kind: 'red',
				flags: [RED_ON_BASE_FLAG],
				productionHash: baseProductionHash({ runner: 'pytest', committed }),
			})
			expect(green.exitCode).toBe(0)
			expect(receiptLines(root)).toEqual(['red test_one', 'green test_one'])
		})

		it("a base run of a revised case → the lot's tree untouched (git status and every entry's modification time as before) and no base run folder left in the temporary folder", async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: WRONG_PRODUCTION_BASE,
				written: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT, [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
				revised: [ADD_CASE],
			})
			const temporary = temporaryFolder('dialecte-isolated-tmp-')
			vi.stubEnv('TMPDIR', temporary)
			const before = snapshotTree(root)

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([expect.stringMatching(RED_ON_BASE_LINE)])
			expect(snapshotTree(root)).toEqual(before)
			expect(
				readdirSync(temporary).filter((name) => name.startsWith(BASE_RED_FOLDER_PREFIX)),
			).toEqual([])
		})

		it('a revised case whose test imports a helper the lot changed → the base run sees the current helper: red on base, not a pass on the old helper', async () => {
			const committed = { ...WRONG_PRODUCTION_BASE, [EXPECTED_FILE]: EXPECTED_BASE_TEXT }
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed,
				written: {
					[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
					[ADD_TEST_FILE]: VITEST_HELPER_TEST_TEXT,
					[EXPECTED_FILE]: EXPECTED_REVISED_TEXT,
				},
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([expect.stringMatching(RED_ON_BASE_LINE)])
			expect(sortedFrozenFiles(root)).toEqual([EXPECTED_FILE, ADD_TEST_FILE].sort())
		})

		it('a revised case that passes on the base production too → its refusal ends with the lot accept hint', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT },
				written: { [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(new RegExp(`^refused {2}${ADD_CASE.replaceAll('/', '\\/')} {2}`)),
			])
			expect(caseLines(red.output)[0]).toMatch(LOT_ACCEPT_HINT_PATTERN)
		})

		it('a revised case whose production reads an input git ignores, failing on the base copy that lacks it → refused: the base copy lacks a git-ignored input, no red receipt, nothing frozen', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: { '.gitignore': IGNORING_VALUES_GITIGNORE_TEXT, [TOTAL_FILE]: TOTAL_TEXT },
				written: {
					[IGNORED_VALUES_FILE]: IGNORED_VALUES_TEXT,
					[ADD_TEST_FILE]: VITEST_TOTAL_TEST_TEXT,
				},
				revised: [ADD_CASE],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([`refused  ${ADD_CASE}  ${BASE_LACKS_IGNORED_INPUT}`])
			expect(receiptsOf(root).map((receipt) => receipt.kind)).not.toContain('red')
			expect(frozenFiles(root)).toEqual([])
		})

		it("a pytest case revised, the lot's own .venv interpreter git-ignored → the base run runs with that interpreter, from the base copy", async () => {
			const log = join(temporaryFolder('dialecte-interpreter-log-'), 'folders.log')
			const root = createBaseRedPackage({
				runner: 'pytest',
				committed: { [ADDER_FILE]: ADDER_SUBTRACTING_TEXT },
				written: {
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: PYTEST_REVISED_TEST_TEXT,
				},
				revised: [ADD_PYTEST_CASE],
			})
			installInterpreter({ root, folder: '', script: folderLoggingInterpreter({ log }) })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(receiptsOf(root)[0]).toMatchObject({ kind: 'red', flags: [RED_ON_BASE_FLAG] })
			expect(
				readFileSync(log, 'utf8')
					.split('\n')
					.some((folder) => folder.includes(BASE_RED_FOLDER_PREFIX)),
			).toBe(true)
		})

		it("a pytest case revised, the lot's interpreter putting the lot's own folder first on the import path → the base run imports the base copy's production, never the lot's: red on base", async () => {
			const root = createBaseRedPackage({
				runner: 'pytest',
				committed: {
					'pyproject.toml': NO_PYTHONPATH_TOML_TEXT,
					[ADDER_FILE]: ADDER_SUBTRACTING_TEXT,
				},
				written: {
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: PYTEST_REVISED_TEST_TEXT,
				},
				revised: [ADD_PYTEST_CASE],
			})
			installInterpreter({ root, folder: '', script: LOT_FIRST_INTERPRETER_TEXT })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					new RegExp(`^red {6}${ADD_PYTEST_CASE} {2}assertion: .+ {2}flags: ${RED_ON_BASE_FLAG}$`),
				),
			])
			expect(receiptsOf(root)[0]).toMatchObject({ kind: 'red', flags: [RED_ON_BASE_FLAG] })
		})

		it("a pytest case revised, the package installed editable in the lot's interpreter → refused: a base run would import the lot's code, no red receipt", async () => {
			const root = createBaseRedPackage({
				runner: 'pytest',
				committed: {
					'pyproject.toml': NAMED_PROJECT_TOML_TEXT,
					[ADDER_FILE]: ADDER_SUBTRACTING_TEXT,
				},
				written: {
					...EDITABLE_DIST_FILES,
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: PYTEST_REVISED_TEST_TEXT,
				},
				revised: [ADD_PYTEST_CASE],
			})
			installInterpreter({ root, folder: '', script: EDITABLE_INTERPRETER_TEXT })

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					new RegExp(`^refused {2}${ADD_PYTEST_CASE} {2}.*${INSTALLED_EDITABLE}$`),
				),
			])
			expect(receiptsOf(root).map((receipt) => receipt.kind)).not.toContain('red')
		})

		it('base-run folders a killed run left, older than the running process → the next tdd run trashes those whose owner is gone, keeps the one a live process owns and any other folder', async () => {
			const root = createBaseRedPackage({
				runner: 'vitest',
				committed: { [ADD_FILE]: ADD_IMPLEMENTED_TEXT },
				written: { [ADD_TEST_FILE]: VITEST_REVISED_TEST_TEXT },
			})
			const temporary = temporaryFolder('dialecte-leftovers-tmp-')
			vi.stubEnv('TMPDIR', temporary)
			const gone = spawnSync('true').pid
			const past = new Date(Date.now() - LEFTOVER_AGE_MS)
			const leftovers = {
				[`${BASE_RED_FOLDER_PREFIX}gone`]: String(gone),
				[`${BASE_RED_FOLDER_PREFIX}live`]: String(process.pid),
				'another-tool-folder': String(gone),
			}
			for (const [name, pid] of Object.entries(leftovers)) {
				mkdirSync(join(temporary, name, 'tree'), { recursive: true })
				writeFileSync(join(temporary, name, BASE_RED_OWNER_FILE), pid)
				utimesSync(join(temporary, name), past, past)
			}

			await tdd({ cwd: root, argv: ['red'] })

			expect(readdirSync(temporary).sort()).toEqual(
				['another-tool-folder', `${BASE_RED_FOLDER_PREFIX}live`].sort(),
			)
		})
	},
)
