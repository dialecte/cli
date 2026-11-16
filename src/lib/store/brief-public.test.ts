/**
 * A brief's public fields (33CI CI2a): `summary`, one public sentence a pull request may show, and `issue`, the issue
 * it closes. Both optional; a summary holding a line break, a path, a link, a reference or a forbidden word is refused
 * at the start like every brief field, the refusal naming the field and the rule's label, never the word.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PLAN_FILE, PLAN_TEXT } from '../../../test/brief-workspace.constants.ts'
import { briefWith, checkArgumentsOf, createBriefWorkspace } from '../../../test/brief-workspace.ts'
import { FIRST_WORD } from '../../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../../test/forbidden-words-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { appendPlanMark } from '../plan/plan-marks.ts'
import { checkBrief, checkBriefFields } from './brief.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A summary a pull request may show. */
const PUBLIC_SUMMARY = 'The review rounds keep a public record of their findings and verdicts.'

describe('brief summary and issue - the fields', () => {
	it('a summary and an issue -> no refusal, both in the parsed brief', () => {
		const fields = checkBriefFields({ value: briefWith({ summary: PUBLIC_SUMMARY, issue: 42 }) })

		expect({
			refused: fields.refused,
			summary: fields.brief?.summary,
			issue: fields.brief?.issue,
		}).toEqual({ refused: [], summary: PUBLIC_SUMMARY, issue: 42 })
	})

	it('neither -> no refusal, neither in the parsed brief', () => {
		const fields = checkBriefFields({ value: briefWith() })

		expect({ refused: fields.refused, brief: fields.brief }).toEqual({
			refused: [],
			brief: expect.not.objectContaining({ summary: expect.anything() }),
		})
	})

	for (const [what, summary, detail] of [
		['a line break', 'One line.\nAnother line.', 'summary must be one line'],
		['an empty text', '', 'summary must be a non-empty string'],
		['201 characters', 'a'.repeat(201), 'summary must be at most 200 characters'],
		['a number', 7, 'summary must be a non-empty string'],
	] as const)
		it(`a summary of ${what} -> refused: ${detail}`, () => {
			expect(checkBriefFields({ value: briefWith({ summary }) }).refused).toEqual([
				{ field: 'summary', rule: 'shape', detail },
			])
		})

	for (const [what, summary] of [
		['a plan path', 'Follows implementation-plans/AGENT_TOOLING/BRIEF.md closely.'],
		['a relative path', 'Reads ../notes/plan.md before it starts.'],
		['a link', 'See https://example.org/page for the reasons.'],
		['a file and line', 'Fixes the reader at src/lib/a.ts:12 for good.'],
		['a home path', 'Copies ~/notes into the record.'],
		['a file and line without an extension', 'Fixes the target at Makefile:12 again.'],
		['a bare web link', 'Explained at www.example.org for readers.'],
		['a root path in parentheses', 'Reads the defaults (/etc) once.'],
		['a drive path', 'Copies C:\\notes\\plan.md into the record.'],
		['a drive path with forward slashes', 'Copies C:/Users/someone into the record.'],
		['a dot-folder path', 'Keeps the lot under .dialecte/plan as it was.'],
	])
		it(`a summary holding ${what} -> refused: summary holds a path or a link`, () => {
			expect(checkBriefFields({ value: briefWith({ summary }) }).refused).toEqual([
				{ field: 'summary', rule: 'public-text', detail: 'summary holds a path or a link' },
			])
		})

	for (const summary of [
		'Adds read/write locks to the store.',
		'Keeps TCP/IP and I/O apart.',
		'Needs a 2/3 majority of the reviews.',
		'Moves to v1.2, e.g. with fewer steps.',
		'Runs at 3:30 each night.',
		'Reads the profile:3 times faster.',
	])
		it(`an ordinary sentence "${summary}" -> no refusal`, () => {
			expect(checkBriefFields({ value: briefWith({ summary }) }).refused).toEqual([])
		})

	for (const [what, issue] of [
		['zero', 0],
		['a negative number', -3],
		['a fraction', 2.5],
		['a string', '#12'],
	] as const)
		it(`an issue of ${what} -> refused: issue must be a positive integer`, () => {
			expect(checkBriefFields({ value: briefWith({ issue }) }).refused).toEqual([
				{ field: 'issue', rule: 'shape', detail: 'issue must be a positive integer' },
			])
		})
})

describe('brief summary - references and forbidden words', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const [label, summary] of [
		['plan tag', `The records ${'lot'} A3 asked for.`],
		['ticket number', `Closes the gap of ${'#'}1234 in the records.`],
		['section citation', `Records what ${'§'} 6 asks of a review.`],
		['clause citation', `Follows ${'clause'} 7 of the rules.`],
	])
		it(`a summary holding a ${label} -> refused, the refusal names the ${label}`, () => {
			const workspace = createBriefWorkspace()

			expect(
				checkBrief(checkArgumentsOf({ workspace, brief: briefWith({ summary }) })).refused,
			).toEqual([{ field: 'summary', rule: 'public-text', detail: `summary holds a ${label}` }])
		})

	it('a summary holding a word of the forbidden list -> refused, the word never named', () => {
		const workspace = createBriefWorkspace()
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			checkBrief(
				checkArgumentsOf({
					workspace,
					brief: briefWith({ summary: `Records the ${FIRST_WORD} findings.` }),
				}),
			).refused,
		).toEqual([{ field: 'summary', rule: 'public-text', detail: 'summary holds a forbidden word' }])
	})

	it('a public summary and an issue -> checked, both kept', () => {
		const workspace = createBriefWorkspace()

		const checked = checkBrief(
			checkArgumentsOf({ workspace, brief: briefWith({ summary: PUBLIC_SUMMARY, issue: 7 }) }),
		)

		expect({
			refused: checked.refused,
			summary: checked.checked?.summary,
			issue: checked.checked?.issue,
		}).toEqual({ refused: [], summary: PUBLIC_SUMMARY, issue: 7 })
	})
})

/** A plan of `PLAN_TEXT` whose lot block holds the entries given; its repository is the workspace's. */
function planWithBlock(lots: readonly Record<string, unknown>[]): string {
	return `${PLAN_TEXT}\n\`\`\`json dialecte-lots\n${JSON.stringify({
		schema: 1,
		repositories: { repo: '../../repo' },
		lots,
	})}\n\`\`\`\n`
}

/** A lot entry of the plan block: `id`, on `branch`. */
function entryOf(params: { id: string; branch: string }): Record<string, unknown> {
	return {
		id: params.id,
		title: 'an entry',
		kind: 'lot',
		scope: { repo: ['src/'] },
		match: { branch: params.branch },
	}
}

/** A lot plan whose block names the entries `RX7` and `BETA2`: the brief's plan. */
const PLAN_WITH_ENTRIES = planWithBlock([
	entryOf({ id: 'RX7', branch: 'feat/records' }),
	{ ...entryOf({ id: 'BETA2', branch: 'feat/reader' }), dependsOn: ['RX7'] },
])

describe('brief summary - the ids of the lot plan', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const summary of ['Adds the records RX7 asked for.', 'Reads them, as in BETA2.'])
		it(`a summary "${summary}" holding an entry id of the brief's plan -> refused, the id never named`, () => {
			const workspace = createBriefWorkspace()
			writeFileSync(join(workspace.briefFolder, PLAN_FILE), PLAN_WITH_ENTRIES)

			expect(
				checkBrief(checkArgumentsOf({ workspace, brief: briefWith({ summary }) })).refused,
			).toEqual([
				{ field: 'summary', rule: 'public-text', detail: 'summary holds a plan entry id' },
			])
		})

	it('a summary holding a word that only contains an entry id (RX70) -> no refusal', () => {
		const workspace = createBriefWorkspace()
		writeFileSync(join(workspace.briefFolder, PLAN_FILE), PLAN_WITH_ENTRIES)

		expect(
			checkBrief(
				checkArgumentsOf({
					workspace,
					brief: briefWith({ summary: 'Moves the RX70 reader aside.' }),
				}),
			).refused,
		).toEqual([])
	})
})

/**
 * Writes two plans beside the brief, each marked done on this machine as `dialecte plan mark` does: one holding the
 * lot's entry `RX7` (on the brief's branch) and the entry `T`, the other holding only `QZ9`, on another branch. The
 * brief's own plan is a third one, with no block.
 */
function markLotPlans(briefFolder: string): void {
	for (const [file, lots] of [
		[
			'lot-plan.md',
			[
				entryOf({ id: 'RX7', branch: 'feat/dataflow-subscribe' }),
				entryOf({ id: 'T', branch: 'feat/t-entry' }),
			],
		],
		['other-plan.md', [entryOf({ id: 'QZ9', branch: 'feat/elsewhere' })]],
	] as const) {
		const planPath = join(briefFolder, file)
		writeFileSync(planPath, planWithBlock(lots))
		appendPlanMark({ planPath, id: String(lots[0].id), by: 'a person' })
	}
}

describe(
	'brief summary - the ids of the plan that holds the lot',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const summary of [
			'Adds the records RX7 asked for.',
			'Adds the records rx7 asked for.',
			'Kept by the rx7-lot reader.',
			'Fixes the T reader.',
		])
			it(`a summary "${summary}" holding an entry id of a marked plan that holds the lot -> refused`, () => {
				const workspace = createBriefWorkspace()
				markLotPlans(workspace.briefFolder)

				expect(
					checkBrief(checkArgumentsOf({ workspace, brief: briefWith({ summary }) })).refused,
				).toEqual([
					{ field: 'summary', rule: 'public-text', detail: 'summary holds a plan entry id' },
				])
			})

		for (const [what, summary] of [
			['an id of a marked plan that does not hold the lot', 'Adds the QZ9 records.'],
			['a one-letter id in another case', "Doesn't drop t now."],
		])
			it(`a summary holding ${what} -> no refusal`, () => {
				const workspace = createBriefWorkspace()
				markLotPlans(workspace.briefFolder)

				expect(
					checkBrief(checkArgumentsOf({ workspace, brief: briefWith({ summary }) })).refused,
				).toEqual([])
			})
	},
)
