/** The base of the change contrib hands its type-bench step, and only that step: a commit, never anything else. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { addWorktreeFolder, linkLot } from '../../../test/lot-stores.ts'
import { WIRED_DEFAULT_SCRIPTS } from '../../../test/rule-gaps-unwired.constants.ts'
import { commitFiles } from '../../../test/rules-lot-worktree.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { SOURCE_FILE, SOURCE_TEXT } from '../../../test/scratch-contrib.constants.ts'
import { createContribPackage } from '../../../test/scratch-contrib.ts'
import { git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { shellQuote } from '../shell-quote.ts'
import { runContrib } from './run-contrib.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const LOT_NAME = '0092-demo-contrib'

/** Where each step writes the change base it was given (`unset` when none): the type bench's and the docs'. */
type SeenFiles = { bench: string; docs: string }

function seenFilesOf(): SeenFiles {
	const folder = temporaryFolder('dialecte-seen-')
	return { bench: join(folder, 'bench'), docs: join(folder, 'docs') }
}

/** The default steps' scripts, each writing the change base it sees. */
function scriptsOf(seen: SeenFiles): Record<string, string> {
	return {
		...WIRED_DEFAULT_SCRIPTS,
		'type-bench:check': `printf '%s' "\${DIALECTE_CHANGE_BASE-unset}" > ${shellQuote(seen.bench)}`,
		'doc:build': `printf '%s' "\${DIALECTE_CHANGE_BASE-unset}" > ${shellQuote(seen.docs)}`,
	}
}

function readSeen(seen: SeenFiles): SeenFiles {
	return { bench: readFileSync(seen.bench, 'utf8'), docs: readFileSync(seen.docs, 'utf8') }
}

/** A contributor package in the worktree of a store lot cut from main's tip, one commit on its branch; the lot base. */
function contribLotWorktree(seen: SeenFiles): { root: string; lotBase: string } {
	const workspace = createBriefWorkspace()
	commitFiles({
		root: workspace.repository,
		files: {
			'package.json': `${JSON.stringify({ name: 'demo', scripts: scriptsOf(seen), dialecte: { profile: 'contributor' } })}\n`,
			'.gitignore': 'node_modules\n',
			[SOURCE_FILE]: SOURCE_TEXT,
		},
		message: 'chore: package',
	})
	const lotBase = git({ root: workspace.repository, args: ['rev-parse', 'HEAD'] }).trim()
	const root = addWorktreeFolder({ workspace, folderName: LOT_NAME })
	commitFiles({ root, files: { 'src/b.ts': 'export {}\n' }, message: 'feat: the change' })
	const lotFolder = writeStoreLot({
		workspace,
		name: LOT_NAME,
		scope: ['src/'],
		repository: workspace.repository,
		base: { ref: 'main', commit: lotBase },
	})
	linkLot({ worktree: root, lotFolder })
	return { root, lotBase }
}

afterEach(() => {
	vi.unstubAllEnvs()
})

describe(
	'dialecte contrib: the change base of the type-bench step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("in a lot worktree → the type-bench step gets the lot's base commit; the docs step does not", async () => {
			const seen = seenFilesOf()
			const { root, lotBase } = contribLotWorktree(seen)

			await expect(
				runContrib({ cwd: root, argv: ['--no-reuse'] }).then(function seenBases() {
					return readSeen(seen)
				}),
			).resolves.toEqual({ bench: lotBase, docs: 'unset' })
		})

		it('a handed commit → the type-bench step alone gets it; a handed empty tree → no step gets anything', async () => {
			const seen = seenFilesOf()
			const root = createContribPackage({ packageJson: { scripts: scriptsOf(seen) } })
			const commit = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
			const emptyTree = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

			await expect(
				runContrib({ cwd: root, argv: ['--no-reuse'], changeBase: commit })
					.then(function seenWithCommit() {
						return readSeen(seen)
					})
					.then(async function andWithEmptyTree(withCommit) {
						await runContrib({ cwd: root, argv: ['--no-reuse'], changeBase: emptyTree })
						return { withCommit, withEmptyTree: readSeen(seen) }
					}),
			).resolves.toEqual({
				withCommit: { bench: commit, docs: 'unset' },
				withEmptyTree: { bench: 'unset', docs: 'unset' },
			})
		})
	},
)
