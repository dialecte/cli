/**
 * `tdd red`, `tdd green`, `tdd status` and the gate's tdd state over a package of `node --test` files: the cases of
 * a node file get the same receipts, freezes and refusals as a vitest one.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ALL_SKIPPED_REFUSAL } from '../../test/tdd-bugs-zero-cases.constants.ts'
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
	FIXTURE_TEXT,
	HELPERS_FILE,
	HELPERS_TEXT,
	IDS_TEST_FILE,
	IDS_TEST_TEXT,
	INDENTATION_ERROR_TEST_TEXT,
	READS_TEST_FILE,
	READS_TEST_TEXT,
	ROWS_BASE_TEST_TEXT,
	ROWS_REWRITTEN_TEST_TEXT,
	ROWS_TEST_FILE,
	ROWS_THREE_TEST_TEXT,
	SECOND_TEST_FILE,
	SETUP_ERROR_TEST_TEXT,
	SKIPS_ONLY_PYTEST_FILE,
	SKIPS_ONLY_PYTEST_TEXT,
	STAY_ONLY_TEST_TEXT,
	SYNTAX_ERROR_TEST_TEXT,
	TOML_PYTEST_TEXT,
	TRIVIAL_TEST_TEXT,
	WITHOUT_PYTEST_INTERPRETER_TEXT,
} from '../../test/tdd-runners-python-workspace.constants.ts'
import { createPythonPackage, installInterpreter } from '../../test/tdd-runners-python-workspace.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { hashTestCode, readLedger } from '../lib/tdd/tdd-files.ts'
import { PROVES_NOTHING } from '../lib/tdd/tdd.constants.ts'
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
