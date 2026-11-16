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
	OTHER_ASSERTIONS_TEST_TEXT,
	SKIPS_ONLY_TEST_FILE,
	SKIPS_ONLY_TEST_TEXT,
	SLOW_TEST_TEXT,
	TDD_RUNNERS_SCENARIO_TIMEOUT,
	THROWING_DESCRIBE_TEST_TEXT,
} from '../../test/tdd-runners-node-workspace.constants.ts'
import { createNodePackage } from '../../test/tdd-runners-node-workspace.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { hashTestCode, readLedger } from '../lib/tdd/tdd-files.ts'
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
