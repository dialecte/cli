/**
 * The throwaway proof (`proveThrowaway`). Invariant: a review-round throwaway goes only when every path it changed is
 * kept elsewhere (byte, executable bit and link target equal to its round snapshot or to a held commit, its index blob
 * included), its ignored entries are rebuilt or copies, no commit only it holds would be lost, and its HEAD is still on
 * its branch. Each case is a real repository made by the cli's own snapshot and throwaway code, then changed as the
 * case says.
 */
import { chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { commitOnLotBranch, createThrowawayWorkspace } from '../../../test/lot-prune-workspace.ts'
import { git, initializeRepository, writeFiles } from '../../../test/scratch-repository.ts'
import { proveThrowaway } from './throwaway-proof.ts'

import { describe, expect, it } from 'vitest'

import type { ThrowawayWorkspace } from '../../../test/lot-prune-workspace.types.ts'
import type { ThrowawayProof, ThrowawayProofParameters } from './throwaway-proof.types.ts'

/** Real repositories, worktrees and git runs: seconds on a loaded machine, never a measure of speed. */
const PROOF_CASE_TIMEOUT = 60_000

const COMMITTED = {
	'.gitignore': 'node_modules\ncoverage/\n',
	'src/index.ts': 'export {}\n',
	'src/old.ts': 'export const old = 1\n',
}

/** The round's changes in the lot worktree: one tracked file changed, one new. */
const CHANGED = {
	'src/index.ts': 'export const round = 1\n',
	'src/added.ts': 'export const added = 1\n',
}

/** The fix's new test, committed on the lot's branch after the round. */
const FIX_TEST = { 'src/fix.test.ts': 'it("pins the fix", () => {})\n' }

/** A path git reads as a glob pathspec, and the tracked file it matches (sorted before it), holding the same bytes. */
const GLOB_PATH = 'src/[AB].ts'
const GLOB_TWIN = 'src/A.ts'
const GLOB_TEXT = 'export const twin = 1\n'

/** A path git would read as pathspec magic naming `src/index.ts` from the top, unless told to read it literally. */
const MAGIC_PATH = ':(top)src/index.ts'

/** A path git would quote: a space, a quote and a non-ASCII character. */
const QUOTED_PATH = "docs/it's é.md"

/** What a case changes after the throwaway is made, and what it hands the proof beyond its defaults. */
type Arranged = { landedTips?: string[] } | undefined

type ProofCase = {
	title: string
	committed?: Record<string, string>
	changed?: Record<string, string>
	beforeSnapshot?: (lotWorktree: string) => void
	arrange?: (workspace: ThrowawayWorkspace) => Arranged
	proof: ThrowawayProof
}

/** The proof's parameters the way `lot prune` asks it: the lot's branch, its landed tips, then the base as holders. */
function proofParameters(params: {
	workspace: ThrowawayWorkspace
	arranged: Arranged
}): ThrowawayProofParameters {
	const { workspace } = params
	const landedTips = params.arranged?.landedTips ?? []
	return {
		main: workspace.repository,
		throwaway: workspace.throwaway,
		branch: workspace.branch,
		lotFolder: workspace.lotFolder,
		round: workspace.round,
		holders: [`refs/heads/${workspace.lotBranch}`, ...landedTips, 'refs/heads/main'],
		landedTips,
	}
}

/** The fix's test written in the throwaway as the fixer copied it there. */
function copyFixTest(workspace: ThrowawayWorkspace): void {
	writeFiles({ root: workspace.throwaway, files: FIX_TEST })
}

/** The lot's worktree removed and its branch deleted, the throwaway left: the lot's branch no longer resolves. */
function deleteLotBranch(workspace: ThrowawayWorkspace): void {
	git({
		root: workspace.repository,
		args: ['worktree', 'remove', '--force', workspace.lotWorktree],
	})
	git({ root: workspace.repository, args: ['branch', '-D', workspace.lotBranch] })
}

const TREE_CASES: ProofCase[] = [
	{ title: 'a throwaway equal to round-1/', proof: { goes: true } },
	{
		title: "a throwaway holding the fix's new test, equal to the lot's branch tip",
		arrange: function fixLanded(workspace) {
			commitOnLotBranch({ workspace, files: FIX_TEST })
			copyFixTest(workspace)
			return undefined
		},
		proof: { goes: true },
	},
	{
		title: "a throwaway holding the fix's new test, edited after the lot's branch took it",
		arrange: function fixEdited(workspace) {
			commitOnLotBranch({ workspace, files: FIX_TEST })
			writeFiles({
				root: workspace.throwaway,
				files: { 'src/fix.test.ts': 'edited by a reviewer\n' },
			})
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/fix.test.ts' },
	},
	{
		title: 'one extra untracked note',
		arrange: function note(workspace) {
			writeFiles({ root: workspace.throwaway, files: { 'notes.txt': 'a reviewer note\n' } })
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: notes.txt' },
	},
	{
		title: 'no round-1/ snapshot in the lot folder',
		arrange: function noSnapshot(workspace) {
			rmSync(join(workspace.lotFolder, 'round-1'), { recursive: true, force: true })
			return undefined
		},
		proof: { goes: false, kept: 'no round-1/ snapshot: the throwaway holds the only copy' },
	},
	{
		title: 'the same bytes with another executable bit',
		arrange: function executable(workspace) {
			chmodSync(join(workspace.throwaway, 'src/added.ts'), 0o755)
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/added.ts' },
	},
	{
		title: 'a staged blob differing from the snapshot while the working file equals it',
		arrange: function staged(workspace) {
			const path = join(workspace.throwaway, 'src/added.ts')
			const snapshot = readFileSync(path)
			writeFileSync(path, 'only the index holds this\n')
			git({ root: workspace.throwaway, args: ['add', 'src/added.ts'] })
			writeFileSync(path, snapshot)
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/added.ts' },
	},
	{
		title:
			'a staged blob differing from the snapshot, its path a glob that matches a tracked file holding the snapshot bytes',
		committed: { ...COMMITTED, [GLOB_TWIN]: GLOB_TEXT },
		changed: { ...CHANGED, [GLOB_PATH]: GLOB_TEXT },
		arrange: function stagedGlob(workspace) {
			const path = join(workspace.throwaway, GLOB_PATH)
			writeFileSync(path, 'only the index holds this\n')
			git({ root: workspace.throwaway, args: ['--literal-pathspecs', 'add', GLOB_PATH] })
			writeFileSync(path, GLOB_TEXT)
			return undefined
		},
		proof: { goes: false, kept: `round-1 differs: 1 path(s), first: ${GLOB_PATH}` },
	},
	{
		title:
			'a path named like pathspec magic, holding the bytes of the file the magic would name at the base',
		changed: { ...CHANGED, [MAGIC_PATH]: 'a round note\n' },
		arrange: function magic(workspace) {
			writeFiles({ root: workspace.throwaway, files: { [MAGIC_PATH]: COMMITTED['src/index.ts'] } })
			return undefined
		},
		proof: { goes: false, kept: `round-1 differs: 1 path(s), first: ${MAGIC_PATH}` },
	},
]

const COMMIT_CASES: ProofCase[] = [
	{
		title: 'a commit on the throwaway branch (the branch survives and holds it)',
		arrange: function committed(workspace) {
			git({ root: workspace.throwaway, args: ['add', '-A'] })
			git({ root: workspace.throwaway, args: ['commit', '-q', '-m', 'review: tried a fix'] })
			return undefined
		},
		proof: { goes: true },
	},
	{
		title: 'a throwaway switched to another branch',
		arrange: function switched(workspace) {
			git({ root: workspace.throwaway, args: ['checkout', '-q', '-b', 'other'] })
			return undefined
		},
		proof: { goes: false, kept: 'HEAD is not on feat/fix-round-1: other' },
	},
	{
		title: 'a rename record, both paths kept (the new one snapshot, the old one listed deleted)',
		beforeSnapshot: function rename(lotWorktree) {
			git({ root: lotWorktree, args: ['mv', 'src/old.ts', 'src/new.ts'] })
		},
		arrange: function staged(workspace) {
			git({ root: workspace.throwaway, args: ['add', '-A'] })
			return undefined
		},
		proof: { goes: true },
	},
	{
		title: 'a rename record whose old path the snapshot does not list deleted',
		beforeSnapshot: function rename(lotWorktree) {
			git({ root: lotWorktree, args: ['mv', 'src/old.ts', 'src/new.ts'] })
		},
		arrange: function unlisted(workspace) {
			git({ root: workspace.throwaway, args: ['add', '-A'] })
			writeFileSync(join(workspace.lotFolder, 'round-1.deleted'), '')
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/old.ts' },
	},
	{
		title: "the lot's branch deleted, the fix's test held by the landed tip",
		arrange: function landed(workspace) {
			const tip = commitOnLotBranch({ workspace, files: FIX_TEST })
			copyFixTest(workspace)
			deleteLotBranch(workspace)
			return { landedTips: [tip] }
		},
		proof: { goes: true },
	},
	{
		title: "the lot's branch deleted, no landed tip holding the fix's test",
		arrange: function notLanded(workspace) {
			commitOnLotBranch({ workspace, files: FIX_TEST })
			copyFixTest(workspace)
			deleteLotBranch(workspace)
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/fix.test.ts' },
	},
	{
		title: 'a path held only by the base tip (main took the fix another way)',
		arrange: function onMain(workspace) {
			writeFiles({ root: workspace.repository, files: FIX_TEST })
			git({ root: workspace.repository, args: ['add', 'src/fix.test.ts'] })
			git({ root: workspace.repository, args: ['commit', '-q', '-m', 'fix: on main'] })
			copyFixTest(workspace)
			return undefined
		},
		proof: { goes: true },
	},
	{
		title: 'a link equal to the snapshot (the same target)',
		beforeSnapshot: function link(lotWorktree) {
			symlinkSync('index.ts', join(lotWorktree, 'src/link.ts'))
		},
		proof: { goes: true },
	},
	{
		title: 'a link whose target differs from the snapshot',
		beforeSnapshot: function link(lotWorktree) {
			symlinkSync('index.ts', join(lotWorktree, 'src/link.ts'))
		},
		arrange: function retarget(workspace) {
			const link = join(workspace.throwaway, 'src/link.ts')
			rmSync(link)
			symlinkSync('added.ts', link)
			return undefined
		},
		proof: { goes: false, kept: 'round-1 differs: 1 path(s), first: src/link.ts' },
	},
	{
		title: 'a path with a space, a quote and a non-ASCII character, equal to the snapshot',
		changed: { ...CHANGED, [QUOTED_PATH]: 'quoted\n' },
		proof: { goes: true },
	},
	{
		title: 'a path with a space, a quote and a non-ASCII character, edited',
		changed: { ...CHANGED, [QUOTED_PATH]: 'quoted\n' },
		arrange: function edited(workspace) {
			writeFiles({ root: workspace.throwaway, files: { [QUOTED_PATH]: 'edited\n' } })
			return undefined
		},
		proof: { goes: false, kept: `round-1 differs: 1 path(s), first: ${QUOTED_PATH}` },
	},
]

const IGNORED_AND_HIDDEN_CASES: ProofCase[] = [
	{
		title: 'a coverage/ folder the package does not declare rebuilt',
		arrange: function coverage(workspace) {
			writeFiles({ root: workspace.throwaway, files: { 'coverage/index.html': '<p>run</p>\n' } })
			return undefined
		},
		proof: {
			goes: false,
			kept: 'ignored files git worktree remove would delete: coverage/index.html',
		},
	},
	{
		title: 'a coverage/ folder the package declares rebuilt',
		committed: {
			...COMMITTED,
			'package.json': `${JSON.stringify({ name: 'repo', dialecte: { rebuiltIgnored: ['coverage/'] } })}\n`,
		},
		arrange: function coverage(workspace) {
			writeFiles({ root: workspace.throwaway, files: { 'coverage/index.html': '<p>run</p>\n' } })
			return undefined
		},
		proof: { goes: true },
	},
	{
		title: 'a submodule entry (gitlink) in the index',
		arrange: function gitlink(workspace) {
			const head = git({ root: workspace.throwaway, args: ['rev-parse', 'HEAD'] }).trim()
			git({
				root: workspace.throwaway,
				args: ['update-index', '--add', '--cacheinfo', `160000,${head},vendor/sub`],
			})
			return undefined
		},
		proof: { goes: false, kept: 'a submodule entry git status does not compare: vendor/sub' },
	},
	{
		title: 'a tracked path marked assume-unchanged, left as it is',
		arrange: function hidden(workspace) {
			git({ root: workspace.throwaway, args: ['update-index', '--assume-unchanged', 'src/old.ts'] })
			return undefined
		},
		proof: { goes: false, kept: '1 path(s) hidden from git status, first: src/old.ts' },
	},
	{
		title: 'a round path marked skip-worktree, then edited',
		arrange: function hidden(workspace) {
			git({ root: workspace.throwaway, args: ['update-index', '--skip-worktree', 'src/index.ts'] })
			writeFiles({ root: workspace.throwaway, files: { 'src/index.ts': 'hidden edit\n' } })
			return undefined
		},
		proof: { goes: false, kept: '1 path(s) hidden from git status, first: src/index.ts' },
	},
	{
		title: 'an untracked embedded repository',
		arrange: function embedded(workspace) {
			initializeRepository({
				root: join(workspace.throwaway, 'vendor/embedded'),
				files: { 'inside.txt': 'git status never descends here\n' },
			})
			return undefined
		},
		proof: {
			goes: false,
			kept: 'an untracked folder git status does not look into: vendor/embedded/',
		},
	},
]

for (const [title, cases] of [
	['the throwaway proof: its tree against round-1/ and the held commits', TREE_CASES],
	['the throwaway proof: its commits, its branch and the holders', COMMIT_CASES],
	['the throwaway proof: what git status hides or ignores', IGNORED_AND_HIDDEN_CASES],
] as const)
	describe(title, { timeout: PROOF_CASE_TIMEOUT }, () => {
		for (const proofCase of cases)
			it(`${proofCase.title} → ${proofCase.proof.goes ? 'goes' : 'kept'}`, () => {
				const workspace = createThrowawayWorkspace({
					committed: proofCase.committed ?? COMMITTED,
					changed: proofCase.changed ?? CHANGED,
					beforeSnapshot: proofCase.beforeSnapshot,
				})
				const arranged = proofCase.arrange?.(workspace)

				expect(proveThrowaway(proofParameters({ workspace, arranged }))).toEqual(proofCase.proof)
			})
	})

describe(
	'the throwaway proof: a commit only a HEAD reflog holds',
	{ timeout: PROOF_CASE_TIMEOUT },
	() => {
		it('a commit on a detached HEAD, then switched back to the throwaway branch → kept, the commit named', () => {
			const workspace = createThrowawayWorkspace({ committed: COMMITTED, changed: CHANGED })
			const root = workspace.throwaway
			git({ root, args: ['checkout', '-q', '--detach'] })
			writeFiles({ root, files: { 'detached.txt': 'only a HEAD reflog holds this\n' } })
			git({ root, args: ['add', 'detached.txt'] })
			git({ root, args: ['commit', '-q', '-m', 'review: on a detached HEAD'] })
			const detached = git({ root, args: ['rev-parse', '--short=12', 'HEAD'] }).trim()
			git({ root, args: ['checkout', '-q', workspace.branch] })

			expect(proveThrowaway(proofParameters({ workspace, arranged: undefined }))).toEqual({
				goes: false,
				kept: `1 commit(s) its removal would lose: ${detached}`,
			})
		})
	},
)
