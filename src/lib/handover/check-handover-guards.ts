/**
 * The guards `handover run` checks before its first commit, each announced on one line with its result
 * and how long it took: the hooks folder, the branch, HEAD (or the lots already committed on top of it),
 * the merge lots (none in progress, trees recorded, resolutions as reviewed), an empty index, the files
 * against the reviewed snapshot, the deleted files, files outside the lots,
 * plan tags (a contributor's) or standard citations in the lots' files and messages, a contributor's green
 * `dialecte contrib` of the tree the lots leave, and what the package still owes its mutation runs.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { findContribRecord } from '../contrib/contrib-key.ts'
import { isPresent } from '../file-system.ts'
import { isGreenRecord, originOfRecord } from '../gate-records/check-store.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { describeMissingHooksFolder, readHooksFolder } from '../git-hooks.ts'
import { listChangedFiles, listStagedFiles, readGit } from '../git.ts'
import { MUTATION_GATE_NAME, NO_MUTATION_SCOPE } from '../mutation/pending-verdict.constants.ts'
import { lotModeOf, pendingVerdict } from '../mutation/pending-verdict.ts'
import { textOf } from '../print/print.ts'
import { readProfile } from '../profile/profile.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { readReferencePatterns } from '../rules/committed-text.ts'
import { ForbiddenWordsListError } from '../rules/forbidden-words.ts'
import { shellQuote } from '../shell-quote.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import { findLotReferences } from './find-lot-references.ts'
import {
	ALREADY_COMMITTED_DETAIL,
	CONSUMER_REFERENCES_DETAIL,
	CONTRIB_GUARD_NAME,
	CONTRIBUTOR_REFERENCES_DETAIL,
	FAILED_CONTRIB_DETAIL,
	GREEN_CONTRIB_DETAIL,
	GUARD_NAME_WIDTH,
	HANDOVER_FILES,
	HEAD_GUARD_NAME,
	NO_GREEN_CONTRIB_DETAIL,
	REHEARSAL_CONTRIB_DETAIL,
} from './handover.constants.ts'
import { checkedTree, mergedBranchesOf } from './lot-trees.ts'
import { commitOf, readMergeMarker, removeMergeMarker } from './merge-lot.ts'
import {
	differingSnapshotLines,
	isLotsFileAsReviewed,
	reviewedHashes,
	snapshotPathOf,
} from './reviewed-snapshot.ts'
import { restoreLeftoverBackup } from './sync-node-modules.ts'
import { hashFile } from './write-handover.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type {
	GuardedRun,
	GuardVerdict,
	HandoverFolder,
	MergeLot,
	ResolvedLot,
	WriteLine,
} from './handover.types.ts'

/** The run's HEAD and the lots committed already; undefined when a guard refused (its lines written). */
export function checkHandoverGuards(params: {
	handover: HandoverFolder
	write: WriteLine
	clock: Clock
	/** A rehearsal: a merge lot may lack its tree (the rehearsal prints it). */
	rehearsal?: boolean
	/** `--resume-merge`: a merge of the next lot's tip in progress, even someone else's, is aborted and redone. */
	resumeMerge?: boolean
	/**
	 * A rehearsal whose contrib run in the clone cannot answer the real run: why (the lots change the contrib rows,
	 * the install...). The `contrib` guard says that rather than advising a run.
	 */
	contribUnanswerable?: string
}): GuardedRun | undefined {
	const { handover, write, clock } = params
	const { lotsFile, lots } = handover
	const root = lotsFile.repository
	const run: GuardedRun = { head: '', commits: [] }
	// an install a signal or a crash interrupted left the working package files in a backup
	const leftover = existsSync(root) ? restoreLeftoverBackup(root) : undefined
	if (leftover) {
		write(
			textOf([
				`${leftover.ok ? '✓' : '✗'} ${'backup'.padEnd(GUARD_NAME_WIDTH)} ${leftover.detail}`,
			]),
		)
		if (!leftover.ok) return undefined
	}
	// read once the working package files are the person's again
	const profile = existsSync(root) ? readProfile(root) : undefined

	const guards: { name: string; check: () => GuardVerdict }[] = [
		{
			name: 'repository',
			check: function repositoryExists() {
				return existsSync(root)
					? { ok: true, detail: root }
					: { ok: false, detail: `${root} does not exist` }
			},
		},
		{
			name: 'lots',
			check: function lotsAsReviewed() {
				if (lots.some((lot) => lot.merge) && handover.mergesHash === undefined)
					return {
						ok: false,
						detail: `${HANDOVER_FILES.mergesHash} is missing: write it again with --rehash after a review`,
					}
				const mergesAsReviewed =
					handover.mergesHash === undefined ||
					hashFile(join(handover.folder, HANDOVER_FILES.merges)) === handover.mergesHash
				if (!mergesAsReviewed)
					return {
						ok: false,
						detail: `${HANDOVER_FILES.merges} changed since the hand-over was written: \`dialecte handover --rehash <lots.json>\` after a review`,
					}
				return isLotsFileAsReviewed(handover)
					? { ok: true, detail: `${lots.length} lot(s) as reviewed` }
					: {
							ok: false,
							detail:
								'lots.json changed since the hand-over was written: `dialecte handover --rehash <lots.json>` after a review',
						}
			},
		},
		{
			name: 'hooks',
			check: function hooksFolderExists() {
				const missing = describeMissingHooksFolder(root)
				if (missing) return { ok: false, detail: missing }
				const { configured } = readHooksFolder(root)
				return { ok: true, detail: configured ?? 'git hooks folder' }
			},
		},
		{
			name: 'branch',
			check: function onTheBranch() {
				const branch = readGit({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
				return branch === lotsFile.branch
					? { ok: true, detail: branch }
					: { ok: false, detail: `expected ${lotsFile.branch}, the repository is on ${branch}` }
			},
		},
		{
			name: HEAD_GUARD_NAME,
			check: function onTheRecordedHead() {
				const resolved = resolveCommit({ root, revision: lotsFile.head })
				if (!resolved) return { ok: false, detail: `${lotsFile.head} is not a commit of ${root}` }
				run.head = resolved
				const found = findCommittedLots({
					root,
					head: resolved,
					tip: 'HEAD',
					lots,
					reviewed: reviewedHashes(handover.snapshotLines),
				})
				run.commits = found.commits
				if (found.foreign)
					return {
						ok: false,
						detail: `something else is on top of ${resolved.slice(0, 12)}`,
						lines: [
							found.foreign,
							`look: git -C ${shellQuote(root)} log --oneline ${resolved.slice(0, 12)}..HEAD`,
						],
					}
				const count = found.commits.length
				if (count === 0) return { ok: true, detail: resolved.slice(0, 12) }
				return {
					ok: true,
					detail:
						count === lots.length
							? `${resolved.slice(0, 12)}, ${ALREADY_COMMITTED_DETAIL}`
							: `${resolved.slice(0, 12)}, ${count} of ${lots.length} lot(s) committed already: resuming at lot ${count + 1}`,
				}
			},
		},
		...(lots.some((lot) => lot.merge)
			? [
					{
						name: 'merges',
						check: function mergesAsReviewed(): GuardVerdict {
							return checkMerges({
								root,
								lots,
								committed: run.commits.length,
								rehearsal: params.rehearsal ?? false,
								resumeMerge: params.resumeMerge ?? false,
							})
						},
					},
				]
			: []),
		{
			name: 'index',
			check: function nothingStaged() {
				const staged = listStagedFiles(root)
				if (staged.length === 0) return { ok: true, detail: 'empty' }
				const next = lots[run.commits.length]
				const nextPaths = next ? [...next.files, ...next.deletedFiles].sort() : []
				const stoppedRun = staged.join('\n') === nextPaths.join('\n')
				return {
					ok: false,
					detail: `${staged.length} file(s) staged already: the run stages each lot itself`,
					lines: [
						...staged,
						...(stoppedRun
							? [
									`the next lot's files, staged by a run that stopped: unstage them with  cd ${shellQuote(root)} && git reset -q -- ${staged.map(shellQuote).join(' ')}`,
								]
							: []),
					],
				}
			},
		},
		{
			name: 'snapshot',
			check: function filesAsReviewed() {
				const differing = differingSnapshotLines({ root, snapshotLines: handover.snapshotLines })
				return differing.length
					? {
							ok: false,
							detail: `${differing.length} file(s) differ from the reviewed snapshot: \`dialecte handover --rehash <lots.json>\` after a review`,
							lines: differing.map(snapshotPathOf),
						}
					: { ok: true, detail: `${handover.snapshotLines.length} file(s)` }
			},
		},
		{
			name: 'deleted',
			check: function deletedStayDeleted() {
				const deleted = lots.flatMap((lot) => lot.deletedFiles)
				const back = deleted.filter((file) => isPresent(join(root, file)))
				return back.length
					? { ok: false, detail: 'deleted in the snapshot and there again', lines: back }
					: { ok: true, detail: `${deleted.length} file(s) absent` }
			},
		},
		{
			name: 'outside',
			check: function nothingElseChanged() {
				const inLots = new Set(lots.flatMap((lot) => [...lot.files, ...lot.deletedFiles]))
				const extra = listChangedFiles({ root, withDeleted: true }).filter(
					(file) => !inLots.has(file),
				)
				return extra.length
					? { ok: false, detail: `${extra.length} file(s) changed outside the lots`, lines: extra }
					: { ok: true, detail: 'no other file changed' }
			},
		},
		{
			name: 'references',
			check: function noTagNorCitation(): GuardVerdict {
				let referencePatterns: ReferencePattern[]
				try {
					referencePatterns = readReferencePatterns(root)
				} catch (error) {
					// a forbidden words list that cannot be read: refused, never read as no list
					if (error instanceof ForbiddenWordsListError) return { ok: false, detail: error.message }
					throw error
				}
				const found = findLotReferences({ root, lots, referencePatterns })
				const fileCount = lots.reduce((total, lot) => total + lot.files.length, 0)
				return found.length
					? {
							ok: false,
							detail:
								profile === 'contributor'
									? CONTRIBUTOR_REFERENCES_DETAIL
									: CONSUMER_REFERENCES_DETAIL,
							lines: found,
						}
					: { ok: true, detail: `${fileCount} file(s), ${lots.length} message(s)` }
			},
		},
		...(profile === 'contributor'
			? [
					{
						name: CONTRIB_GUARD_NAME,
						check: function greenContrib(): GuardVerdict {
							const verdict = checkContrib({ handover, run })
							if (verdict.ok || !params.rehearsal) return verdict
							// a rehearsal goes on past a refusal, marked so the person sees the real run would stop here
							return {
								ok: true,
								warning: true,
								detail: REHEARSAL_CONTRIB_DETAIL.replace(
									'{detail}',
									params.contribUnanswerable ?? verdict.detail,
								),
							}
						},
					},
				]
			: []),
		{
			name: MUTATION_GATE_NAME,
			check: function nothingPendingInMutation() {
				return checkMutation({ handover, committed: run.commits.length })
			},
		},
	]
	for (const { name, check } of guards) {
		const startedAt = clock.now()
		const verdict = check()
		write(
			textOf([
				`${verdict.ok ? (verdict.warning ? '!' : '✓') : '✗'} ${name.padEnd(GUARD_NAME_WIDTH)} ${verdict.detail}  ${formatDuration(clock.now() - startedAt)}`,
			]),
		)
		for (const line of verdict.lines ?? []) write(textOf([`    ${line}`]))
		if (!verdict.ok) return undefined
		// every lot on HEAD as reviewed: the guards after head read the working tree, which later work may change
		if (name === HEAD_GUARD_NAME && lots.length > 0 && run.commits.length === lots.length)
			return run
	}
	return run
}

/**
 * The merge lots still to commit: no merge of something else in progress (one of the next lot's own tip,
 * left by a stopped run, is aborted to be redone), each one's tree recorded (a real run), each resolution
 * as reviewed; a branch moved since its tip was reviewed is a note: the recorded tip is merged.
 */
function checkMerges(params: {
	root: string
	lots: readonly ResolvedLot[]
	committed: number
	rehearsal: boolean
	resumeMerge: boolean
}): GuardVerdict {
	const { root, lots } = params
	const pending = lots
		.map((lot, index) => ({ merge: lot.merge, number: index + 1 }))
		.slice(params.committed)
		.filter((entry): entry is { merge: MergeLot; number: number } => entry.merge !== undefined)
	const notes: string[] = []
	const inProgress = commitOf({ root, revision: 'MERGE_HEAD' })
	// a marker without a merge (a crash before git merge) must not vouch for a later merge by hand
	if (!inProgress) removeMergeMarker(root)
	if (inProgress) {
		const ours = readMergeMarker(root) === inProgress
		const nextTip = lots[params.committed]?.merge?.tip
		// only a merge of the next lot's tip that this cli started (or `--resume-merge`) is redone
		if (inProgress !== nextTip || !(ours || params.resumeMerge))
			return {
				ok: false,
				detail: `a merge of ${inProgress.slice(0, 12)} is in progress${inProgress === nextTip ? ', not started by this cli' : ''}: left as it is; finish it, or abort it (git merge --abort) and run again${inProgress === nextTip ? ', or run again with --resume-merge to abort and redo it' : ''}`,
			}
		readGit({ root, args: ['merge', '--abort'] })
		removeMergeMarker(root)
		notes.push(
			`the merge of lot ${params.committed + 1} left in progress (${ours ? 'by an earlier run' : '--resume-merge'}): aborted, redone`,
		)
	}
	for (const { merge, number } of pending) {
		if (!merge.tree && !params.rehearsal)
			return {
				ok: false,
				detail: `lot ${number}: tree not recorded: rehearse first (\`--rehearse\` prints it), add it as "tree" to the lot, then \`dialecte handover --rehash\``,
			}
		const changed = merge.resolutions.filter(
			(resolution) =>
				!('removed' in resolution) &&
				(!existsSync(resolution.file) || hashFile(resolution.file) !== resolution.sha256),
		)
		if (changed.length)
			return {
				ok: false,
				detail: `lot ${number}: ${changed.length} resolution(s) changed since the hand-over was written: \`dialecte handover --rehash <lots.json>\` after a review`,
				lines: changed.map(
					(resolution) => `${resolution.path}: ${'file' in resolution ? resolution.file : ''}`,
				),
			}
		const branchTip = commitOf({ root, revision: merge.branch })
		if (branchTip !== merge.tip)
			notes.push(
				`lot ${number}: ${merge.branch} moved since the review (now ${branchTip?.slice(0, 12) ?? 'gone'}): the recorded tip ${merge.tip.slice(0, 12)} is merged`,
			)
	}
	return {
		ok: true,
		detail: `${pending.length} merge(s) to commit, resolutions as reviewed`,
		...(notes.length && { lines: notes }),
	}
}

/**
 * What the package owes its mutation runs, read from the store now (never from the card): new survivors,
 * died runs, a run a merge or a gate lot waits for, a gate lot without a run on the tree the lots still to commit
 * leave, refuse; a run of the branch still running passes with its warning.
 */
function checkMutation(params: { handover: HandoverFolder; committed: number }): GuardVerdict {
	const { folder, lotsFile, lots } = params.handover
	const root = lotsFile.repository
	const verdict = pendingVerdict({
		root,
		branch: lotsFile.branch,
		mergedBranches: mergedBranchesOf(lots),
		lotMode: lotModeOf({ root, folder }),
		// computed only for a gate lot: the trial merge of a merge lot costs
		tree: function handedOverTree() {
			return checkedTree({
				root,
				stateTree: computeStateTree(root),
				lots: lots.slice(params.committed),
			})
		},
	})
	if (!verdict) return { ok: true, detail: NO_MUTATION_SCOPE }
	return {
		ok: verdict.status !== 'failed',
		detail: verdict.detail,
		...(verdict.lines.length && { lines: verdict.lines }),
	}
}

/**
 * A contributor's contrib run of the tree the lots still to commit leave: a green record whose key is the one a run
 * would have now (that tree, what is installed, the contrib rows) at the lots file's HEAD, before any lot is
 * committed; else refused, naming the failed rows of a record of that key.
 */
function checkContrib(params: { handover: HandoverFolder; run: GuardedRun }): GuardVerdict {
	const { lotsFile, lots } = params.handover
	const root = lotsFile.repository
	const tree = checkedTree({
		root,
		stateTree: computeStateTree(root),
		lots: lots.slice(params.run.commits.length),
	})
	const record = findContribRecord({ root, tree, head: params.run.head })
	if (record && isGreenRecord(record))
		return { ok: true, detail: GREEN_CONTRIB_DETAIL.replace('{at}', originOfRecord(record).at) }
	const failed = (record?.steps ?? [])
		.filter((step) => step.status === 'failed')
		.map((step) => step.name)
	return {
		ok: false,
		detail: failed.length
			? FAILED_CONTRIB_DETAIL.replace('{rows}', failed.join(', '))
			: NO_GREEN_CONTRIB_DETAIL,
	}
}

/** The full sha of a revision, or undefined when the repository has no such commit. */
function resolveCommit(params: { root: string; revision: string }): string | undefined {
	const result = spawnSync(
		'git',
		['rev-parse', '--verify', '--quiet', `${params.revision}^{commit}`],
		{ cwd: params.root, encoding: 'utf8' },
	)
	return result.status === 0 ? result.stdout.trim() : undefined
}
