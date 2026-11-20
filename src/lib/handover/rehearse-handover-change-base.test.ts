/**
 * A rehearsal hands contrib's type-bench step the base of the change: the tip its last merge lot merges; with no merge
 * lot and no scoped gate step, the lot base its repository resolves; with none at all, the row is not run, never
 * measured against the clone's order.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { WIRED_DEFAULT_SCRIPTS } from '../../../test/rule-gaps-unwired.constants.ts'
import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { runFolder, writeHandoverFolder, writeMergeHandover } from '../../../test/scratch-checks.ts'
import { createContribPackage } from '../../../test/scratch-contrib.ts'
import { git, temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { shellQuote } from '../shell-quote.ts'

import { describe, expect, it } from 'vitest'

const LOT_BRANCH = 'feat/lot'
const LOT_FILE = 'src/c.ts'
const PLAIN_STEPS = [{ name: 'plain', run: 'true' }]

/** A contributor package on main with plain gate lists (no scoped step), whose type-bench script writes the change base it sees to `seen`. */
function seenPackage(seen: string): string {
	return createContribPackage({
		gateFast: PLAIN_STEPS,
		gateFull: PLAIN_STEPS,
		packageJson: {
			scripts: {
				...WIRED_DEFAULT_SCRIPTS,
				'type-bench:check': `printf '%s' "\${DIALECTE_CHANGE_BASE-unset}" > ${shellQuote(seen)}`,
			},
		},
	})
}

/** The package of `seenPackage`, HEAD on the lot branch, one commit off main, the lot's file written; main's tip. */
function lotBranchPackage(seen: string): { root: string; mainTip: string } {
	const root = seenPackage(seen)
	const mainTip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', '-b', LOT_BRANCH] })
	commitFiles({ root, files: { 'src/b.ts': 'export {}\n' }, message: 'feat(b): an earlier lot' })
	writeFiles({ root, files: { [LOT_FILE]: 'export {}\n' } })
	return { root, mainTip }
}

describe(
	'handover run --rehearse: the change base of the type-bench step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a merge lot → the type-bench step gets the tip it merges', async () => {
			const seen = join(temporaryFolder('dialecte-seen-'), 'bench')
			const root = seenPackage(seen)
			git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
			commitFiles({ root, files: { 'src/b.ts': 'export {}\n' }, message: 'feat(b): brought in' })
			const tip = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
			git({ root, args: ['checkout', '-q', 'main'] })
			const { out } = writeMergeHandover({ root, tip })

			await expect(
				runFolder({ out, argv: ['--rehearse'] }).then(function seenBase() {
					return existsSync(seen) ? readFileSync(seen, 'utf8') : 'not run'
				}),
			).resolves.toBe(tip)
		})

		it("no merge lot, no scoped gate step → the type-bench step gets the repository's lot base: main's tip", async () => {
			const seen = join(temporaryFolder('dialecte-seen-'), 'bench')
			const { root, mainTip } = lotBranchPackage(seen)
			const { out } = writeHandoverFolder({
				root,
				branch: LOT_BRANCH,
				lots: [{ paths: [LOT_FILE], message: 'feat(c): the lot' }],
			})

			await expect(
				runFolder({ out, argv: ['--rehearse'] }).then(function seenBase() {
					return existsSync(seen) ? readFileSync(seen, 'utf8') : 'not run'
				}),
			).resolves.toBe(mainTip)
		})

		it('no merge lot, no scoped gate step, no base branch nor tag → the type-bench row is not run, no base to compare with', async () => {
			const seen = join(temporaryFolder('dialecte-seen-'), 'bench')
			const { root } = lotBranchPackage(seen)
			const { out } = writeHandoverFolder({
				root,
				branch: LOT_BRANCH,
				lots: [{ paths: [LOT_FILE], message: 'feat(c): the lot' }],
			})
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })

			await expect(
				runFolder({ out, argv: ['--rehearse'] }).then(function benchRow(run) {
					return {
						ran: existsSync(seen),
						notRun: run.text
							.split('\n')
							.some(
								(line) => line.includes('type-bench') && line.includes('no base to compare with'),
							),
					}
				}),
			).resolves.toEqual({ ran: false, notRun: true })
		})
	},
)
