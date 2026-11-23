/**
 * `tdd green` runs every case of every touched test file, the test files moved with their bytes included, and refuses
 * every case that does not pass whatever its proof (red, unchanged, accepted, revised, the base's proof of a moved
 * file's case). A passing case whose proof is not one of the production now records its proof again.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHookIn } from '../../test/gate-hook.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { createNodePackage } from '../../test/tdd-runners-node-workspace.ts'
import {
	ADD_ONE_PYTEST_TEXT,
	ADD_PYTEST_FILE,
	ADDER_FILE,
	ADDER_IMPLEMENTED_TEXT,
} from '../../test/tdd-runners-python-workspace.constants.ts'
import { createPythonPackage } from '../../test/tdd-runners-python-workspace.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { caseLabel } from '../lib/tdd/select-cases.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TddLedger, TddReceipt } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-23T12:00:00.000Z')

const ADD = 'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const REFACTORED_ADD =
	'export function add(left: number, right: number): number {\n\treturn right + left\n}\n'
const BROKEN_ADD =
	'export function add(left: number, right: number): number {\n\treturn left - right\n}\n'
const SUB_STUB =
	"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n"
const SUB = 'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'

/** The environment variable that makes the base's case fail on an assertion, production untouched. */
const FAIL_VARIABLE = 'TDD_ALL_CASES_FAIL'
/** The environment variable that skips a `skipIf` case at run time. */
const SKIP_VARIABLE = 'TDD_ALL_CASES_SKIP'

/** The base's test file: one case, failing on its assertion when FAIL_VARIABLE is set. */
const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	`it('one plus two → three', () => { expect(process.env.${FAIL_VARIABLE} ? 0 : add(1, 2)).toBe(3) })`,
	'',
].join('\n')
const SUB_CASE_TEXT = "it('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })\n"
const ACCEPTED_CASE_TEXT = "it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })\n"
/** The base's test file with a red case of `sub` appended. */
const ADD_TEST_WITH_SUB = `${ADD_TEST}import { sub } from './sub.ts'\n${SUB_CASE_TEXT}`
/** A test file of its own holding the red case of `sub`. */
const SUB_TEST = `import { sub } from './sub.ts'\nimport { expect, it } from 'vitest'\n${SUB_CASE_TEXT}`

const BASE_CASE = 'src/add.test.ts::one plus two → three'
const SUB_CASE = 'src/add.test.ts::three minus one → two'
const ACCEPTED_CASE = 'src/add.test.ts::two plus two → four'
const MOVED_CASE = 'src/sum.test.ts::one plus two → three'
const SUB_FILE_CASE = 'src/sub.test.ts::three minus one → two'
const STILL_FAILS = /^still fails: assertion: expected -1 to be 3/

/** The package's committed base: `add` and its one case, with a hook step that always passes. */
function basePackage(files: Record<string, string> = {}): string {
	return createVitestPackage({
		dialecte: {
			gate: {
				fast: [{ name: 'check', run: 'true' }],
				hook: [{ name: 'check', run: 'true' }],
			},
		},
		files: { 'src/add.ts': ADD, 'src/add.test.ts': ADD_TEST, ...files },
	})
}

function tdd(params: { root: string; argv: string[] }) {
	return runTdd({ cwd: params.root, argv: params.argv, now: () => NOW })
}

/** A node:test file of `add`: a case, a todo case (`{ todo: true }`, reported pending), then `extra` in the suite. */
function nodeTestText(extra: string): string {
	return [
		"import assert from 'node:assert'",
		"import { describe, it } from 'node:test'",
		"import { add } from './add.ts'",
		"import { sub } from './sub.ts'",
		"describe('add', () => {",
		"\tit('one', () => {",
		'\t\tassert.equal(add(1, 2), 3)',
		'\t})',
		"\tit('later', { todo: true }, () => {",
		'\t\tassert.equal(add(1, 2), 4)',
		'\t})',
		extra,
		'})',
		'',
	].join('\n')
}

/** The lines of an output that report a case. */
function caseLines(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised) /.test(line))
}

/** The receipts of the case `label` in the worktree's ledger, in order. */
function receiptsOf(params: { root: string; label: string }): TddReceipt[] {
	const path = join(params.root, '.git', 'dialecte-tdd.json')
	if (!existsSync(path)) return []
	const ledger = JSON.parse(readFileSync(path, 'utf8')) as TddLedger
	return ledger.entries.filter(
		(entry): entry is TddReceipt => entry.kind !== 'freeze' && caseLabel(entry) === params.label,
	)
}

/** The kinds of the receipts of the case `label`, in order. */
function kindsOf(params: { root: string; label: string }): string[] {
	return receiptsOf(params).map((receipt) => receipt.kind)
}

/** The base's test file touched with a red case of `sub` (as `test` says), its stub written, `tdd red` taken. */
async function redOfSub(params: {
	root: string
	test?: string
	declaration?: unknown
}): Promise<void> {
	const { root } = params
	writeFiles({
		root,
		files: {
			'src/add.test.ts': params.test ?? ADD_TEST_WITH_SUB,
			'src/sub.ts': SUB_STUB,
			...(params.declaration !== undefined && {
				'.dialecte/lot.json': JSON.stringify(params.declaration),
			}),
		},
	})
	await tdd({ root, argv: ['red'] })
}

/** The base's test file moved with its bytes to `src/sum.test.ts`, a red case of `sub` in a file of its own. */
async function movedWithRedOfSub(root: string): Promise<void> {
	git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
	writeFiles({ root, files: { 'src/sub.test.ts': SUB_TEST, 'src/sub.ts': SUB_STUB } })
	await tdd({ root, argv: ['red'] })
}

afterEach(() => {
	vi.unstubAllEnvs()
})

describe(
	'tdd green: a failing case is refused whatever its proof',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it.each([
			{
				proof: 'unchanged',
				test: ADD_TEST_WITH_SUB,
				declaration: undefined,
				expected: [
					{ label: 'refused', id: BASE_CASE, detail: STILL_FAILS },
					{ label: 'green', id: SUB_CASE, detail: undefined },
				],
				summary: 'tdd green: 1 green, 0 unchanged, 1 refused',
			},
			{
				proof: 'revised, by a file-level entry',
				test: ADD_TEST_WITH_SUB.replace('.toBe(3) })', '.toBe(3); expect(add(0, 0)).toBe(0) })'),
				declaration: {
					revised: [{ case: 'src/add.test.ts', reason: 'the review asked for zero' }],
				},
				expected: [
					{ label: 'refused', id: BASE_CASE, detail: STILL_FAILS },
					{ label: 'green', id: SUB_CASE, detail: undefined },
				],
				summary: 'tdd green: 1 green, 0 unchanged, 1 refused',
			},
			{
				proof: 'accepted',
				test: `${ADD_TEST_WITH_SUB}${ACCEPTED_CASE_TEXT}`,
				declaration: { accept: [{ case: ACCEPTED_CASE, reason: 'add answers it already' }] },
				expected: [
					{ label: 'refused', id: BASE_CASE, detail: STILL_FAILS },
					{ label: 'green', id: SUB_CASE, detail: undefined },
					{
						label: 'refused',
						id: ACCEPTED_CASE,
						detail: /^still fails: assertion: expected \+?0 to be 4/,
					},
				],
				summary: 'tdd green: 1 green, 0 unchanged, 2 refused',
			},
		])(
			'a $proof case broken by a production change → refused, still fails; counted; exit non-zero',
			async ({ test, declaration, expected, summary }) => {
				const root = basePackage()
				await redOfSub({ root, test, declaration })
				writeFiles({ root, files: { 'src/sub.ts': SUB, 'src/add.ts': BROKEN_ADD } })

				const green = await tdd({ root, argv: ['green'] })

				expect({
					exitCode: green.exitCode,
					lines: caseLines(green.output).map((line) => {
						const [label, id, detail] = line.split(/ {2,}/)
						return { label, id, detail }
					}),
					summary: green.output.split('\n').find((line) => line.startsWith('tdd green: ')),
					refusedReceipts: expected
						.filter((line) => line.label === 'refused')
						.map((line) => kindsOf({ root, label: line.id }).at(-1)),
				}).toEqual({
					exitCode: 1,
					lines: expected.map(({ label, id, detail }) => ({
						label,
						id,
						detail: detail === undefined ? undefined : expect.stringMatching(detail),
					})),
					summary,
					refusedReceipts: expected.filter((line) => line.label === 'refused').map(() => 'refused'),
				})
			},
		)

		it('a test-only case edited after its red and failing → refused, frozen after red (the edit is told first)', async () => {
			const root = basePackage()
			await redOfSub({ root })
			writeFiles({
				root,
				files: {
					'src/add.test.ts': ADD_TEST_WITH_SUB.replace('.toBe(3) })', '.toBe(4) })'),
					'src/sub.ts': SUB,
				},
			})

			const green = await tdd({ root, argv: ['green'] })

			expect(caseLines(green.output)[0]).toBe(
				`refused  ${BASE_CASE}  tests are frozen after red; go back to the test station`,
			)
		})
	},
)

describe(
	'tdd green: a passing test-only case records its proof at the production now',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('an unchanged case passing after a production change → a new unchanged receipt at that production; a second green at it records nothing more', async () => {
			const root = basePackage()
			await redOfSub({ root })
			writeFiles({ root, files: { 'src/sub.ts': SUB } })

			const first = await tdd({ root, argv: ['green'] })
			const afterFirst = receiptsOf({ root, label: BASE_CASE })
			await tdd({ root, argv: ['green'] })

			expect({
				line: caseLines(first.output)[0],
				kinds: afterFirst.map((receipt) => receipt.kind),
				productions: new Set(afterFirst.map((receipt) => receipt.productionHash)).size,
				afterSecond: kindsOf({ root, label: BASE_CASE }),
			}).toEqual({
				line: `unchanged  ${BASE_CASE}`,
				kinds: ['unchanged', 'unchanged'],
				productions: 2,
				afterSecond: ['unchanged', 'unchanged'],
			})
		})

		it.each([
			{
				kind: 'accepted',
				test: `${ADD_TEST_WITH_SUB}${ACCEPTED_CASE_TEXT}`,
				declaration: { accept: [{ case: ACCEPTED_CASE, reason: 'add answers it already' }] },
				label: ACCEPTED_CASE,
			},
			{
				kind: 'revised',
				test: ADD_TEST_WITH_SUB.replace('.toBe(3) })', '.toBe(3); expect(add(0, 0)).toBe(0) })'),
				declaration: { revised: [{ case: BASE_CASE, reason: 'the review asked for zero' }] },
				label: BASE_CASE,
			},
		])(
			'an $kind case passing after a production change → recorded $kind again; its entry dropped, the read rule skips both',
			async ({ kind, test, declaration, label }) => {
				const root = basePackage()
				await redOfSub({ root, test, declaration })
				writeFiles({ root, files: { 'src/sub.ts': SUB } })

				await tdd({ root, argv: ['green'] })
				const receipts = receiptsOf({ root, label })
				writeFiles({ root, files: { '.dialecte/lot.json': '{}' } })
				const status = await tdd({ root, argv: ['status', '--json'] })
				const { cases } = JSON.parse(status.output) as {
					cases: Array<{ file: string; name: string; status: string }>
				}

				expect({
					kinds: receipts.map((receipt) => receipt.kind),
					productions: new Set(receipts.map((receipt) => receipt.productionHash)).size,
					status: cases.find((line) => caseLabel({ ...line, project: '' }) === label)?.status,
				}).toEqual({ kinds: [kind, kind], productions: 2, status: 'missing receipt' })
			},
		)

		it('a case refused at green, then passing at the same production → an unchanged receipt is recorded', async () => {
			const root = basePackage()
			await redOfSub({ root })
			writeFiles({ root, files: { 'src/sub.ts': SUB } })
			vi.stubEnv(FAIL_VARIABLE, '1')
			const refused = await tdd({ root, argv: ['green'] })
			vi.unstubAllEnvs()

			const green = await tdd({ root, argv: ['green'] })

			expect({
				refused: caseLines(refused.output)[0],
				line: caseLines(green.output)[0],
				kinds: kindsOf({ root, label: BASE_CASE }),
			}).toEqual({
				refused: expect.stringMatching(
					/^refused {2}src\/add\.test\.ts::one plus two → three {2}still fails: assertion/,
				),
				line: `unchanged  ${BASE_CASE}`,
				kinds: ['unchanged', 'refused', 'unchanged'],
			})
		})

		it('a test-only case recorded again at a production, production put back, then failing at red → flagged rollback', async () => {
			const root = basePackage()
			writeFiles({
				root,
				files: {
					'src/add.test.ts': `${ADD_TEST}${ACCEPTED_CASE_TEXT}`,
					'.dialecte/lot.json': JSON.stringify({
						accept: [{ case: ACCEPTED_CASE, reason: 'add answers it already' }],
					}),
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFiles({ root, files: { 'src/add.ts': REFACTORED_ADD } })
			await tdd({ root, argv: ['green'] })
			writeFiles({ root, files: { 'src/add.ts': ADD } })
			vi.stubEnv(FAIL_VARIABLE, '1')

			const red = await tdd({ root, argv: ['red'] })

			expect(caseLines(red.output)[0]).toMatch(
				/^red {6}src\/add\.test\.ts::one plus two → three {2}assertion: .*flags: rollback$/,
			)
		})
	},
)

describe(
	'tdd green: a test file moved with its bytes',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('its case broken by a production change → refused; passing again → recorded unchanged, no red receipt asked', async () => {
			const root = basePackage()
			await movedWithRedOfSub(root)
			writeFiles({ root, files: { 'src/sub.ts': SUB, 'src/add.ts': BROKEN_ADD } })

			const broken = await tdd({ root, argv: ['green'] })
			writeFiles({ root, files: { 'src/add.ts': ADD } })
			const fixed = await tdd({ root, argv: ['green'] })

			expect({
				brokenExit: broken.exitCode,
				broken: caseLines(broken.output).sort(),
				fixedExit: fixed.exitCode,
				fixed: caseLines(fixed.output).sort(),
			}).toEqual({
				brokenExit: 1,
				broken: [
					`green    ${SUB_FILE_CASE}`,
					expect.stringMatching(
						/^refused {2}src\/sum\.test\.ts::one plus two → three {2}still fails: assertion: expected -1 to be 3/,
					),
				],
				fixedExit: 0,
				fixed: [`green    ${SUB_FILE_CASE}`, `unchanged  ${MOVED_CASE}`],
			})
		})

		it('all its cases passing → unchanged receipts, no green receipt, no rollback flag', async () => {
			const root = basePackage()
			await movedWithRedOfSub(root)
			writeFiles({ root, files: { 'src/sub.ts': SUB } })

			await tdd({ root, argv: ['green'] })
			const status = await tdd({ root, argv: ['status', '--json'] })
			const { cases } = JSON.parse(status.output) as {
				cases: Array<{ file: string; movedFile?: boolean; testFileHash?: string }>
			}
			const line = cases.find((each) => each.file === 'src/sum.test.ts')

			expect({
				receipts: receiptsOf({ root, label: MOVED_CASE }).map((receipt) => ({
					kind: receipt.kind,
					flags: receipt.flags ?? [],
					testFileHash: receipt.testFileHash,
				})),
				movedFile: line?.movedFile,
			}).toEqual({
				receipts: [{ kind: 'unchanged', flags: [], testFileHash: line?.testFileHash }],
				movedFile: true,
			})
		})

		it('green at one production, the production changed, green again → recorded unchanged at the new one, never frozen after red; the hook passes', async () => {
			const root = basePackage()
			await movedWithRedOfSub(root)
			writeFiles({ root, files: { 'src/sub.ts': SUB } })
			await tdd({ root, argv: ['green'] })
			writeFiles({ root, files: { 'src/add.ts': REFACTORED_ADD } })

			const green = await tdd({ root, argv: ['green'] })
			git({ root, args: ['add', '-A'] })
			const hook = await runHookIn({ cwd: root })

			expect({
				lines: caseLines(green.output).sort(),
				kinds: kindsOf({ root, label: MOVED_CASE }),
				hookExit: hook.exitCode,
			}).toEqual({
				lines: [`green    ${SUB_FILE_CASE}`, `unchanged  ${MOVED_CASE}`],
				kinds: ['unchanged', 'unchanged'],
				hookExit: 0,
			})
		})

		it('moved and edited, red taken, the edit undone (moved with its bytes again) → green records it unchanged, never frozen after red', async () => {
			const root = basePackage()
			git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
			writeFiles({
				root,
				files: {
					'src/sum.test.ts': `import { sub } from './sub.ts'\n${ADD_TEST}`,
					'src/sub.test.ts': SUB_TEST,
					'src/sub.ts': SUB_STUB,
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFiles({ root, files: { 'src/sum.test.ts': ADD_TEST, 'src/sub.ts': SUB } })

			const green = await tdd({ root, argv: ['green'] })

			expect({ exitCode: green.exitCode, lines: caseLines(green.output).sort() }).toEqual({
				exitCode: 0,
				lines: [`green    ${SUB_FILE_CASE}`, `unchanged  ${MOVED_CASE}`],
			})
		})

		it('moved and edited, red then green, the edit undone and committed with no green after → the hook names it stale; one green clears it', async () => {
			const root = basePackage()
			git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
			writeFiles({
				root,
				files: {
					'src/sum.test.ts': `import { sub } from './sub.ts'\n${ADD_TEST}`,
					'src/sub.test.ts': SUB_TEST,
					'src/sub.ts': SUB_STUB,
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFiles({ root, files: { 'src/sub.ts': SUB } })
			await tdd({ root, argv: ['green'] })
			writeFiles({ root, files: { 'src/sum.test.ts': ADD_TEST } })
			git({ root, args: ['add', '-A'] })

			const stale = await runHookIn({ cwd: root })
			await tdd({ root, argv: ['green'] })
			const cleared = await runHookIn({ cwd: root })

			expect({
				stale: stale.output.split('\n'),
				kinds: kindsOf({ root, label: MOVED_CASE }).at(-1),
				cleared: cleared.exitCode,
			}).toEqual({
				stale: [
					'FAIL  tdd  1 case(s) of the lot not proven at the production committed',
					'gate --hook: failed at tdd',
					'--- last lines of tdd ---',
					`stale  ${MOVED_CASE}`,
					'run `dialecte tdd green` again',
				],
				kinds: 'unchanged',
				cleared: 0,
			})
		})

		it('a lot whose only test files are moved with their bytes, production changed → green runs them, not refused for no test file', async () => {
			const root = basePackage()
			git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
			writeFiles({ root, files: { 'src/add.ts': REFACTORED_ADD } })

			const green = await tdd({ root, argv: ['green'] })

			expect({ exitCode: green.exitCode, lines: caseLines(green.output) }).toEqual({
				exitCode: 0,
				lines: [`unchanged  ${MOVED_CASE}`],
			})
		})

		it('a moved file holding an it.skip and an it.todo case, another whose every case is skipped → neither judged nor recorded, no zero-case refusal; the hook passes after the green', async () => {
			const skips = [
				"import { expect, it } from 'vitest'",
				"it.skip('skipped as written', () => { expect(1).toBe(2) })",
				"it.todo('written later')",
				'',
			].join('\n')
			const root = basePackage({
				'src/add.test.ts': `${ADD_TEST}${skips.split('\n').slice(1).join('\n')}`,
				'src/skips.test.ts': skips,
			})
			git({ root, args: ['mv', 'src/add.test.ts', 'src/sum.test.ts'] })
			git({ root, args: ['mv', 'src/skips.test.ts', 'src/skipped.test.ts'] })
			writeFiles({ root, files: { 'src/add.ts': REFACTORED_ADD } })

			const green = await tdd({ root, argv: ['green'] })
			git({ root, args: ['add', '-A'] })
			const hook = await runHookIn({ cwd: root })

			expect({
				exitCode: green.exitCode,
				lines: caseLines(green.output),
				zeroCase: green.output.includes('src/skipped.test.ts'),
				recorded: [
					'src/sum.test.ts::skipped as written',
					'src/sum.test.ts::written later',
					'src/skipped.test.ts::skipped as written',
					'src/skipped.test.ts::written later',
				].flatMap((label) => kindsOf({ root, label })),
				hookExit: hook.exitCode,
			}).toEqual({
				exitCode: 0,
				lines: [`unchanged  ${MOVED_CASE}`],
				zeroCase: false,
				recorded: [],
				hookExit: 0,
			})
		})

		it('a skipIf case of a moved file skipped at the green run → recorded unchanged at this production, the hook passes', async () => {
			const root = basePackage({
				'src/maybe.test.ts': [
					"import { expect, it } from 'vitest'",
					`it.skipIf(process.env.${SKIP_VARIABLE})('maybe skipped', () => { expect(1).toBe(1) })`,
					'',
				].join('\n'),
			})
			git({ root, args: ['mv', 'src/maybe.test.ts', 'src/perhaps.test.ts'] })
			writeFiles({ root, files: { 'src/add.ts': REFACTORED_ADD } })
			vi.stubEnv(SKIP_VARIABLE, '1')

			const green = await tdd({ root, argv: ['green'] })
			git({ root, args: ['add', '-A'] })
			const hook = await runHookIn({ cwd: root })

			expect({
				line: caseLines(green.output).find((line) => line.includes('perhaps')),
				kinds: kindsOf({ root, label: 'src/perhaps.test.ts::maybe skipped' }),
				hookExit: hook.exitCode,
			}).toEqual({
				line: 'unchanged  src/perhaps.test.ts::maybe skipped  skipped at this run',
				kinds: ['unchanged'],
				hookExit: 0,
			})
		})

		it('a green naming another test file → no case of the moved file judged or recorded', async () => {
			const root = basePackage()
			await movedWithRedOfSub(root)
			writeFiles({ root, files: { 'src/sub.ts': SUB } })

			const green = await tdd({ root, argv: ['green', 'src/sub.test.ts'] })

			expect({
				lines: caseLines(green.output),
				kinds: kindsOf({ root, label: MOVED_CASE }),
			}).toEqual({ lines: [`green    ${SUB_FILE_CASE}`], kinds: [] })
		})

		it('a moved pytest file holding a skip-marked case → that case left out; the hook names only the other stale, and passes after one green', async () => {
			const skipped = `import pytest\n${ADD_ONE_PYTEST_TEXT}\n\n@pytest.mark.skip(reason='later')\ndef test_later():\n    assert False\n`
			const root = createPythonPackage({
				committed: {
					'package.json': `${JSON.stringify({
						name: 'demo',
						devDependencies: { vitest: '^4.1.8' },
						dialecte: { gate: { hook: [{ name: 'check', run: 'true' }] } },
					})}\n`,
					[ADDER_FILE]: ADDER_IMPLEMENTED_TEXT,
					[ADD_PYTEST_FILE]: skipped,
				},
			})
			git({ root, args: ['mv', ADD_PYTEST_FILE, 'tests/test_sum.py'] })
			writeFileSync(join(root, ADDER_FILE), 'def add(left, right):\n    return right + left\n')
			git({ root, args: ['add', '-A'] })

			const stale = await runHookIn({ cwd: root })
			await tdd({ root, argv: ['green'] })
			const cleared = await runHookIn({ cwd: root })

			expect({
				stale: stale.output.split('\n').filter((line) => line.startsWith('stale')),
				cleared: cleared.exitCode,
			}).toEqual({
				stale: ['stale  tests/test_sum.py::test_one'],
				cleared: 0,
			})
		})

		it('a node:test todo case of a touched file (reported pending) with its unchanged proof → not refused: green passes', async () => {
			const root = createNodePackage({
				committed: { 'src/add.ts': ADD, 'src/sub.ts': SUB, 'src/add.test.ts': nodeTestText('') },
			})
			writeFiles({
				root,
				files: {
					'src/add.test.ts': nodeTestText(
						"\tit('two', () => {\n\t\tassert.equal(sub(3, 1), 2)\n\t})",
					),
					'src/sub.ts': SUB_STUB,
				},
			})
			await tdd({ root, argv: ['red'] })
			writeFiles({ root, files: { 'src/sub.ts': SUB } })

			const green = await tdd({ root, argv: ['green'] })

			expect({
				exitCode: green.exitCode,
				refused: caseLines(green.output).filter((line) => line.startsWith('refused')),
			}).toEqual({ exitCode: 0, refused: [] })
		})
	},
)
