/**
 * `mergeTreeLineOf`: the card's failed `merges` line names the first merge lot not committed yet that has no
 * recorded tree, by its position among all the lots (as the run's guard numbers it); none on a rehearsal's card.
 */
import { mergeTreeLineOf } from './check-handover-guards.ts'

import { describe, expect, it } from 'vitest'

import type { MergeLot, ResolvedLot } from './handover.types.ts'

const TIP = 'a'.repeat(40)
const TREE = 'b'.repeat(40)

/** A merge lot of `feat/x`, with its tree when `tree` is given. */
function mergeLot(params: { tree?: string }): ResolvedLot {
	const merge: MergeLot = {
		branch: 'feat/x',
		tip: TIP,
		onTree: TREE,
		conflicts: [],
		resolutions: [],
		...(params.tree && { tree: params.tree }),
	}
	return { message: 'merge: bring feat/x in', files: [], deletedFiles: [], merge }
}

const PLAIN_LOT: ResolvedLot = { message: 'docs: edited', files: ['notes.txt'], deletedFiles: [] }

function refusalOf(number: number): string {
	return `lot ${number}: tree not recorded: rehearse first (\`--rehearse\` prints it), add it as "tree" to the lot, then \`dialecte handover --rehash\``
}

const CASES: Array<{
	title: string
	lots: ResolvedLot[]
	committed: number
	rehearsal: boolean
	expected: string | undefined
}> = [
	{
		title:
			'a plain lot committed, then a merge lot without its tree → the line names the second lot',
		lots: [PLAIN_LOT, mergeLot({})],
		committed: 1,
		rehearsal: false,
		expected: refusalOf(2),
	},
	{
		title:
			'a merge lot with its tree, then one without, none committed → the line names the second lot',
		lots: [mergeLot({ tree: TREE }), mergeLot({})],
		committed: 0,
		rehearsal: false,
		expected: refusalOf(2),
	},
	{
		title: 'a merge lot without its tree, already committed → no line',
		lots: [mergeLot({}), PLAIN_LOT],
		committed: 1,
		rehearsal: false,
		expected: undefined,
	},
	{
		title: 'every merge lot with its tree → no line',
		lots: [PLAIN_LOT, mergeLot({ tree: TREE })],
		committed: 0,
		rehearsal: false,
		expected: undefined,
	},
	{
		title:
			'a rehearsal stopped before its merge lot without a tree → no line: a rehearsal checks no tree',
		lots: [PLAIN_LOT, mergeLot({})],
		committed: 0,
		rehearsal: true,
		expected: undefined,
	},
]

describe('mergeTreeLineOf', () => {
	for (const testCase of CASES)
		it(testCase.title, () => {
			expect(
				mergeTreeLineOf({
					lots: testCase.lots,
					committed: testCase.committed,
					rehearsal: testCase.rehearsal,
				})?.detail,
			).toBe(testCase.expected)
		})
})
