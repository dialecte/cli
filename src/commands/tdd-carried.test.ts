/**
 * `tdd red` in a lot rebuilt with `lot start --from <canceled lot>`: a passing case whose test code and production
 * slice are the ones the source lot's green ran on carries the source's red, flagged `carried`; every other case goes
 * the way it goes without a source. The combinations live in `lotCarryOf`'s table; these are the command's own cases.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { rebuiltLot, reviewThrowawayOf, tddIn } from '../../test/carry-tdd-workspace.ts'
import { CARRY_DECLARATION_TEXT } from '../../test/carry-workspace.constants.ts'
import { runHookIn } from '../../test/gate-hook.ts'
import { git } from '../../test/scratch-repository.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { FLAG_ORDER } from '../lib/handover/handover.constants.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { TDD_LEGEND_TERMS } from '../lib/legend/legend.constants.ts'
import { CARRY_LEDGER_COPY_NAME } from '../lib/store/carry-source.constants.ts'
import { CARRY_DECLARATION_COPY_NAME } from '../lib/store/carry-source.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import {
	CARRIED_FROM,
	CARRIED_PASSES_ON_BASE,
	NOT_CARRIED,
	NOT_CARRIED_REASONS,
} from '../lib/tdd/carry-over.constants.ts'
import { readLedger } from '../lib/tdd/tdd-files.ts'
import { CHANGED_AND_PASSES, PROVES_NOTHING, RED_ON_BASE_FLAG } from '../lib/tdd/tdd.constants.ts'

import { describe, expect, it } from 'vitest'

import type { TddEntry, TddLedger, TddReceipt } from '../lib/tdd/tdd.types.ts'

const SOURCE = '0005-repo-source'
const FILE = 'src/dataflow/add.test.ts'
const PRODUCTION = 'src/dataflow/add.ts'
const SUM = `${FILE}::add > one plus two → three`
const PRODUCT = `${FILE}::add > two plus two → four`
const TWO_NAME = 'add > one plus one → two'
const PRODUCT_NAME = 'add > two plus two → four'
const TWO = `${FILE}::add > one plus one → two`
const BASE_CASE = `${FILE}::base > three minus two → one`

const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
const DONE =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const BROKEN =
	'export function add(left: number, right: number): number {\n\treturn left - right\n}\n'
const SUB = 'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'

/** A test file of the cases `cases` (title and expectation) in `describe('add')`. */
function testOf(cases: Array<{ title: string; expectation: string }>): string {
	return [
		"import { add } from './add.ts'",
		"import { describe, expect, it } from 'vitest'",
		"describe('add', () => {",
		...cases.map(({ title, expectation }) => `\tit('${title}', () => { ${expectation} })`),
		'})',
		'',
	].join('\n')
}

const SUM_CASE = { title: 'one plus two → three', expectation: 'expect(add(1, 2)).toBe(3)' }
const PRODUCT_CASE = { title: 'two plus two → four', expectation: 'expect(add(2, 2)).toBe(4)' }
const TWO_CASE = { title: 'one plus one → two', expectation: 'expect(add(1, 1)).toBe(2)' }
const ONE_CASE_TEST = testOf([SUM_CASE])

/** The source lot's work: the case red on a stub, green on the code. */
const SOURCE_WORK = {
	red: { [PRODUCTION]: STUB, [FILE]: ONE_CASE_TEST },
	green: { [PRODUCTION]: DONE },
}

/** A test file of the base: one case on its own production. */
const BASE_TEST = [
	"import { sub } from './sub.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('base', () => {",
	"\tit('three minus two → one', () => { expect(sub(3, 2)).toBe(1) })",
	'})',
	'',
].join('\n')

/** The base's test file with `describe('add')` of `cases` added to it. */
function withBaseCase(cases: Array<{ title: string; expectation: string }>): string {
	const added = testOf(cases)
		.split('\n')
		.filter((line) => !line.startsWith('import '))
	return ["import { add } from './add.ts'", ...BASE_TEST.split('\n').slice(0, -1), ...added].join(
		'\n',
	)
}

/** The line of `output` that names `label`. */
function lineOf(params: { output: string; label: string }): string | undefined {
	return params.output.split('\n').find((line) => line.includes(params.label))
}

/** The red receipts of the ledger of a worktree. */
function redsOf(worktree: string): TddEntry[] {
	const ledger = readLedger(worktree) as TddLedger
	return ledger.entries.filter((entry) => entry.kind === 'red')
}

/** The newest red receipt of a worktree's ledger. */
function lastRedOf(worktree: string): TddReceipt {
	return redsOf(worktree).at(-1) as TddReceipt
}

/** The line a carried red prints: `CARRIED_FROM` with the source's time. */
function carriedLine(at: string): string {
	return fillMessage({ template: CARRIED_FROM, values: { lot: SOURCE, at } })
}

/** The reason of a refusal `lotCarryOf` words: `{file}` filled. */
function notCarried(params: { why: string; file?: string }): string {
	return fillMessage({
		template: NOT_CARRIED,
		values: {
			lot: SOURCE,
			why: fillMessage({ template: params.why, values: { file: params.file ?? '' } }),
		},
	})
}

describe(
	'tdd red in a lot rebuilt from a canceled one',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('an identical case whose module the base does not hold → a red flagged carried, named from the source at its time; green proves it; the hook passes; edited after its green, it is judged as without a source', async () => {
			const { worktree, source } = await rebuiltLot({
				source: SOURCE_WORK,
				rebuilt: { [PRODUCTION]: DONE, [FILE]: ONE_CASE_TEST },
			})
			const sourceRed = lastRedOf(source.worktree)

			const red = await tddIn({ cwd: worktree, argv: ['red'] })
			const reds = redsOf(worktree)
			const status = await tddIn({ cwd: worktree, argv: ['status'] })
			const green = await tddIn({ cwd: worktree, argv: ['green'] })
			git({ root: worktree, args: ['add', '-A'] })
			const hook = await runHookIn({ cwd: worktree })
			writeFileSync(
				join(worktree, FILE),
				testOf([
					{ ...SUM_CASE, expectation: `${SUM_CASE.expectation}; expect(add(0, 0)).toBe(0)` },
				]),
			)
			const edited = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				redLine: lineOf({ output: red.output, label: SUM }),
				receipts: reds.map((entry) => ({
					flags: 'flags' in entry ? entry.flags : undefined,
					carriedFrom: 'carriedFrom' in entry ? entry.carriedFrom : undefined,
				})),
				statusLine: lineOf({ output: status.output, label: SUM }),
				green: green.exitCode,
				tdd: hook.output.split('\n').find((line) => /^(ok|FAIL|skip) +tdd /.test(line)),
				editedLine: lineOf({ output: edited.output, label: SUM }),
			}).toEqual({
				redLine: expect.stringContaining(carriedLine(sourceRed.at)),
				receipts: [{ flags: ['carried'], carriedFrom: { lot: SOURCE, at: sourceRed.at } }],
				statusLine: expect.stringContaining('carried'),
				green: 0,
				tdd: 'ok    tdd  1 case(s) of the change: 1 red then green',
				editedLine: expect.stringContaining(CHANGED_AND_PASSES),
			})
			expect(edited.output).not.toContain(notCarried({ why: NOT_CARRIED_REASONS.callDiffers }))
		})

		it("a source red flagged rollback, the case red on the base production → the carried red keeps the source flags and adds carried; its time is the source red's", async () => {
			const { worktree, source } = await rebuiltLot({
				committed: { [PRODUCTION]: BROKEN },
				source: {
					steps: [
						{ run: 'red', files: { [FILE]: ONE_CASE_TEST } },
						{ run: 'green', files: { [PRODUCTION]: DONE } },
						{ run: 'red', files: { [PRODUCTION]: BROKEN } },
						{ run: 'green', files: { [PRODUCTION]: DONE } },
					],
				},
				rebuilt: { [PRODUCTION]: DONE, [FILE]: ONE_CASE_TEST },
			})
			const sourceRed = lastRedOf(source.worktree)

			const red = await tddIn({ cwd: worktree, argv: ['red'] })
			const [carried] = redsOf(worktree)

			expect(sourceRed.flags).toContain('rollback')
			expect({
				redLine: lineOf({ output: red.output, label: SUM }),
				flags: carried && 'flags' in carried ? carried.flags : undefined,
				carriedFrom: carried && 'carriedFrom' in carried ? carried.carriedFrom : undefined,
			}).toEqual({
				redLine: expect.stringContaining(carriedLine(sourceRed.at)),
				flags: [...(sourceRed.flags ?? []), 'carried'],
				carriedFrom: { lot: SOURCE, at: sourceRed.at },
			})
		})

		it('the case edited since the source proved it → refused "not carried from", no red', async () => {
			const { worktree } = await rebuiltLot({
				source: SOURCE_WORK,
				rebuilt: {
					[PRODUCTION]: DONE,
					[FILE]: testOf([
						{ ...SUM_CASE, expectation: `${SUM_CASE.expectation}; expect(add(0, 0)).toBe(0)` },
					]),
				},
			})

			const red = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				line: lineOf({ output: red.output, label: SUM }),
				reds: redsOf(worktree).length,
			}).toEqual({
				line: expect.stringContaining(notCarried({ why: NOT_CARRIED_REASONS.callDiffers })),
				reds: 0,
			})
		})

		it('a production file of the slice edited, then put back → refused naming it; the next red carries', async () => {
			const { worktree, source } = await rebuiltLot({
				source: SOURCE_WORK,
				rebuilt: { [PRODUCTION]: `${DONE}// edited\n`, [FILE]: ONE_CASE_TEST },
			})
			const sourceRed = lastRedOf(source.worktree)

			const refused = await tddIn({ cwd: worktree, argv: ['red'] })
			writeFileSync(join(worktree, PRODUCTION), DONE)
			const carried = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				refused: lineOf({ output: refused.output, label: SUM }),
				carried: lineOf({ output: carried.output, label: SUM }),
			}).toEqual({
				refused: expect.stringContaining(
					notCarried({ why: NOT_CARRIED_REASONS.productionDiffers, file: PRODUCTION }),
				),
				carried: expect.stringContaining(carriedLine(sourceRed.at)),
			})
		})

		it("a carried case that passes on the base's production → refused: the carry proves nothing", async () => {
			const { worktree } = await rebuiltLot({
				committed: { [PRODUCTION]: DONE },
				source: {
					red: { [PRODUCTION]: BROKEN, [FILE]: ONE_CASE_TEST },
					green: { [PRODUCTION]: DONE },
				},
				rebuilt: { [FILE]: ONE_CASE_TEST },
			})

			const red = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				line: lineOf({ output: red.output, label: SUM }),
				reds: redsOf(worktree).length,
			}).toEqual({
				line: expect.stringContaining(
					fillMessage({ template: CARRIED_PASSES_ON_BASE, values: { lot: SOURCE } }),
				),
				reds: 0,
			})
		})

		it('an accepted case, a revised case and a case of the base beside an identical one → only the identical one carried, the others judged as without a source', async () => {
			const twoCases = withBaseCase([SUM_CASE, PRODUCT_CASE, TWO_CASE])
			const { worktree, source } = await rebuiltLot({
				committed: { 'src/dataflow/sub.ts': SUB, [FILE]: BASE_TEST, [PRODUCTION]: BROKEN },
				source: {
					red: { [PRODUCTION]: STUB, [FILE]: twoCases },
					green: { [PRODUCTION]: DONE },
				},
				rebuilt: {
					[PRODUCTION]: DONE,
					[FILE]: twoCases,
					'.dialecte/lot.json': JSON.stringify({
						accept: [{ case: SUM, reason: 'accepted without a red' }],
						revised: [{ case: PRODUCT, reason: 'edited at review' }],
					}),
				},
			})

			const sourceTwo = redsOf(source.worktree).find(
				(entry) => 'name' in entry && entry.name === TWO_NAME,
			)
			const red = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				accepted: lineOf({ output: red.output, label: SUM })?.startsWith('accepted'),
				revised: lineOf({ output: red.output, label: PRODUCT })?.startsWith('red'),
				revisedCarried: lineOf({ output: red.output, label: PRODUCT })?.includes('carried'),
				revisedFlags: redsOf(worktree)
					.filter((entry) => 'name' in entry && entry.name === PRODUCT_NAME)
					.map((entry) => ('flags' in entry ? entry.flags : undefined)),
				base: lineOf({ output: red.output, label: BASE_CASE })?.startsWith('unchanged'),
				identicalCarried: (lineOf({ output: red.output, label: TWO }) ?? '').includes(
					carriedLine(sourceTwo?.at ?? 'no source red'),
				),
				reds: redsOf(worktree).length,
			}).toEqual({
				accepted: true,
				revised: true,
				revisedCarried: false,
				revisedFlags: [[RED_ON_BASE_FLAG]],
				base: true,
				identicalCarried: true,
				reds: 2,
			})
		})

		it('a review throwaway of the rebuilt lot holding the identical case → nothing carried: the case proves nothing, as in any worktree that is not the lot', async () => {
			const lot = await rebuiltLot({
				source: SOURCE_WORK,
				rebuilt: { [PRODUCTION]: DONE, [FILE]: ONE_CASE_TEST },
			})
			const throwaway = reviewThrowawayOf({
				lot,
				files: { [PRODUCTION]: DONE, [FILE]: ONE_CASE_TEST },
			})

			const red = await tddIn({ cwd: throwaway, argv: ['red'] })

			expect({
				line: lineOf({ output: red.output, label: SUM }),
				reds: redsOf(throwaway).length,
			}).toEqual({
				line: expect.stringContaining(PROVES_NOTHING),
				reds: 0,
			})
		})

		it('a lot started without --from → the passing case proves nothing, as ever', async () => {
			const { worktree, lotFolder } = await rebuiltLot({
				source: { canned: true },
				rebuilt: { [PRODUCTION]: DONE, [FILE]: ONE_CASE_TEST },
				from: false,
			})

			const red = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				line: lineOf({ output: red.output, label: SUM }),
				carry: lineOf({ output: red.output, label: 'carried' }),
				record: readFileOrNothing(join(lotFolder, STORE_FILES.carry)),
			}).toEqual({
				line: expect.stringContaining(PROVES_NOTHING),
				carry: undefined,
				record: undefined,
			})
		})
	},
)

/** The text of a file, undefined when there is none. */
function readFileOrNothing(file: string): string | undefined {
	try {
		return readFileSync(file, 'utf8')
	} catch {
		return undefined
	}
}

describe(
	'tdd red refuses the run when the carry records cannot be trusted',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it.each([
			{
				row: 'carry.json garbled',
				file: STORE_FILES.carry,
				tamper: (lotFolder: string) =>
					writeFileSync(join(lotFolder, STORE_FILES.carry), '{ "schema": '),
			},
			{
				row: 'the ledger copy missing',
				file: join(STORE_FILES.carryCopies, CARRY_LEDGER_COPY_NAME),
				tamper: (lotFolder: string) =>
					rmSync(join(lotFolder, STORE_FILES.carryCopies, CARRY_LEDGER_COPY_NAME)),
			},
			{
				row: 'the ledger copy edited after the start',
				file: join(STORE_FILES.carryCopies, CARRY_LEDGER_COPY_NAME),
				tamper: (lotFolder: string) => {
					const copy = join(lotFolder, STORE_FILES.carryCopies, CARRY_LEDGER_COPY_NAME)
					writeFileSync(copy, `${readFileSync(copy, 'utf8')} `)
				},
			},
			{
				row: 'the lot file copy edited after the start',
				file: join(STORE_FILES.carryCopies, CARRY_DECLARATION_COPY_NAME),
				tamper: (lotFolder: string) => {
					const copy = join(lotFolder, STORE_FILES.carryCopies, CARRY_DECLARATION_COPY_NAME)
					writeFileSync(copy, `${readFileSync(copy, 'utf8')} `)
				},
			},
		])('$row → exit 2 naming the file, nothing recorded', async ({ file, tamper }) => {
			const { worktree, lotFolder } = await rebuiltLot({
				source: { canned: true, declaration: CARRY_DECLARATION_TEXT },
				rebuilt: { [PRODUCTION]: DONE, [FILE]: ONE_CASE_TEST },
			})
			tamper(lotFolder)

			const red = await tddIn({ cwd: worktree, argv: ['red'] })

			expect({
				exitCode: red.exitCode,
				names: red.output.includes(file),
				ledger: readLedger(worktree),
			}).toEqual({ exitCode: 2, names: true, ledger: { version: 3, entries: [] } })
		})
	},
)

describe('the carried flag in the legend and the card', () => {
	it('the tdd legend → a carried term with a meaning and a look line', () => {
		const term = TDD_LEGEND_TERMS.find((entry) => entry.term === 'carried')

		expect(term).toEqual({
			term: 'carried',
			meaning: expect.stringMatching(/\S/),
			look: expect.stringMatching(/^look/),
		})
	})

	it('the card orders the carried flag right after moved', () => {
		expect(FLAG_ORDER.indexOf('carried')).toBe(FLAG_ORDER.indexOf('moved') + 1)
	})
})
