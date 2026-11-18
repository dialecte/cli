/**
 * The released-changelog rule: a released section of `CHANGELOG.md` the change altered, judged against the base
 * branch (or the release base a rehearsal hands its hooks) and where the change left it, is an error.
 */
import {
	CHANGELOG_FILE,
	NO_BLOB,
	RELEASED_CHANGELOG_LINES,
} from '../changelog/changelog.constants.ts'
import { releasedSectionChanges } from '../changelog/released-sections.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { baseBranchMergeBaseOf, findBaseBranchRef } from '../gate/gate-base.ts'
import { RELEASE_BASE_VARIABLE } from '../gate/selection.constants.ts'
import { readFilesAtRevision, tryReadGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { checkedTextOf } from './changelog-edit.ts'

import type {
	ReleaseBase,
	ReleaseBaseRead,
	ReleaseChangelog,
	ReleasedSectionChange,
	ReleasedSectionTexts,
} from '../changelog/changelog.types.ts'
import type { RuleFinding } from './check-code-rules.types.ts'

/**
 * The findings of `CHANGELOG.md` when it is among `files`: one per released section the change altered; none, with
 * the line saying why, when no release base is found.
 *
 * @intent keep a released changelog section as released
 * @internal
 */
export function checkReleasedChangelog(params: {
	root: string
	files: readonly string[]
	/** The tree the gate checks (`DIALECTE_GATE_TREE`): its `CHANGELOG.md` is the checked text. */
	tree?: string
	environment: Readonly<NodeJS.ProcessEnv>
}): { findings: RuleFinding[]; notJudged?: string } {
	const { root } = params
	if (!params.files.includes(CHANGELOG_FILE)) return { findings: [] }
	const read = resolveReleaseBase({ root, environment: params.environment })
	if ('notJudged' in read) return { findings: [], notJudged: read.notJudged }
	const texts = releasedTextsOf({
		root,
		base: read.base,
		threeWay: true,
		...(params.tree !== undefined && { tree: params.tree }),
	})
	const findings = releasedSectionChanges(texts).map(function findingOf(change): RuleFinding {
		return {
			file: CHANGELOG_FILE,
			line: change.line,
			column: 1,
			rule: 'released-changelog',
			severity: 'error',
			message: releasedChangeMessage({ change, base: read.base.name }),
		}
	})
	return { findings }
}

/**
 * The release base of the package at `root`: the commit `DIALECTE_RELEASE_BASE` names (a rehearsal's hooks), named by
 * its short id; else the base branch, named by its name; else the line saying nothing is judged.
 *
 * @intent find what released changelog sections are judged against, one order for every reader
 * @internal
 */
export function resolveReleaseBase(params: {
	root: string
	environment: Readonly<NodeJS.ProcessEnv>
}): ReleaseBaseRead {
	const { root } = params
	const given = params.environment[RELEASE_BASE_VARIABLE]
	if (given) {
		const commit = verifiedCommitOf({ root, revision: given })
		return commit === undefined
			? { notJudged: RELEASED_CHANGELOG_LINES.unknownBase.replace('{value}', () => given) }
			: { base: { commit, name: commit.slice(0, SHORT_SHA_LENGTH) } }
	}
	const base = baseBranchReleaseOf({ root })
	return base === undefined ? { notJudged: RELEASED_CHANGELOG_LINES.notJudged } : { base }
}

/**
 * The base branch of the package at `root` as a release base: its commit, named by the branch; undefined when none is
 * found.
 *
 * @intent find the base branch released changelog sections are judged against
 * @internal
 */
export function baseBranchReleaseOf(params: { root: string }): ReleaseBase | undefined {
	const { root } = params
	const found = findBaseBranchRef({ root, packageJson: readPackageJson(root) })
	if ('refusal' in found) return undefined
	const commit = verifiedCommitOf({ root, revision: found.ref })
	return commit === undefined ? undefined : { commit, name: found.branch }
}

/**
 * The blob ids of the `CHANGELOG.md` the release base `releaseBase` holds and of the one where `head` left it
 * (`none` when absent, or with no release base): what a released-section verdict read of git.
 *
 * @intent key a recorded released-section verdict on what it judged against
 * @internal
 */
export function releaseChangelogOf(params: {
	root: string
	releaseBase: string | null
	head: string
}): ReleaseChangelog {
	const { root, releaseBase } = params
	if (releaseBase === null) return { tip: NO_BLOB, mergeBase: NO_BLOB }
	const mergeBase = baseBranchMergeBaseOf({ root, head: params.head, ref: releaseBase })
	return {
		tip: changelogBlobAt({ root, revision: releaseBase }),
		mergeBase: mergeBase === undefined ? NO_BLOB : changelogBlobAt({ root, revision: mergeBase }),
	}
}

/**
 * The full id of the commit `revision` names in the repository at `root`; undefined when it names none.
 *
 * @intent tell a revision the repository holds from one it does not, before reading a file at it
 * @internal
 */
export function verifiedCommitOf(params: { root: string; revision: string }): string | undefined {
	return (
		tryReadGit({
			root: params.root,
			args: ['rev-parse', '--verify', '--quiet', `${params.revision}^{commit}`],
		})?.trim() || undefined
	)
}

/**
 * The three `CHANGELOG.md` texts the verdict reads: the checked state (`tree`, else the working file), the base's,
 * and (three-way) the merge-base of HEAD and the base's.
 *
 * @intent read the changelog texts a released-section verdict compares
 * @internal
 */
export function releasedTextsOf(params: {
	root: string
	base: ReleaseBase
	threeWay: boolean
	tree?: string
}): ReleasedSectionTexts {
	const { root, base } = params
	const checked = checkedTextOf({
		root,
		file: CHANGELOG_FILE,
		...(params.tree !== undefined && { tree: params.tree }),
	})
	const tip = changelogAt({ root, revision: base.commit })
	if (!params.threeWay) return { checked, tip }
	const mergeBase = baseBranchMergeBaseOf({ root, head: 'HEAD', ref: base.commit })
	// a merge-base without the file is a commit before it: it holds no section (empty), unlike no merge-base at all
	return {
		checked,
		tip,
		mergeBase:
			mergeBase === undefined ? undefined : (changelogAt({ root, revision: mergeBase }) ?? ''),
	}
}

/**
 * The line of one released-section change, naming the base.
 *
 * @intent word a released-section finding the same way in rules, contrib and changelog check
 * @internal
 */
export function releasedChangeMessage(params: {
	change: ReleasedSectionChange
	base: string
}): string {
	const { change } = params
	const filled = {
		changed: RELEASED_CHANGELOG_LINES.changed,
		removed: RELEASED_CHANGELOG_LINES.removed,
		duplicated: RELEASED_CHANGELOG_LINES.duplicated,
	}[change.kind]
		.replace('{version}', () => change.version)
		.replace('{base}', () => params.base)
	return change.kind === 'changed' ? filled.replace('{what}', () => whatOf({ change })) : filled
}

/** The blob id of the `CHANGELOG.md` `revision` holds at the package's path; `none` when it holds none. */
function changelogBlobAt(params: { root: string; revision: string }): string {
	return (
		tryReadGit({
			root: params.root,
			args: ['rev-parse', '--verify', '--quiet', `${params.revision}:./${CHANGELOG_FILE}`],
		})?.trim() || NO_BLOB
	)
}

/** The `CHANGELOG.md` text `revision` holds at the package's path; undefined when it holds none. */
function changelogAt(params: { root: string; revision: string }): string | undefined {
	return readFilesAtRevision({ ...params, files: [CHANGELOG_FILE] }).get(CHANGELOG_FILE)
}

/** How a changed section differs: its lines added and removed, or reordered. */
function whatOf(params: { change: Extract<ReleasedSectionChange, { kind: 'changed' }> }): string {
	const { added, removed, reordered } = params.change
	if (reordered) return RELEASED_CHANGELOG_LINES.reordered
	const parts = [
		...(added > 0
			? [
					(added === 1
						? RELEASED_CHANGELOG_LINES.added
						: RELEASED_CHANGELOG_LINES.addedMany
					).replace('{count}', String(added)),
				]
			: []),
		...(removed > 0
			? [
					(removed === 1
						? RELEASED_CHANGELOG_LINES.removedLine
						: RELEASED_CHANGELOG_LINES.removedLines
					).replace('{count}', String(removed)),
				]
			: []),
	]
	return parts.join(', ')
}
