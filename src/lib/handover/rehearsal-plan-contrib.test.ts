/** `planRehearsal` for a contributor: whether the lot's tree needs a `dialecte contrib` run in the clone. */

import {
	createBranchToMerge,
	editedPackage,
	writeMergeHandoverWithTree,
	writeProfileHandover,
} from '../../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { readFolder, writeHandoverFolder } from '../../../test/scratch-checks.ts'
import { runContribIn } from '../../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { planRehearsal } from './rehearsal-plan.ts'

import { describe, expect, it } from 'vitest'

describe(
	'planRehearsal: the contrib run of a contributor',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a plain lot whose tree has a green contrib record → no contrib run in its decision', async () => {
			const root = editedPackage({ steps: [] })
			await runContribIn({ cwd: root })
			const out = writeProfileHandover({ root })

			expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
				expect.not.objectContaining({ contrib: 'run' }),
			])
		})

		it('a plain lot whose tree has no contrib record → a contrib run in its decision', () => {
			const root = editedPackage({ steps: [] })
			const out = writeProfileHandover({ root })

			expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
				expect.objectContaining({ lot: 1, contrib: 'run' }),
			])
		})

		it('a merge lot whose merged tree has no contrib record (the worktree’s own tree has one) → a contrib run in its decision', async () => {
			const { root, tip, tree } = createBranchToMerge({})
			await runContribIn({ cwd: root })
			const out = writeMergeHandoverWithTree({ root, tip, tree })

			expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
				expect.objectContaining({ lot: 1, tree, contrib: 'run' }),
			])
		})

		it('a consumer’s lot → no contrib run in its decision', () => {
			const root = editedPackage({ profile: null })
			const out = writeProfileHandover({ root })

			expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
				expect.not.objectContaining({ contrib: 'run' }),
			])
		})

		it('a resumed hand-over (one lot committed, HEAD past the lots file’s head) with a green contrib record keyed at that head → the last lot asks no contrib run', async () => {
			const root = editedPackage({ steps: [] })
			writeFiles({ root, files: { 'docs/notes.md': 'notes\n' } })
			await runContribIn({ cwd: root })
			const out = writeHandoverFolder({
				root,
				lots: [
					{ paths: ['src/'], message: 'feat(a): first' },
					{ paths: ['docs/'], message: 'docs(notes): notes' },
				],
			}).out
			git({ root, args: ['add', '--', 'src/'] })
			git({ root, args: ['commit', '-q', '-m', 'feat(a): first'] })

			expect(planRehearsal({ handover: readFolder(out), full: false }).at(-1)).toEqual(
				expect.not.objectContaining({ contrib: 'run' }),
			)
		})
	},
)
