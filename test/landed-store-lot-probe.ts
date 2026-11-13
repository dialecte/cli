/** Scratch repositories for the git probe of a landed lot: `main` plus the lot's branch, in the state a shape says. */
import { LANDED_BRANCH as BRANCH, LANDED_LOT } from './landed-store-lot-workspace.constants.ts'
import { createScratchRepository, git, isolateGitConfig, writeFiles } from './scratch-repository.ts'
import { entryOf, identityOf } from './store-records.ts'

import type { ProbeScene, ProbeShape } from './landed-store-lot-probe.types.ts'

/**
 * A repository on `main` (one commit, the lot's base) and the branch `feat/lookups` made from it, in `shape`. The
 * caller restores the environment (`vi.unstubAllEnvs`).
 */
export function createProbeScene(shape: ProbeShape): ProbeScene {
	isolateGitConfig()
	const root = createScratchRepository()
	let base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['branch', BRANCH] })
	if (shape === 'behind-base') {
		// `main` moves on and the lot's base is that later commit: the branch tip stays on the earlier one
		writeFiles({ root, files: { 'src/main-side.ts': 'export {}\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: main moves on'] })
		base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	}
	if (shape !== 'no-commit' && shape !== 'behind-base') commitOnBranch({ root })
	if (shape === 'merge-commit') {
		writeFiles({ root, files: { 'src/main-side.ts': 'export {}\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: main moves on'] })
	}
	if (['fast-forward', 'branch-gone', 'only-trunk'].includes(shape))
		git({ root, args: ['merge', '-q', '--ff-only', BRANCH] })
	if (shape === 'merge-commit')
		git({ root, args: ['merge', '-q', '--no-ff', '-m', 'merge: the lot', BRANCH] })
	if (shape === 'release-only') git({ root, args: ['branch', 'release', BRANCH] })
	if (shape === 'branch-gone') git({ root, args: ['branch', '-d', BRANCH] })
	if (shape === 'only-trunk') renameBranch({ root, from: 'main', to: 'trunk' })
	return {
		root,
		identity: {
			...identityOf({ name: LANDED_LOT }),
			branch: BRANCH,
			base: { ref: 'main', commit: base },
		},
		entry: { ...entryOf({ state: 'committed', folder: '/handovers/one' }), name: 'one' },
		packageJson: shape === 'release-only' ? { dialecte: { baseBranch: 'release' } } : {},
	}
}

/** Renames the branch `from` to `to`. */
export function renameBranch(params: { root: string; from: string; to: string }): void {
	git({ root: params.root, args: ['branch', '-m', params.from, params.to] })
}

/** One commit on the lot's branch, made without leaving `main` (a throwaway worktree-free checkout and back). */
function commitOnBranch(params: { root: string }): void {
	const { root } = params
	git({ root, args: ['switch', '-q', BRANCH] })
	writeFiles({ root, files: { 'src/lookups.ts': 'export const lookups = 1\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat: lookups'] })
	git({ root, args: ['switch', '-q', 'main'] })
}
