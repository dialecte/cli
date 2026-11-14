/**
 * `handover run --rehearse`: the contrib row of the rehearsal judges against the base the real `dialecte contrib`
 * judges against, so a line main brings in is no error of the lots, and a line the lot branch already held is one.
 */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { runFolder, writeHandoverFolder, writeMergeHandover } from '../../test/scratch-checks.ts'
import { createContribPackage } from '../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

const FILE = 'src/lib/a.ts'
const CLEAN_TEXT = [
	'export function size(items: string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')
const MUTATING_TEXT = [
	CLEAN_TEXT,
	'export function fill(target: string[]) {',
	"\ttarget.push('a')",
	'}',
	'',
].join('\n')
const MUTATION_LINE = 6
const EDITED_TEXT = MUTATING_TEXT.replace('items.length', 'items.length + 0')
const LOT_BRANCH = 'feat/lot'

/** The lines of the run that are the rehearsal's contrib row, the mark first. */
function contribRowOf(text: string): string[] {
	return text.split('\n').filter((line) => /^[!✓✗] rehearsal contrib\b/.test(line))
}

describe(
	'handover run --rehearse: the base contrib judges against',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a merge lot bringing in a main that holds an argument mutation the lot did not write → the rehearsal contrib row passes', async () => {
			const root = createContribPackage({ steps: [], files: { [FILE]: CLEAN_TEXT } })
			git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
			writeFiles({ root, files: { [FILE]: MUTATING_TEXT } })
			git({ root, args: ['commit', '-q', '-am', 'feat(a): main brings a line'] })
			const tip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
			git({ root, args: ['checkout', '-q', 'main'] })
			const { out } = writeMergeHandover({ root, tip })

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(contribRowOf(run.text)).toEqual([expect.stringMatching(/^✓ rehearsal contrib\b/)])
		})

		it('no merge lot, an earlier commit of the lot branch holds an argument mutation, the lot edits another line → the rehearsal contrib row fails naming that line', async () => {
			const root = createContribPackage({ steps: [], files: { [FILE]: CLEAN_TEXT } })
			git({ root, args: ['checkout', '-q', '-b', LOT_BRANCH] })
			writeFiles({ root, files: { [FILE]: MUTATING_TEXT } })
			git({ root, args: ['commit', '-q', '-am', 'feat(a): an earlier lot'] })
			writeFiles({ root, files: { [FILE]: EDITED_TEXT } })
			const { out } = writeHandoverFolder({
				root,
				branch: LOT_BRANCH,
				lots: [{ paths: [FILE], message: 'feat(a): the lot' }],
			})

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(contribRowOf(run.text)).toEqual([expect.stringMatching(/^✗ rehearsal contrib\b/)])
			expect(run.text).toContain(`first: ${FILE}:${MUTATION_LINE}:`)
		})

		it('no merge lot, main holds an argument mutation before the lot branch starts, the lot edits another line → the rehearsal contrib row passes and the line is no finding of this change', async () => {
			const root = createContribPackage({ steps: [], files: { [FILE]: MUTATING_TEXT } })
			git({ root, args: ['checkout', '-q', '-b', LOT_BRANCH] })
			writeFiles({ root, files: { [FILE]: EDITED_TEXT } })
			const { out } = writeHandoverFolder({
				root,
				branch: LOT_BRANCH,
				lots: [{ paths: [FILE], message: 'feat(a): the lot' }],
			})

			const run = await runFolder({ out, argv: ['--rehearse'] })

			expect(contribRowOf(run.text)).toEqual([expect.stringMatching(/^✓ rehearsal contrib\b/)])
			const warning = run.text
				.split('\n')
				.find((line) => line.includes(`${FILE}:${MUTATION_LINE}:`))
			expect(warning?.trimEnd()).toMatch(/ warning .*\(not added by this change\)$/)
		})
	},
)
