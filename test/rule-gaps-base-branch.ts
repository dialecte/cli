/** Scratch repositories whose base branch is not `main`: refs built with git, for the base-branch resolver and its callers. */
import { join } from 'node:path'

import { git, initializeRepository, temporaryFolder } from './scratch-repository.ts'

import type { DevelopAhead } from './rule-gaps-base-branch.types.ts'

/** Commits an empty change on the current branch; the new commit. */
export function commitEmpty(params: { root: string; message: string }): string {
	git({ root: params.root, args: ['commit', '-q', '--allow-empty', '-m', params.message] })
	return git({ root: params.root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The commit `rev` names in the repository. */
export function commitOf(params: { root: string; rev: string }): string {
	return git({
		root: params.root,
		args: ['rev-parse', '--verify', `${params.rev}^{commit}`],
	}).trim()
}

/** `refs/remotes/origin/<branch>` made to point at `at` (a rev; HEAD by default), as a fetch would leave it. */
export function addOriginBranch(params: { root: string; branch: string; at?: string }): void {
	const tip = commitOf({ root: params.root, rev: params.at ?? 'HEAD' })
	git({ root: params.root, args: ['update-ref', `refs/remotes/origin/${params.branch}`, tip] })
}

/** `refs/remotes/origin/HEAD` made a symbolic ref to origin's `branch`, as a clone leaves it. */
export function pointOriginHeadAt(params: { root: string; branch: string }): void {
	git({
		root: params.root,
		args: ['symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${params.branch}`],
	})
}

/**
 * A repository on `main` (its tip `start`) with a local branch `develop` one commit ahead of it (`develop`), left
 * checked out; `main` stays at `start`. Made in `root` when given (a folder of the test's own), else in a new one.
 */
export function developAheadOfMain(
	params: { root?: string } = {},
): DevelopAhead & { root: string } {
	const root = initializeRepository({
		root: params.root ?? temporaryFolder('dialecte-base-branch-'),
	})
	const start = commitOf({ root, rev: 'HEAD' })
	git({ root, args: ['switch', '-q', '-c', 'develop'] })
	const develop = commitEmpty({ root, message: 'feat: develop moves on' })
	return { root, start, develop }
}

/** Origin's default branch made `develop` in `root`: `origin/develop` at the local `develop` tip and `origin/HEAD` on it. */
export function makeDevelopOriginDefault(root: string): void {
	addOriginBranch({ root, branch: 'develop', at: 'refs/heads/develop' })
	pointOriginHeadAt({ root, branch: 'develop' })
}

/**
 * A clone of a bare origin whose default branch is `develop` (a commit ahead of `main`, which exists there too), holding no local branch:
 * only origin's refs and `origin/HEAD`, as a rehearsal clone does. The clone's path.
 */
export function cloneWithOnlyOriginRefs(): string {
	const folder = temporaryFolder('dialecte-origin-clone-')
	const origin = join(folder, 'origin.git')
	const clone = join(folder, 'clone')
	const source = initializeRepository({ root: join(folder, 'source') })
	git({ root: folder, args: ['init', '-q', '--bare', '-b', 'develop', origin] })
	git({ root: source, args: ['switch', '-q', '-c', 'develop'] })
	commitEmpty({ root: source, message: 'feat: develop moves on' })
	git({ root: source, args: ['push', '-q', origin, 'develop:develop', 'main:main'] })
	git({ root: folder, args: ['clone', '-q', origin, clone] })
	git({ root: clone, args: ['switch', '-q', '--detach'] })
	git({ root: clone, args: ['branch', '-q', '-D', 'develop'] })
	return clone
}
