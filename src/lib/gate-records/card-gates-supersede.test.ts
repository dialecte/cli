/**
 * What lets a hook record supersede the gate records of another tree, on the card's gate lines: only a record that ran
 * against what is installed now (the worktree's own records included, not only the stored ones of other worktrees),
 * and the words it leaves on the lines it superseded say nothing of a merge when the hand-over is none.
 */
import {
	GATE_STEPS,
	GATE_TIME,
	MERGED_TREE_WORDS,
	NEWER_TIME,
} from '../../../test/merge-card-fixture.constants.ts'
import {
	mergeFixture,
	writeOwnGateRecord,
	writeOwnHookRecord,
} from '../../../test/merge-card-fixture.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { buildCardGateLines } from './card-gates.ts'
import { computeStateTree } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

describe('buildCardGateLines: what a hook record supersedes', () => {
	it(
		"the worktree's own hook record of the merged tree made against another install (not what is installed now) → it supersedes nothing: no line from the hook, no line saying not run on the merged tree",
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, mergedTree, ownTree } = await mergeFixture()
			writeOwnGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeOwnHookRecord({ root, tree: mergedTree, at: NEWER_TIME, foreignInstall: true })

			const lines = buildCardGateLines({ root, tree: mergedTree })
			const details = lines.map((line) => line.detail)

			expect(details.filter((detail) => detail.includes('commit hook'))).toEqual([])
			expect(details.filter((detail) => detail.includes('not run on the merged tree'))).toEqual([])
			// the gate record's steps stay on the card, whatever the foreign hook record held
			expect(lines.map((line) => line.name)).toEqual(
				expect.arrayContaining(GATE_STEPS.map((step) => step.name)),
			)
		},
	)

	it(
		'a hand-over that merges nothing, a gate record of the tree before an edit and a hook record of the tree now → a line the hook did not run does not say the tree was merged',
		{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
		async () => {
			const { root, ownTree } = await mergeFixture()
			writeOwnGateRecord({ root, tree: ownTree, at: GATE_TIME })
			writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })
			const editedTree = computeStateTree(root)
			writeOwnHookRecord({ root, tree: editedTree, at: NEWER_TIME })

			const lines = buildCardGateLines({ root, tree: editedTree })

			expect(lines.map((line) => line.name)).toContain('skills')
			expect(
				lines.filter((line) => line.detail.includes(MERGED_TREE_WORDS)).map((line) => line.name),
			).toEqual([])
		},
	)
})
