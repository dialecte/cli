/**
 * A merge as a hand-over lot. At the write: git can make a trial merge (2.38 or later), the tip the lot
 * reviewed is still the branch's, every conflict of the trial merge (`git merge-tree`, which touches no
 * working tree) has a resolution and none is a symlink or a submodule, every resolution exists and holds no
 * conflict marker, and no file the merge changes has working-tree changes outside the resolutions and the
 * files earlier lots commit; the conflicts, each resolution's hash and the tree the merge was trial-merged
 * on are recorded. The trial merge is made on what the lots before it leave (`trial-base.ts`), not on HEAD.
 * A resolution may cover a file that merges cleanly (the lot changes it on top of the merge), or be `null`
 * (the merge removes the file).
 *
 * At the run: HEAD's tree is the one the merge was trial-merged on, then the merge of the recorded tip with
 * those resolutions, checked, ready to commit (`runMergeLot`); a marker in the git folder says this cli holds
 * the merge in progress.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { listChangedFiles, readGit } from '../git.ts'
import {
	BINARY_PROBE_LENGTH,
	CONFLICT_MARKER_PATTERN,
	MERGE_LOT_GIT_VERSION,
	MERGE_MARKER_FILE,
	UNRESOLVABLE_MODES,
} from './handover.constants.ts'
import { addMerge } from './trial-base.ts'
import { hashFile } from './write-handover.ts'

import type {
	MergeLot,
	MergeLotPlan,
	MergeResolution,
	TrialBase,
	TrialMerge,
} from './handover.types.ts'

/** Why git cannot make merge lots (a version before 2.38), or undefined when it can. */
export function refuseOldGit(versionLine: string): string | undefined {
	const [major = 0, minor = 0] = (/(\d+)\.(\d+)/.exec(versionLine) ?? []).slice(1).map(Number)
	const [needMajor, needMinor] = MERGE_LOT_GIT_VERSION
	return major > needMajor || (major === needMajor && minor >= needMinor)
		? undefined
		: `git ${needMajor}.${needMinor} or later needed for merge lots (the trial merge), found ${versionLine.trim()}`
}

/**
 * The merge lot as recorded, every reason the write is refused, and what it leaves for the lots after it
 * (undefined when there is no trial merge: no such branch).
 */
export function planMergeLot(params: {
	root: string
	lot: MergeLotPlan
	/** 1-based, for the refusals. */
	number: number
	/** The lots file: resolution files are relative to its folder. */
	lotsPath: string
	/** What the lots before it leave: the merge is trial-merged on it. */
	base: TrialBase
	/** The files earlier plain lots commit: their working-tree changes are in `base` already. */
	earlierFiles: ReadonlySet<string>
}): { merge: MergeLot; refusals: string[]; leaves?: TrialBase } {
	const { root, lot, number } = params
	const refusals: string[] = []
	const tip = commitOf({ root, revision: lot.tip }) ?? lot.tip
	const branchTip = commitOf({ root, revision: lot.branch })
	if (!branchTip) refusals.push(`merge lot ${number}: no branch or tag ${lot.branch} in ${root}`)
	else if (branchTip !== tip)
		refusals.push(
			`merge lot ${number}: ${lot.branch} moved: it is at ${branchTip.slice(0, 12)}, the lot reviewed its tip ${lot.tip.slice(0, 12)}`,
		)
	const resolutions = Object.entries(lot.resolved)
		.sort(([left], [right]) => left.localeCompare(right))
		.flatMap(function resolutionOf([path, relative]): MergeResolution[] {
			if (relative === null) return [{ path, removed: true }]
			const file = isAbsolute(relative) ? relative : join(dirname(params.lotsPath), relative)
			if (!existsSync(file)) {
				refusals.push(`merge lot ${number}: the resolution ${relative} of ${path} does not exist`)
				return []
			}
			if (CONFLICT_MARKER_PATTERN.test(readFileSync(file, 'utf8')))
				refusals.push(
					`merge lot ${number}: conflict markers in ${relative}, the resolution of ${path}`,
				)
			return [{ path, file, sha256: hashFile(file) }]
		})
	const trial = branchTip ? trialMerge({ root, base: params.base.commit, tip }) : undefined
	for (const conflict of trial?.conflicts ?? []) {
		if (!(conflict in lot.resolved))
			refusals.push(`merge lot ${number}: the conflict in ${conflict} has no resolution`)
		for (const mode of trial?.modes.get(conflict) ?? [])
			if (UNRESOLVABLE_MODES[mode])
				refusals.push(
					`merge lot ${number}: the conflict in ${conflict} is a ${UNRESOLVABLE_MODES[mode]}: a hand-over cannot resolve it from a file, merge it by hand`,
				)
	}
	if (trial) {
		// a working-tree change of a file the merge changes would be taken in by the merge commit, unless an
		// earlier lot commits it
		const merged = new Set(
			listNul({ root, args: ['diff', '--name-only', '-z', params.base.tree, trial.tree] }),
		)
		for (const file of listChangedFiles({ root, withDeleted: true }))
			if (merged.has(file) && !(file in lot.resolved) && !params.earlierFiles.has(file))
				refusals.push(
					`merge lot ${number}: ${file} has working-tree changes and the merge changes it too: commit it in a lot after the merge's hand-over, or resolve it in the lot`,
				)
	}
	return {
		merge: {
			branch: lot.branch,
			tip,
			...(lot.tree && { tree: lot.tree }),
			onTree: params.base.tree,
			conflicts: [...new Set(trial?.conflicts ?? [])].sort(),
			resolutions,
		},
		refusals,
		...(trial && {
			leaves: addMerge({ root, base: params.base, tip, tree: trial.tree, resolutions }),
		}),
	}
}

/**
 * A merge of `tip` into the commit `base` made without a working tree: the tree, the conflicting paths and
 * their modes.
 */
export function trialMerge(params: { root: string; base: string; tip: string }): TrialMerge {
	const trial = spawnSync(
		'git',
		['merge-tree', '--write-tree', '-z', '--no-messages', params.base, params.tip],
		{ cwd: params.root, encoding: 'utf8' },
	)
	// exit 1: a merge with conflicts; the tree, then `<mode> <object> <stage>\t<path>` entries, NUL-separated
	if (trial.status !== 0 && trial.status !== 1)
		throw new Error(`git merge-tree failed: ${trial.stderr.trim()}`)
	const [tree, ...entries] = trial.stdout.split('\0')
	const modes = new Map<string, Set<string>>()
	for (const entry of entries) {
		const match = /^(\d+) [0-9a-f]+ \d\t(.*)$/s.exec(entry)
		if (!match) break
		const [, mode, path] = match
		modes.set(path, (modes.get(path) ?? new Set()).add(mode))
	}
	return { tree, conflicts: [...modes.keys()].sort(), modes }
}

/**
 * The merge of the recorded tip, made ready to commit: refused before anything when HEAD's tree is not the
 * one the merge was trial-merged on; then `git merge --no-ff --no-commit` (the marker written first), its conflicts as recorded, every resolution copied (hash-checked) or removed and staged, no file
 * left unmerged nor holding a conflict marker, and the staged tree the recorded one. A refusal leaves the
 * merge to `undoMerge`.
 */
export function runMergeLot(params: {
	root: string
	merge: MergeLot
}): { tree: string } | { refusal: string; lines?: string[] } {
	const { root, merge } = params
	const headTree = readGit({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
	if (headTree !== merge.onTree)
		return {
			refusal: `HEAD holds tree ${headTree.slice(0, 12)}, not ${merge.onTree.slice(0, 12)}, the tree the lots before it left when the merge was trial-merged: an earlier lot committed other content (a hook staged files of its own?), nothing merged: see what the lots before it committed (\`git show --stat HEAD\`), then write the hand-over again from this HEAD for the lots left`,
		}
	writeMergeMarker({ root, tip: merge.tip })
	const merged = spawnSync('git', ['merge', '--no-ff', '--no-commit', merge.tip], {
		cwd: root,
		encoding: 'utf8',
	})
	if (!commitOf({ root, revision: 'MERGE_HEAD' }))
		return {
			refusal: `git merge of ${merge.tip.slice(0, 12)} did not start (exit ${merged.status})`,
			lines: `${merged.stdout}${merged.stderr}`.trim().split('\n').slice(-5),
		}
	const conflicts = listNul({ root, args: ['diff', '--name-only', '-z', '--diff-filter=U'] }).sort()
	if (conflicts.join('\n') !== merge.conflicts.join('\n'))
		return {
			refusal: 'the merge conflicts in other files than reviewed',
			lines: [
				`now: ${conflicts.join(', ') || 'none'}`,
				`reviewed: ${merge.conflicts.join(', ') || 'none'}`,
			],
		}
	for (const resolution of merge.resolutions) {
		if ('removed' in resolution) {
			readGit({ root, args: ['rm', '-q', '-f', '--', resolution.path] })
			continue
		}
		if (!existsSync(resolution.file) || hashFile(resolution.file) !== resolution.sha256)
			return {
				refusal: `the resolution of ${resolution.path} changed since the review: ${resolution.file}`,
			}
		const target = join(root, resolution.path)
		mkdirSync(dirname(target), { recursive: true })
		copyFileSync(resolution.file, target)
		readGit({ root, args: ['add', '--', resolution.path] })
	}
	const unmerged = listNul({ root, args: ['diff', '--name-only', '-z', '--diff-filter=U'] })
	if (unmerged.length) return { refusal: 'files left unmerged', lines: unmerged }
	const marked = stagedFilesWithMarkers(root)
	if (marked.length) return { refusal: 'conflict markers left in the merge', lines: marked }
	const tree = readGit({ root, args: ['write-tree'] }).trim()
	if (merge.tree && tree !== merge.tree)
		return {
			refusal: `the merge holds tree ${tree.slice(0, 12)}, not the recorded ${merge.tree.slice(0, 12)}: rehearse again and record its tree after a review`,
		}
	return { tree }
}

/** Puts the repository back as before the merge lot: the merge aborted when one is in progress. */
export function undoMerge(params: { root: string; number: number }): string {
	const { root, number } = params
	const resume = `run the same command: it resumes at lot ${number}`
	if (!commitOf({ root, revision: 'MERGE_HEAD' })) {
		removeMergeMarker(root)
		return `    nothing changed; fix the cause, then ${resume}`
	}
	const aborted = spawnSync('git', ['merge', '--abort'], { cwd: root, encoding: 'utf8' })
	if (aborted.status !== 0)
		return `    git merge --abort failed (${aborted.stderr.trim()}): look at the repository before running again`
	removeMergeMarker(root)
	return `    the merge is aborted, nothing else changed; fix the cause, then ${resume}`
}

/** The tip a run of this cli was merging when it left the merge in progress, if its marker says so. */
export function readMergeMarker(root: string): string | undefined {
	const path = mergeMarkerPath(root)
	if (!existsSync(path)) return undefined
	try {
		return (JSON.parse(readFileSync(path, 'utf8')) as { tip?: string }).tip
	} catch {
		return undefined
	}
}

export function removeMergeMarker(root: string): void {
	rmSync(mergeMarkerPath(root), { force: true })
}

/** The staged files (deleted ones left out) whose content holds a conflict marker. */
export function stagedFilesWithMarkers(root: string): string[] {
	return listNul({
		root,
		args: ['diff', '--cached', '--name-only', '-z', '--diff-filter=d'],
	}).filter(function holdsMarkers(file) {
		const path = join(root, file)
		if (!existsSync(path)) return false
		const text = readFileSync(path)
		// a binary file is never read for markers
		return (
			!text.subarray(0, BINARY_PROBE_LENGTH).includes(0) &&
			CONFLICT_MARKER_PATTERN.test(text.toString('utf8'))
		)
	})
}

/** The full sha of a revision's commit, or undefined when there is none. */
export function commitOf(params: { root: string; revision: string }): string | undefined {
	const result = spawnSync(
		'git',
		['rev-parse', '--verify', '--quiet', `${params.revision}^{commit}`],
		{ cwd: params.root, encoding: 'utf8' },
	)
	return result.status === 0 ? result.stdout.trim() : undefined
}

function writeMergeMarker(params: { root: string; tip: string }): void {
	writeFileSync(
		mergeMarkerPath(params.root),
		`${JSON.stringify({ tip: params.tip, pid: process.pid, startedAt: new Date().toISOString() })}\n`,
	)
}

function mergeMarkerPath(root: string): string {
	return readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-path', MERGE_MARKER_FILE],
	}).trim()
}

/** A git command's NUL-separated paths (`-z`): any path as it is, never quoted. */
function listNul(params: { root: string; args: string[] }): string[] {
	return readGit(params).split('\0').filter(Boolean)
}
