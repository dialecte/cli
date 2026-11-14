import { realpathSync } from 'node:fs'

import { deadPid } from '../../../test/dead-pid.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_LOCK_FILE,
	HANDOVER_RUN_MARKER_FILE,
	REHEARSAL_MARKER_FILE,
} from '../handover/handover.constants.ts'
import { processStartTime } from '../process-start-time.ts'
import { NO_CONFIGURED_BASE_BRANCH } from './gate-base.constants.ts'
import { hasScopedStep, resolveGateBase } from './gate-base.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'

/** Commits an empty change with `message` on the current branch; the new commit's sha. */
function commitOn(params: { root: string; message: string }): string {
	git({ root: params.root, args: ['commit', '-q', '--allow-empty', '-m', params.message] })
	return headOf(params.root)
}

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The tree id git gives the empty tree. */
function emptyTreeOf(root: string): string {
	return git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()
}

/**
 * A repository: `start` on main, then `main` moved on by `moved`, and a branch `feature` from `start` holding
 * `first` and `second` (HEAD is `second`, on `feature`). The merge-base of HEAD and main is `start`.
 */
function divergedRepository(): {
	root: string
	start: string
	moved: string
	first: string
	second: string
} {
	const root = createScratchRepository()
	const start = headOf(root)
	const moved = commitOn({ root, message: 'chore: main moves on' })
	git({ root, args: ['checkout', '-q', '-b', 'feature', start] })
	const first = commitOn({ root, message: 'feat: first' })
	const second = commitOn({ root, message: 'feat: second' })
	return { root, start, moved, first, second }
}

/** A hand-over folder with the repository's lock naming it and a run marker naming `pid`. */
function startRun(params: { root: string; pid: number; lockedAs?: 'real' }): string {
	const folder = temporaryFolder('dialecte-handover-')
	writeFiles({ root: folder, files: { [COMMIT_SCRIPT_FILE]: '#!/bin/sh\nexit 0\n' } })
	const lockedFolder = params.lockedAs === 'real' ? realpathSync(folder) : folder
	writeFiles({
		root: params.root,
		files: { [`.git/${HANDOVER_LOCK_FILE}`]: `${lockedFolder}/${COMMIT_SCRIPT_FILE}\n` },
	})
	writeFiles({
		root: folder,
		files: {
			[HANDOVER_RUN_MARKER_FILE]: `${JSON.stringify({ pid: params.pid, startedAt: '2026-11-08T10:00:00.000Z' })}\n`,
		},
	})
	return folder
}

/** A rehearsal clone's marker naming a new hand-over folder (by its real path) with the owner's pid and start time; the folder. */
function markCloneRun(params: { root: string; pid: number }): string {
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	writeFiles({
		root: params.root,
		files: {
			[`.git/${REHEARSAL_MARKER_FILE}`]: `${JSON.stringify({ pid: params.pid, startedAt: '2026-11-08T10:00:00.000Z', handover: folder, startTime: processStartTime(params.pid) })}\n`,
		},
	})
	return folder
}

/** An orphan branch `name` with one commit and nothing in common with the others; HEAD is back where it was. */
function addOrphanBranch(params: { root: string; name: string }): string {
	const previous = git({ root: params.root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
	git({ root: params.root, args: ['checkout', '-q', '--orphan', params.name] })
	const tip = commitOn({ root: params.root, message: `chore: ${params.name} root` })
	git({ root: params.root, args: ['checkout', '-q', previous] })
	return tip
}

describe('resolveGateBase rule 1: --base <ref>', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a ref given → the merge-base of HEAD and the ref, source flag', () => {
		const { root, start } = divergedRepository()

		expect(resolveGateBase({ root, ref: 'main' })).toEqual({ commit: start, source: 'flag' })
	})

	it('a ref with no merge-base with HEAD but a commit → that commit, source flag', () => {
		const { root } = divergedRepository()
		const tip = addOrphanBranch({ root, name: 'unrelated' })

		expect(resolveGateBase({ root, ref: 'unrelated' })).toEqual({ commit: tip, source: 'flag' })
	})

	it('a ref naming a tree, not a commit → a refusal naming the ref', () => {
		const { root } = divergedRepository()

		expect(resolveGateBase({ root, ref: 'HEAD^{tree}' })).toEqual({
			refusal: '--base HEAD^{tree}: no such commit',
		})
	})

	it('a ref that names no commit → a refusal naming the ref', () => {
		const { root } = divergedRepository()

		expect(resolveGateBase({ root, ref: 'no-such-ref' })).toEqual({
			refusal: '--base no-such-ref: no such commit',
		})
	})

	it('a ref and a live hand-over base together → the ref wins, nothing said about the hand-over', () => {
		const { root, start, first } = divergedRepository()
		const folder = startRun({ root, pid: process.pid })

		expect(resolveGateBase({ root, ref: 'main', handoverBase: { commit: first, folder } })).toEqual(
			{ commit: start, source: 'flag' },
		)
	})
})

describe(
	'resolveGateBase rule 2: the hand-over base',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a live run of that folder, a base that is an ancestor of HEAD and of the base branch → honoured, source handover', () => {
			const { root, start } = divergedRepository()
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: start,
				source: 'handover',
			})
		})

		it('HEAD on the base branch itself, the base an ancestor of both → honoured, source handover', () => {
			const root = createScratchRepository()
			const start = headOf(root)
			commitOn({ root, message: 'chore: first commit' })
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: start,
				source: 'handover',
			})
		})

		it('a base equal to HEAD and to the base branch tip → honoured, source handover', () => {
			const root = createScratchRepository()
			const head = headOf(root)
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: head, folder } })).toEqual({
				commit: head,
				source: 'handover',
			})
		})

		it('A1: a base that is no ancestor of HEAD → ignored, the base branch answers, the reason names HEAD', () => {
			const { root, start, moved } = divergedRepository()
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: moved, folder } })).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/not an ancestor of HEAD/),
			})
		})

		it('A1b: a base that is an ancestor of HEAD, newer than the merge-base → ignored, the reason names the base branch', () => {
			const { root, start, first } = divergedRepository()
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: first, folder } })).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/not an ancestor of the base branch/),
			})
		})

		it('A1c: no live run (no lock at all) → ignored, the reason says no live hand-over run', () => {
			const { root, start } = divergedRepository()
			const folder = temporaryFolder('dialecte-handover-')

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/no live hand-over run/),
			})
		})

		it('A1c: a leftover marker with a dead pid → ignored, the reason says no live hand-over run', () => {
			const { root, start } = divergedRepository()
			const folder = startRun({ root, pid: deadPid() })

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/no live hand-over run/),
			})
		})

		it('A1c: a live run of another folder → ignored, the reason names the live folder and the given one', () => {
			const { root, start } = divergedRepository()
			startRun({ root, pid: process.pid })
			const otherFolder = temporaryFolder('dialecte-handover-')

			expect(
				resolveGateBase({ root, handoverBase: { commit: start, folder: otherFolder } }),
			).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/the live hand-over run is .+, not .+/),
			})
		})

		it('the lock written through a symlinked spelling, the folder given as its real path → honoured', () => {
			const { root, start } = divergedRepository()
			const folder = startRun({ root, pid: process.pid })

			expect(
				resolveGateBase({ root, handoverBase: { commit: start, folder: realpathSync(folder) } }),
			).toEqual({ commit: start, source: 'handover' })
		})

		it('the lock written with the real path, the folder given through a symlinked spelling → honoured', () => {
			const { root, start } = divergedRepository()
			const folder = startRun({ root, pid: process.pid, lockedAs: 'real' })

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: start,
				source: 'handover',
			})
		})

		it.each([
			{ label: 'an unknown full sha', value: () => 'a'.repeat(40) },
			{
				label: 'a tree id',
				value: (root: string) => git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim(),
			},
			{
				label: 'a blob id',
				value: (root: string) => git({ root, args: ['rev-parse', 'HEAD:README.md'] }).trim(),
			},
			{ label: 'a non-hex string', value: () => 'z'.repeat(40) },
			{ label: 'a short sha', value: (root: string) => headOf(root).slice(0, 12) },
			{ label: 'a ref name', value: () => 'main' },
		])('a hand-over base that is $label → ignored with a reason, never a throw', ({ value }) => {
			const { root, start } = divergedRepository()
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: value(root), folder } })).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/not a full commit id/),
			})
		})

		it('a base failing both ancestry checks (an orphan commit) → the HEAD check is reported first', () => {
			const { root, start } = divergedRepository()
			const orphan = addOrphanBranch({ root, name: 'unrelated' })
			const folder = startRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: orphan, folder } })).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/not an ancestor of HEAD/),
			})
		})

		it('a live run of that folder but no base branch at all → ignored (no base branch to check against), then the empty tree with both the reason and the note', () => {
			const { root, start } = divergedRepository()
			const folder = startRun({ root, pid: process.pid })
			git({ root, args: ['branch', '-q', '-D', 'main'] })

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: emptyTreeOf(root),
				source: 'none',
				note: 'no base branch main: everything selected',
				ignored: expect.stringMatching(/no base branch to check against/),
			})
		})

		it('in a rehearsal clone (only origin/main), a live marker naming the folder and a base equal to the merge-base → honoured', () => {
			const { root, start } = divergedRepository()
			git({ root, args: ['update-ref', 'refs/remotes/origin/main', start] })
			git({ root, args: ['branch', '-q', '-D', 'main'] })
			const folder = markCloneRun({ root, pid: process.pid })

			expect(resolveGateBase({ root, handoverBase: { commit: start, folder } })).toEqual({
				commit: start,
				source: 'handover',
			})
		})

		it('in a rehearsal clone, a live marker naming another folder → ignored, the reason names both folders', () => {
			const { root, start } = divergedRepository()
			git({ root, args: ['update-ref', 'refs/remotes/origin/main', start] })
			git({ root, args: ['branch', '-q', '-D', 'main'] })
			markCloneRun({ root, pid: process.pid })
			const otherFolder = temporaryFolder('dialecte-handover-')

			expect(
				resolveGateBase({ root, handoverBase: { commit: start, folder: otherFolder } }),
			).toEqual({
				commit: start,
				source: 'base-branch',
				ignored: expect.stringMatching(/the live hand-over run is .+, not .+/),
			})
		})

		it('no hand-over base given → the base branch answers and nothing is said ignored', () => {
			const { root, start } = divergedRepository()

			expect(resolveGateBase({ root })).toEqual({ commit: start, source: 'base-branch' })
		})
	},
)

describe('resolveGateBase rule 3: the base branch', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('main exists → the merge-base of HEAD and main, source base-branch', () => {
		const { root, start } = divergedRepository()

		expect(resolveGateBase({ root })).toEqual({ commit: start, source: 'base-branch' })
	})

	it('dialecte.baseBranch names another branch → the merge-base with that branch', () => {
		const { root, first } = divergedRepository()
		git({ root, args: ['branch', 'develop', first] })
		writeFiles({
			root,
			files: { 'package.json': '{"name":"x","dialecte":{"baseBranch":"develop"}}\n' },
		})

		expect(resolveGateBase({ root })).toEqual({ commit: first, source: 'base-branch' })
	})

	it('a local branch and an origin one of that name → the local one is used', () => {
		const { root, start, first } = divergedRepository()
		git({ root, args: ['update-ref', 'refs/remotes/origin/main', start] })
		git({ root, args: ['update-ref', 'refs/heads/main', first] })

		expect(resolveGateBase({ root })).toEqual({ commit: first, source: 'base-branch' })
	})

	it('A14: only origin/main exists (a rehearsal clone) → the merge-base with origin/main, source base-branch', () => {
		const { root, start } = divergedRepository()
		git({ root, args: ['update-ref', 'refs/remotes/origin/main', start] })
		git({ root, args: ['branch', '-q', '-D', 'main'] })

		expect(resolveGateBase({ root })).toEqual({ commit: start, source: 'base-branch' })
	})

	it('origin/main ahead of the branch point → the merge-base is still the common ancestor', () => {
		const { root, start, moved } = divergedRepository()
		git({ root, args: ['update-ref', 'refs/remotes/origin/main', moved] })
		git({ root, args: ['branch', '-q', '-D', 'main'] })

		expect(resolveGateBase({ root })).toEqual({ commit: start, source: 'base-branch' })
	})
})

describe('resolveGateBase rule 4: no base', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('A14b: no main branch, local or origin → the empty tree, source none, the note names the branch', () => {
		const { root } = divergedRepository()
		git({ root, args: ['branch', '-q', '-D', 'main'] })

		expect(resolveGateBase({ root })).toEqual({
			commit: emptyTreeOf(root),
			source: 'none',
			note: 'no base branch main: everything selected',
		})
	})

	it('B6: dialecte.baseBranch names a branch that does not exist → a refusal naming that branch and dialecte.baseBranch, no fall-through', () => {
		const { root } = divergedRepository()
		writeFiles({
			root,
			files: { 'package.json': '{"name":"x","dialecte":{"baseBranch":"develop"}}\n' },
		})

		expect(resolveGateBase({ root })).toEqual({
			refusal: NO_CONFIGURED_BASE_BRANCH.replace('{branch}', 'develop'),
		})
	})

	it('A15: the base branch shares no commit with HEAD → the empty tree, source none, the note names the branch', () => {
		const { root } = divergedRepository()
		addOrphanBranch({ root, name: 'island' })
		git({ root, args: ['checkout', '-q', 'island'] })

		expect(resolveGateBase({ root })).toEqual({
			commit: emptyTreeOf(root),
			source: 'none',
			note: 'no base branch main: everything selected',
		})
	})

	it('the empty tree id is the one git computes (never a hard-coded id)', () => {
		const { root } = divergedRepository()
		git({ root, args: ['branch', '-q', '-D', 'main'] })

		expect(resolveGateBase({ root })).toMatchObject({ commit: emptyTreeOf(root) })
	})
})

describe('hasScopedStep', () => {
	const SCOPED = {
		name: 'tests',
		run: 'npm run test:scoped',
		counts: 'tests' as const,
		scoped: true,
	}
	const PLAIN = { name: 'check', run: 'npm run check' }

	function gatePackage(gate: unknown): PackageJson {
		return { dialecte: { gate } } as PackageJson
	}

	it.each([
		{
			label: 'no dialecte.gate (the default lists hold a scoped rules step)',
			packageJson: {},
			expected: true,
		},
		{
			label: 'plain steps in every list',
			packageJson: gatePackage({ fast: [PLAIN], full: [PLAIN], release: [PLAIN] }),
			expected: false,
		},
		{
			label:
				'scoped: false and heavy only, no fast list (the default fast list holds a scoped rules step)',
			packageJson: gatePackage({ full: [{ ...PLAIN, scoped: false, heavy: true }] }),
			expected: true,
		},
		{
			label: 'a scoped step in fast',
			packageJson: gatePackage({ fast: [SCOPED] }),
			expected: true,
		},
		{
			label: 'a scoped step in full',
			packageJson: gatePackage({ full: [PLAIN, SCOPED] }),
			expected: true,
		},
		{
			label: 'a scoped step in release only',
			packageJson: gatePackage({ full: [PLAIN], release: [SCOPED] }),
			expected: true,
		},
	])('$label → $expected', ({ packageJson, expected }) => {
		expect(hasScopedStep(packageJson)).toBe(expected)
	})
})
