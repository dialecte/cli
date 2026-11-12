/**
 * `targetMoved`: the target branch's tip held (by the lots file's head or the tip of a merge lot), moved past the
 * hand-over, or not judged, on scratch repositories whose branches are moved by commits.
 */
import { addOriginBranch, pointOriginHeadAt } from '../../../test/rule-gaps-base-branch.ts'
import {
	commitPlainLot,
	mergeBranchHere,
	moveBranchTip,
	targetScenario,
	withMergeLot,
} from '../../../test/rule-gaps-target-moved.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { targetMoved } from './target-moved.ts'

import { describe, expect, it } from 'vitest'

import type { TargetRow } from '../../../test/rule-gaps-target-moved.types.ts'
import type { TargetVerdict } from './handover.types.ts'

const HELD_MAIN: TargetVerdict = { kind: 'held', branch: 'main', ref: 'refs/heads/main' }
const SKIPPED: TargetVerdict = { kind: 'skip' }

/** The verdict of a target `branch` (a local branch) that moved `behind` commits to `tip`. */
function movedVerdict(params: {
	branch: string
	tip: string
	behind: number
	resuming?: boolean
}): TargetVerdict {
	return {
		kind: 'moved',
		branch: params.branch,
		ref: `refs/heads/${params.branch}`,
		tip: params.tip,
		behind: params.behind,
		resuming: params.resuming ?? false,
	}
}

const ROWS: TargetRow[] = [
	{
		title:
			'T1 main moved two commits past the head, no merge lot → moved, behind 2, the target tip and its ref',
		arrange({ root, lotsFile }) {
			const tip = moveBranchTip({ root, branch: 'main', count: 2 })
			return { lotsFile, expected: movedVerdict({ branch: 'main', tip, behind: 2 }) }
		},
	},
	{
		title: 'T2 a merge lot of main at the tip of main → held',
		arrange({ root, lotsFile }) {
			const tip = moveBranchTip({ root, branch: 'main' })
			return {
				lotsFile: withMergeLot({ lotsFile, branch: 'main', tip }),
				expected: HELD_MAIN,
			}
		},
	},
	{
		title:
			'T3 a merge lot of an older main (one commit behind the tip of main) → moved, behind 1 (the commits after the merged tip)',
		arrange({ root, lotsFile }) {
			const older = moveBranchTip({ root, branch: 'main' })
			const tip = moveBranchTip({ root, branch: 'main' })
			return {
				lotsFile: withMergeLot({ lotsFile, branch: 'main', tip: older }),
				expected: movedVerdict({ branch: 'main', tip, behind: 1 }),
			}
		},
	},
	{
		title:
			'T4 main moves twice more after the merge lot was reviewed → moved, behind 2, the tip of main',
		arrange({ root, lotsFile }) {
			const merged = moveBranchTip({ root, branch: 'main' })
			const tip = moveBranchTip({ root, branch: 'main', count: 2 })
			return {
				lotsFile: withMergeLot({ lotsFile, branch: 'main', tip: merged }),
				expected: movedVerdict({ branch: 'main', tip, behind: 2 }),
			}
		},
	},
	{
		title:
			'T4 the checked-out branch holds main through a merge but the lots file head does not → moved, judged on the lots file head',
		arrange({ root, lotsFile }) {
			const tip = moveBranchTip({ root, branch: 'main' })
			mergeBranchHere({ root, branch: 'main' })
			return { lotsFile, expected: movedVerdict({ branch: 'main', tip, behind: 1 }) }
		},
	},
	{
		title: 'T5 main rewound to an ancestor of the head → held',
		arrange({ root, start, lotsFile }) {
			const ahead = moveBranchTip({ root, branch: 'main' })
			git({ root, args: ['update-ref', 'refs/heads/main', start] })
			return { lotsFile: { ...lotsFile, head: ahead }, expected: HELD_MAIN }
		},
	},
	{
		title: 'T6 the head already holds main through a merge commit → held',
		arrange({ root, lotsFile }) {
			moveBranchTip({ root, branch: 'main' })
			const merged = mergeBranchHere({ root, branch: 'main' })
			return { lotsFile: { ...lotsFile, head: merged }, expected: HELD_MAIN }
		},
	},
	{
		title: 'T7 the lots go on main itself, main moved → skip (the head guard covers it)',
		arrange({ root, lotsFile }) {
			moveBranchTip({ root, branch: 'main' })
			return { lotsFile: { ...lotsFile, branch: 'main' }, expected: SKIPPED }
		},
	},
	{
		title:
			'T8 only origin/main exists and its tip is not held → moved, judged on the ref and the tip of origin',
		arrange({ root, lotsFile }) {
			const tip = moveBranchTip({ root, branch: 'main' })
			addOriginBranch({ root, branch: 'main', at: 'refs/heads/main' })
			git({ root, args: ['branch', '-q', '-D', 'main'] })
			return {
				lotsFile,
				expected: {
					kind: 'moved',
					branch: 'main',
					ref: 'refs/remotes/origin/main',
					tip,
					behind: 1,
					resuming: false,
				},
			}
		},
	},
	{
		title: 'T9 local main held, origin/main ahead and not held → held, the local ref judged',
		arrange({ root, start, lotsFile }) {
			moveBranchTip({ root, branch: 'main' })
			addOriginBranch({ root, branch: 'main', at: 'refs/heads/main' })
			git({ root, args: ['update-ref', 'refs/heads/main', start] })
			return { lotsFile, expected: HELD_MAIN }
		},
	},
	{
		title:
			'T10 no main, no master, no origin/HEAD, nothing configured → missing, the refusal names dialecte.baseBranch',
		arrange({ root, lotsFile }) {
			git({ root, args: ['branch', '-q', '-m', 'main', 'work'] })
			return {
				lotsFile,
				expected: { kind: 'missing', refusal: expect.stringContaining('dialecte.baseBranch') },
			}
		},
	},
	{
		title:
			'T11 dialecte.baseBranch develop, develop moved and main did not → moved on develop, not held through main',
		arrange({ root, lotsFile }) {
			git({ root, args: ['branch', '-q', 'develop'] })
			const tip = moveBranchTip({ root, branch: 'develop' })
			return {
				lotsFile,
				packageJson: { dialecte: { baseBranch: 'develop' } },
				expected: movedVerdict({ branch: 'develop', tip, behind: 1 }),
			}
		},
	},
	{
		title:
			'T11 dialecte.baseBranch develop, main moved and develop did not → held on develop, main is not judged',
		arrange({ root, lotsFile }) {
			git({ root, args: ['branch', '-q', 'develop'] })
			moveBranchTip({ root, branch: 'main' })
			return {
				lotsFile,
				packageJson: { dialecte: { baseBranch: 'develop' } },
				expected: { kind: 'held', branch: 'develop', ref: 'refs/heads/develop' },
			}
		},
	},
	{
		title: 'T12 a DONE hand-over, main moved → skip',
		arrange({ root, lotsFile }) {
			moveBranchTip({ root, branch: 'main' })
			return { lotsFile, done: true, expected: SKIPPED }
		},
	},
	{
		title: 'T12 an ABANDONED hand-over, main moved → skip',
		arrange({ root, lotsFile }) {
			moveBranchTip({ root, branch: 'main' })
			return { lotsFile, abandoned: true, expected: SKIPPED }
		},
	},
	{
		title:
			'T16 the first of two lots committed, main moved since → moved, behind 1, resuming (only a new hand-over can hold main)',
		arrange({ root, lotsFile }) {
			commitPlainLot({ root, lot: 'first' })
			const tip = moveBranchTip({ root, branch: 'main' })
			return {
				lotsFile,
				committed: 1,
				expected: movedVerdict({ branch: 'main', tip, behind: 1, resuming: true }),
			}
		},
	},
	{
		title: 'T17 both lots committed, main moved since → skip (nothing left to commit)',
		arrange({ root, lotsFile }) {
			commitPlainLot({ root, lot: 'first' })
			commitPlainLot({ root, lot: 'second' })
			moveBranchTip({ root, branch: 'main' })
			return { lotsFile, committed: 2, expected: SKIPPED }
		},
	},
	{
		title: 'T18 target release/1.x, main moves and release/1.x does not → held on release/1.x',
		arrange({ root, lotsFile }) {
			git({ root, args: ['branch', '-q', 'release/1.x'] })
			moveBranchTip({ root, branch: 'main' })
			return {
				lotsFile: { ...lotsFile, target: 'release/1.x' },
				expected: { kind: 'held', branch: 'release/1.x', ref: 'refs/heads/release/1.x' },
			}
		},
	},
	{
		title: 'T18 target release/1.x, release/1.x moves → moved on release/1.x',
		arrange({ root, lotsFile }) {
			git({ root, args: ['branch', '-q', 'release/1.x'] })
			const tip = moveBranchTip({ root, branch: 'release/1.x' })
			return {
				lotsFile: { ...lotsFile, target: 'release/1.x' },
				expected: movedVerdict({ branch: 'release/1.x', tip, behind: 1 }),
			}
		},
	},
	{
		title:
			'T18 target nope, a branch with no local and no origin ref → missing, the refusal names nope, main is not judged instead',
		arrange({ root, lotsFile }) {
			moveBranchTip({ root, branch: 'main' })
			return {
				lotsFile: { ...lotsFile, target: 'nope' },
				expected: { kind: 'missing', refusal: expect.stringContaining('nope') },
			}
		},
	},
	{
		title:
			'T21 no target in the lots file, origin/HEAD names develop and develop moved → moved on develop, the resolved base branch',
		arrange({ root, lotsFile }) {
			git({ root, args: ['branch', '-q', 'develop'] })
			const tip = moveBranchTip({ root, branch: 'develop' })
			addOriginBranch({ root, branch: 'develop', at: 'refs/heads/develop' })
			pointOriginHeadAt({ root, branch: 'develop' })
			return { lotsFile, expected: movedVerdict({ branch: 'develop', tip, behind: 1 }) }
		},
	},
]

describe('targetMoved', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const row of ROWS) {
		it(row.title, () => {
			const scenario = targetScenario()
			const arranged = row.arrange(scenario)

			expect(
				targetMoved({
					root: scenario.root,
					lotsFile: arranged.lotsFile,
					packageJson: arranged.packageJson ?? {},
					committed: arranged.committed ?? 0,
					...(arranged.done && { done: true }),
					...(arranged.abandoned && { abandoned: true }),
				}),
			).toEqual(arranged.expected)
		})
	}
})
