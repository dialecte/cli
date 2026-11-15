/** `resolveRulesBase`: the lot's recorded base in a lot worktree, else the base branch's merge-base (not HEAD itself), else the last release tag reachable from head, else no base. */
import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { addWorktreeFolder, linkLot } from '../../test/lot-stores.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../test/scratch-repository.ts'
import { resolveRulesBase } from './rules-base.ts'

import { describe, expect, it } from 'vitest'

const LOT_NAME = '0100-repo-rules-base'

/** A commit holding `file` with `text` on the current branch of `root`; its id. */
function commitFile(params: { root: string; file: string; text: string }): string {
	const { root } = params
	writeFiles({ root, files: { [params.file]: params.text } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', `chore: ${params.file}`] })
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

const PACKAGE_NAME = 'demo-package'

/** A repository with no base branch (`main` renamed) holding a package named `PACKAGE_NAME`, `release` tags on its history: the commit of `<PACKAGE_NAME>@v0.2.0` and a tag of another package on a later commit; HEAD after both. */
function releaseHistory(): { root: string; releaseCommit: string } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
	})
	git({ root, args: ['branch', '-m', 'main', 'trunk'] })
	git({ root, args: ['tag', `${PACKAGE_NAME}@v0.1.0`] })
	commitFile({ root, file: 'a.txt', text: 'a\n' })
	const releaseCommit = commitFile({ root, file: 'b.txt', text: 'b\n' })
	git({ root, args: ['tag', `${PACKAGE_NAME}@v0.2.0`] })
	commitFile({ root, file: 'c.txt', text: 'c\n' })
	git({ root, args: ['tag', 'other-package@v9.0.0'] })
	commitFile({ root, file: 'd.txt', text: 'd\n' })
	return { root, releaseCommit }
}

type Fixture = {
	root: string
	head?: string
	emptyTreeRequest?: boolean
	expected: string | undefined
}

type TestCase = { setup: () => Fixture }

const CASES: Record<string, TestCase> = {
	"a store lot's worktree → the lot's recorded base commit, even when the base branch moved on": {
		setup() {
			const workspace = createBriefWorkspace()
			const recorded = workspace.commit
			commitFile({ root: workspace.repository, file: 'a.txt', text: 'a\n' })
			const worktree = addWorktreeFolder({ workspace, folderName: LOT_NAME })
			const lotFolder = writeStoreLot({
				workspace,
				name: LOT_NAME,
				scope: ['src/'],
				worktree,
				base: { ref: 'main', commit: recorded },
			})
			linkLot({ worktree, lotFolder })
			commitFile({ root: workspace.repository, file: 'b.txt', text: 'b\n' })
			return { root: worktree, expected: recorded }
		},
	},
	'no store lot, a branch from main → the merge-base with main': {
		setup() {
			const root = createScratchRepository({ 'a.txt': 'a\n' })
			const mergeBase = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
			git({ root, args: ['checkout', '-q', '-b', 'feat/work'] })
			commitFile({ root, file: 'b.txt', text: 'b\n' })
			return { root, expected: mergeBase }
		},
	},
	'no store lot, no base branch anywhere → undefined': {
		setup() {
			const root = createScratchRepository({ 'a.txt': 'a\n' })
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })
			commitFile({ root, file: 'b.txt', text: 'b\n' })
			return { root, expected: undefined }
		},
	},
	'head given → the merge-base at that head': {
		setup() {
			const root = createScratchRepository({ 'a.txt': 'a\n' })
			git({ root, args: ['checkout', '-q', '-b', 'feat/early'] })
			const early = commitFile({ root, file: 'b.txt', text: 'b\n' })
			commitFile({ root, file: 'c.txt', text: 'c\n' })
			git({ root, args: ['checkout', '-q', 'main'] })
			const mainTip = commitFile({ root, file: 'd.txt', text: 'd\n' })
			// HEAD stays on a branch of main's tip: its own merge-base is another commit than the one at `early`
			git({ root, args: ['checkout', '-q', '-b', 'feat/late'] })
			return {
				root,
				head: early,
				expected: git({ root, args: ['merge-base', early, mainTip] }).trim(),
			}
		},
	},
	"no store lot, no base branch, release tags of the package → the commit of its last release tag, another package's tag ignored":
		{
			setup() {
				const { root, releaseCommit } = releaseHistory()
				return { root, expected: releaseCommit }
			},
		},
	"HEAD on main, a release tag on history, no empty-tree request → HEAD's commit (the merge-base, as the gate)":
		{
			setup() {
				const root = createScratchRepository({
					'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
				})
				commitFile({ root, file: 'a.txt', text: 'a\n' })
				git({ root, args: ['tag', `${PACKAGE_NAME}@v0.1.0`] })
				const headCommit = commitFile({ root, file: 'b.txt', text: 'b\n' })
				return { root, expected: headCommit }
			},
		},
	'HEAD on main, a release tag, an empty-tree request → the commit of that tag': {
		setup() {
			const root = createScratchRepository({
				'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
			})
			const releaseCommit = commitFile({ root, file: 'a.txt', text: 'a\n' })
			git({ root, args: ['tag', `${PACKAGE_NAME}@v0.1.0`] })
			commitFile({ root, file: 'b.txt', text: 'b\n' })
			return { root, emptyTreeRequest: true, expected: releaseCommit }
		},
	},
	"HEAD detached at main's tip, a release tag, an empty-tree request → the commit of that tag": {
		setup() {
			const root = createScratchRepository({
				'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
			})
			const releaseCommit = commitFile({ root, file: 'a.txt', text: 'a\n' })
			git({ root, args: ['tag', `${PACKAGE_NAME}@v0.1.0`] })
			commitFile({ root, file: 'b.txt', text: 'b\n' })
			git({ root, args: ['checkout', '-q', '--detach', 'main'] })
			return { root, emptyTreeRequest: true, expected: releaseCommit }
		},
	},
	'head given, a later release tag after it → the tag reachable from head, not the later one': {
		setup() {
			const root = createScratchRepository({
				'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
			})
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })
			const earlyRelease = commitFile({ root, file: 'a.txt', text: 'a\n' })
			git({ root, args: ['tag', `${PACKAGE_NAME}@v0.1.0`] })
			const head = commitFile({ root, file: 'b.txt', text: 'b\n' })
			commitFile({ root, file: 'c.txt', text: 'c\n' })
			git({ root, args: ['tag', `${PACKAGE_NAME}@v0.2.0`] })
			return { root, head, expected: earlyRelease }
		},
	},
	'no store lot, no base branch, no release tag → undefined': {
		setup() {
			const root = createScratchRepository({
				'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
			})
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })
			commitFile({ root, file: 'b.txt', text: 'b\n' })
			git({ root, args: ['tag', 'other-package@v1.0.0'] })
			return { root, expected: undefined }
		},
	},
}

describe('resolveRulesBase', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each(Object.entries(CASES))('%s', (_title, { setup }) => {
		const { root, head, emptyTreeRequest, expected } = setup()

		expect(
			resolveRulesBase({
				root,
				...(head !== undefined && { head }),
				...(emptyTreeRequest !== undefined && { emptyTreeRequest }),
			}),
		).toBe(expected)
	})
})
