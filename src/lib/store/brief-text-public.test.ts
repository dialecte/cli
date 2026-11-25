/**
 * Every public text of a brief is checked at the start, not only its summary: a step's title and its behaviours reach
 * the pull request body too. A plan entry id made of letters only (an ordinary word) is matched only as written.
 */
import { VALID_BRIEF } from '../../../test/brief-workspace.constants.ts'
import { briefWith, checkArgumentsOf, createBriefWorkspace } from '../../../test/brief-workspace.ts'
import { FIRST_WORD } from '../../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../../test/forbidden-words-workspace.ts'
import { planEntryOf, writeMarkedPlan } from '../../../test/plan-block.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBrief } from './brief.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The brief's one step with `title` and `behaviours` (the valid brief's spec heading). */
function stepsWith(params: { title?: string; behaviours?: string[] }): Record<string, unknown>[] {
	const [step] = briefWith().steps as Record<string, unknown>[]
	return [{ ...step, ...params }]
}

/** The refusals of a start of the valid brief with `overrides`. */
function refusedOf(params: { workspace: BriefWorkspace; overrides: Record<string, unknown> }) {
	return checkBrief(
		checkArgumentsOf({ workspace: params.workspace, brief: briefWith(params.overrides) }),
	).refused
}

/** Marks a plan holding the lot's entries `CONFIG` (on the brief's branch) and `CI2a`. */
function markWordPlan(workspace: BriefWorkspace): void {
	writeMarkedPlan({
		briefFolder: workspace.briefFolder,
		file: 'lot-plan.md',
		lots: [
			planEntryOf({ id: 'CONFIG', branch: String(VALID_BRIEF.branch) }),
			planEntryOf({ id: 'CI2a', branch: 'feat/other' }),
		],
	})
}

describe('brief steps - their public text', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a step title holding a forbidden word → refused, the field and label named, never the word', () => {
		const workspace = createBriefWorkspace()
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			refusedOf({
				workspace,
				overrides: { steps: stepsWith({ title: `the ${FIRST_WORD} reader` }) },
			}),
		).toEqual([
			{
				field: 'steps[0].title',
				rule: 'public-text',
				detail: 'steps[0].title holds a forbidden word',
			},
		])
	})

	it('a behaviour holding a path → refused, the field named', () => {
		const workspace = createBriefWorkspace()

		expect(
			refusedOf({
				workspace,
				overrides: {
					steps: stepsWith({ behaviours: ['a read -> as plans/AGENT/33.md says', 'b -> c'] }),
				},
			}),
		).toEqual([
			{
				field: 'steps[0].behaviours[0]',
				rule: 'public-text',
				detail: 'steps[0].behaviours[0] holds a path or a link',
			},
		])
	})

	it('a behaviour holding an entry id of the plan that holds the lot → refused', () => {
		const workspace = createBriefWorkspace()
		markWordPlan(workspace)

		expect(
			refusedOf({
				workspace,
				overrides: { steps: stepsWith({ behaviours: ['a read -> as CONFIG asked', 'b -> c'] }) },
			}),
		).toEqual([
			{
				field: 'steps[0].behaviours[0]',
				rule: 'public-text',
				detail: 'steps[0].behaviours[0] holds a plan entry id',
			},
		])
	})
})

describe(
	'plan entry ids - a word-like id is matched as written',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const [what, summary, refused] of [
			['the word of a letters-only id in another case', 'Reads the config once.', false],
			['a letters-only id as written', 'Reads what CONFIG asks.', true],
			['an id holding a digit in another case', 'Folded from ci2a.', true],
		] as const)
			it(`a summary holding ${what} → ${refused ? 'refused' : 'no refusal'}`, () => {
				const workspace = createBriefWorkspace()
				markWordPlan(workspace)

				expect(refusedOf({ workspace, overrides: { summary } })).toEqual(
					refused
						? [{ field: 'summary', rule: 'public-text', detail: 'summary holds a plan entry id' }]
						: [],
				)
			})
	},
)

describe('brief sections - their public text', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a section text naming a path → no refusal at the start: the render checks it against the tree', () => {
		const workspace = createBriefWorkspace()

		expect(
			refusedOf({
				workspace,
				overrides: {
					sections: [{ heading: 'Deviations', text: 'The reader moved to src/lib/reader.ts.' }],
				},
			}),
		).toEqual([])
	})

	it('a section text holding a link → refused, the field named', () => {
		const workspace = createBriefWorkspace()

		expect(
			refusedOf({
				workspace,
				overrides: {
					sections: [{ heading: 'Deviations', text: 'As https://example.org/notes says.' }],
				},
			}),
		).toEqual([
			{ field: 'sections[0].text', rule: 'public-text', detail: 'sections[0].text holds a link' },
		])
	})

	it('a section heading holding an entry id of the plan that holds the lot → refused', () => {
		const workspace = createBriefWorkspace()
		markWordPlan(workspace)

		expect(
			refusedOf({
				workspace,
				overrides: { sections: [{ heading: 'What CONFIG left', text: 'One reader.' }] },
			}),
		).toEqual([
			{
				field: 'sections[0].heading',
				rule: 'public-text',
				detail: 'sections[0].heading holds a plan entry id',
			},
		])
	})

	it('a section text holding a forbidden word → refused, the label named, never the word', () => {
		const workspace = createBriefWorkspace()
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			refusedOf({
				workspace,
				overrides: { sections: [{ heading: 'Deviations', text: `The ${FIRST_WORD} reader.` }] },
			}),
		).toEqual([
			{
				field: 'sections[0].text',
				rule: 'public-text',
				detail: 'sections[0].text holds a forbidden word',
			},
		])
	})
})
