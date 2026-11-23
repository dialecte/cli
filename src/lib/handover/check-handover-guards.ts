/**
 * The guards `handover run` checks before its first commit, each announced on one line with its result
 * and how long it took: the hooks folder, the branch, HEAD (or the lots already committed on top of it),
 * the merge lots (none in progress, trees recorded, resolutions as reviewed), the target branch's tip held by the
 * hand-over (exit 2 when it moved), no process left running in the worktree (exit 2), no late fix nobody verified
 * (exit 2), a store lot's work held to its scope, an empty index, the files
 * against the reviewed snapshot, the deleted files, files outside the lots,
 * plan tags (a contributor's) or standard citations in the lots' files and messages, a contributor's green
 * `dialecte contrib` of the tree the lots leave, and what the package still owes its mutation runs.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { contribKeyOf, contribReleaseBaseOf, findContribRecord } from '../contrib/contrib-key.ts'
import { CONTRIB_RECORD_MODE } from '../contrib/contrib.constants.ts'
import { isPresent } from '../file-system.ts'
import { lateFixesDetailOf } from '../gate-records/card-gates.ts'
import { isGreenRecord, originOfRecord, readTreeRecords } from '../gate-records/check-store.ts'
import { LATE_FIXES_LINE_NAME, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { computeStateHash, computeStateTree } from '../gate-records/state-hash.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { HOOK_SCOPE_TEXTS } from '../gate/hook-scope.constants.ts'
import { describeMissingHooksFolder, readHooksFolder } from '../git-hooks.ts'
import {
	isAncestorCommit,
	listChangedFiles,
	listLotChangePaths,
	listStagedFiles,
	readGit,
} from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { MUTATION_GATE_NAME, NO_MUTATION_SCOPE } from '../mutation/pending-verdict.constants.ts'
import { lotModeOf, pendingVerdict } from '../mutation/pending-verdict.ts'
import { readPackageJson } from '../package-json.ts'
import { textOf } from '../print/print.ts'
import { readProfile } from '../profile/profile.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { readLateFixes } from '../review-rounds/late-fixes.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { readReferencePatterns } from '../rules/committed-text.ts'
import { ForbiddenWordsListError } from '../rules/forbidden-words.ts'
import { shellQuote } from '../shell-quote.ts'
import { lotFolderOf, storeEntryOf } from '../store/lot-folder.ts'
import { readCheckedLotState, registryOfLotFolder } from '../store/lot-records.ts'
import { isTerminalState, lotState } from '../store/lot-state.ts'
import { SCOPE_GUARD_NAME } from '../store/scope-guard.constants.ts'
import { heldPathsOf, scopeGuardOf } from '../store/scope-guard.ts'
import { resolveTddBase } from '../tdd/tdd-base.ts'
import { packagePathsOf } from '../worktree/lot-files.ts'
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
	MERGE_NOTE_SHA_LENGTH,
	MERGE_TREE_NOT_RECORDED_REFUSAL,
	MERGES_GUARD_NAME,
	NO_GREEN_CONTRIB_DETAIL,
	OTHER_KEY_CONTRIB_CAUSES,
	OTHER_KEY_CONTRIB_DETAIL,
	REHEARSAL_CONTRIB_DETAIL,
	TARGET_GUARD_NAME,
	TARGET_HELD_DETAIL,
	TARGET_MERGE_NOTE,
	VERIFY_GUARD_NAME,
} from './handover.constants.ts'
import { checkedTree, mergedBranchesOf } from './lot-trees.ts'
import { commitOf, readMergeMarker, removeMergeMarker } from './merge-lot.ts'
import {
	differingSnapshotLines,
	isLotsFileAsReviewed,
	reviewedHashes,
	snapshotPathOf,
} from './reviewed-snapshot.ts'
import { STORE_LOT_GUARD_NAME } from './store-lot-guard.constants.ts'
import { checkStoreLot } from './store-lot-guard.ts'
import { PROCESSES_GUARD_NAME } from './stray-processes.constants.ts'
import { strayProcesses, strayProcessesLineOf } from './stray-processes.ts'
import { restoreLeftoverBackup } from './sync-node-modules.ts'
import { findTargetRef, targetLineOf, targetMoved } from './target-moved.ts'
import { hashFile } from './write-handover.ts'

import type { CardGateLine, GateRecord } from '../gate-records/gate-records.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { Clock } from '../progress/clock.types.ts'
import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { ScopeRefusal } from '../store/scope-guard.types.ts'
import type {
	GuardedRun,
	GuardRefusal,
	GuardVerdict,
	HandoverFolder,
	MergeLot,
	ResolvedLot,
	WriteLine,
} from './handover.types.ts'
import type { NotALotGoAhead } from './store-lot-guard.types.ts'

/**
 * The run's HEAD and the lots committed already; when a guard refused (its lines written), the exit code it sets
 * (2 for `target`), else 1.
 */
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
	/** `--not-a-lot --by --reason`: the person's go-ahead for a hand-over that is not a store lot. */
	notALot?: NotALotGoAhead
}): GuardedRun | GuardRefusal {
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
		if (!leftover.ok) return { exitCode: 1 }
	}
	// read once the working package files are the person's again
	const profile = existsSync(root) ? readProfile(root) : undefined
	const packageJson = existsSync(root) ? readPackageJson(root) : {}

	// a check answering undefined has nothing to judge on this run: no line
	const guards: { name: string; check: () => GuardVerdict | undefined }[] = [
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
						name: MERGES_GUARD_NAME,
						check: function mergesAsReviewed(): GuardVerdict {
							const target = findTargetRef({ root, lotsFile, packageJson })
							return checkMerges({
								root,
								lots,
								committed: run.commits.length,
								rehearsal: params.rehearsal ?? false,
								resumeMerge: params.resumeMerge ?? false,
								...('branch' in target && { targetBranch: target.branch }),
							})
						},
					},
				]
			: []),
		{
			name: TARGET_GUARD_NAME,
			check: function targetHeld(): GuardVerdict | undefined {
				return checkTarget({
					root,
					lotsFile,
					packageJson,
					committed: run.commits.length,
					rehearsal: params.rehearsal ?? false,
				})
			},
		},
		{
			name: PROCESSES_GUARD_NAME,
			check: function nothingLeftRunning(): GuardVerdict {
				return checkProcesses({ root, rehearsal: params.rehearsal ?? false })
			},
		},
		{
			name: VERIFY_GUARD_NAME,
			check: function lateFixesVerified(): GuardVerdict {
				return checkLateFixes({
					root,
					folder: handover.folder,
					rehearsal: params.rehearsal ?? false,
				})
			},
		},
		{
			name: STORE_LOT_GUARD_NAME,
			check: function isALotOfTheStore(): GuardVerdict | undefined {
				return checkStoreLot({
					folder: handover.folder,
					release: lotsFile.release === true,
					rehearsal: params.rehearsal ?? false,
					goAhead: params.notALot,
				})
			},
		},
		{
			name: SCOPE_GUARD_NAME,
			check: function insideTheScope(): GuardVerdict | undefined {
				return checkScope({
					folder: handover.folder,
					root,
					packageJson,
					pending: lots.slice(run.commits.length),
				})
			},
		},
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
		if (verdict === undefined) continue
		write(
			textOf([
				`${verdict.ok ? (verdict.warning ? '!' : '✓') : '✗'} ${name.padEnd(GUARD_NAME_WIDTH)} ${verdict.detail}  ${formatDuration(clock.now() - startedAt)}`,
			]),
		)
		for (const line of verdict.lines ?? []) write(textOf([`    ${line}`]))
		if (!verdict.ok) return { exitCode: verdict.exitCode ?? 1 }
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
	/** The branch the lots land on: a merge lot of it that moved since is noted for the target guard. */
	targetBranch?: string
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
				detail: MERGE_TREE_NOT_RECORDED_REFUSAL.replace('{number}', String(number)),
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
		if (branchTip === merge.tip) continue
		const now = branchTip?.slice(0, MERGE_NOTE_SHA_LENGTH) ?? 'gone'
		const tip = merge.tip.slice(0, MERGE_NOTE_SHA_LENGTH)
		// the target branch's move is the target guard's to judge: the note does not call the merge enough
		notes.push(
			merge.branch === params.targetBranch
				? TARGET_MERGE_NOTE.replace('{number}', String(number))
						.replaceAll('{branch}', () => merge.branch)
						.replace('{tip}', tip)
						.replace('{now}', now)
				: `lot ${number}: ${merge.branch} moved since the review (now ${now}): the recorded tip ${tip} is merged`,
		)
	}
	return {
		ok: true,
		detail: `${pending.length} merge(s) to commit, resolutions as reviewed`,
		...(notes.length && { lines: notes }),
	}
}

/**
 * The target branch read now (never from the card): its tip held by the head or a merge lot passes; moved, or no
 * target branch to judge, refuses with exit 2; a rehearsal goes on past it, marked `!`; lots that go on the target
 * branch itself are not judged (undefined: no line).
 */
function checkTarget(params: {
	root: string
	lotsFile: HandoverFolder['lotsFile']
	packageJson: PackageJson
	/** The lots the head guard found committed already. */
	committed: number
	rehearsal: boolean
}): GuardVerdict | undefined {
	const verdict = targetMoved({
		root: params.root,
		lotsFile: params.lotsFile,
		packageJson: params.packageJson,
		committed: params.committed,
	})
	if (verdict.kind === 'held')
		return {
			ok: true,
			detail: TARGET_HELD_DETAIL.replace('{branch}', () => verdict.branch).replace(
				'{ref}',
				() => verdict.ref,
			),
		}
	const line = targetLineOf(verdict)
	// the lots go on the target branch itself: the head guard judges what is on top
	if (line === undefined) return undefined
	return params.rehearsal
		? { ok: true, warning: true, detail: line }
		: { ok: false, exitCode: 2, detail: line }
}

/**
 * The processes working in the worktree read now (never from the card): none passes; only the person's tools pass
 * marked `!`; any left behind, or a list not known, refuses with exit 2; a rehearsal goes on past it, marked `!`.
 */
function checkProcesses(params: { root: string; rehearsal: boolean }): GuardVerdict {
	const processes = strayProcesses({ worktree: params.root, root: params.root })
	const line = strayProcessesLineOf(processes)
	if (line.status === 'passed') return { ok: true, detail: line.detail }
	// the person's tools only: shown, never refused
	if (processes.unknown === undefined && processes.leftBehind.length === 0)
		return { ok: true, warning: true, detail: line.detail }
	return params.rehearsal
		? { ok: true, warning: true, detail: line.detail }
		: { ok: false, exitCode: 2, detail: line.detail }
}

/**
 * The scope guard of a store lot's hand-over (SAFE 3.7), so a rehearsal sees what the hook will: the lot's committed
 * work (its lot base against HEAD), every pending lot's files and deleted files (package-relative in `lots.json`,
 * mapped to the repository's frame), and a pending merge lot's own paths when it merges another branch than the base,
 * held to the lot's effective scope. Refused in a rehearsal too; a lot whose records read as nothing refused with the
 * damaged line. Undefined (no line) for a folder that is no store lot, and for a simulated, damaged or terminal one
 * (the `lot` guard speaks for those; nothing lands from a terminal one, as the hook skips it).
 */
function checkScope(params: {
	folder: string
	root: string
	packageJson: PackageJson
	pending: readonly ResolvedLot[]
}): GuardVerdict | undefined {
	const { root, packageJson } = params
	const lotFolder =
		lotFolderOf({ folder: params.folder }) ?? storeEntryOf({ folder: params.folder })
	if (lotFolder === undefined) return undefined
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	// a lot whose records read as nothing is refused with the damaged line, as the hook refuses it
	if (checked === undefined) return verdictOf(scopeGuardOf({ lotFolder, paths: [] }))
	if ('damage' in checked || checked.input.identity.simulated) return undefined
	if (isTerminalState(lotState(checked.input).state)) return undefined
	const base = resolveTddBase({ root, packageJson })
	if ('failure' in base) return { ok: false, detail: base.failure }
	const prefix = readGit({ root, args: ['rev-parse', '--show-prefix'] }).trim()
	const paths = [
		...listLotChangePaths({ root, from: base.commit, to: 'HEAD' }),
		...params.pending.flatMap((lot) =>
			[...lot.files, ...lot.deletedFiles].map((file) => `${prefix}${file}`),
		),
		...params.pending.flatMap((lot) =>
			lot.merge === undefined ? [] : mergedPathsOf({ root, packageJson, tip: lot.merge.tip }),
		),
	]
	const packagePaths = packagePathsOf({ root: workTreeTopOf(root) ?? root })
	const refusal = scopeGuardOf({ lotFolder, paths, packagePaths })
	if (refusal === undefined)
		return {
			ok: true,
			detail: fillMessage({
				template: HOOK_SCOPE_TEXTS.passed,
				values: { count: String(heldPathsOf({ paths, packagePaths }).length) },
			}),
		}
	return verdictOf(refusal)
}

/** The guard's refusal of a scope refusal: its reason, then the add to run and the glob lines under it. */
function verdictOf(refusal: ScopeRefusal | undefined): GuardVerdict | undefined {
	if (refusal === undefined) return undefined
	return {
		ok: false,
		detail: refusal.reason,
		lines: [
			...(refusal.next === undefined ? [] : [`next: ${refusal.next}`]),
			...(refusal.globPaths ?? []),
		],
	}
}

/**
 * The paths a merge of `tip` brings into the lot: its own, from its merge-base with HEAD; none when it lies on the base
 * branch's line (a merge of the base moves the lot's fork point) or no base branch is found.
 */
function mergedPathsOf(params: { root: string; packageJson: PackageJson; tip: string }): string[] {
	const { root, tip } = params
	const found = findBaseBranchRef({ root, packageJson: params.packageJson })
	if ('refusal' in found || isAncestorCommit({ root, ancestor: tip, descendant: found.ref }))
		return []
	const from = readGit({ root, args: ['merge-base', 'HEAD', tip] }).trim()
	return listLotChangePaths({ root, from, to: tip })
}

/**
 * The changes of the lot's tree after its last snapshot (33L1 6b): none or verified by `lot verify` of the current
 * tree pass; unverified ones refuse the run (exit 2), a rehearsal goes on with `!`; a last snapshot with no state
 * (an older cli) is a warning, never a refusal (Q15).
 */
function checkLateFixes(params: {
	root: string
	folder: string
	rehearsal: boolean
}): GuardVerdict {
	const lateFixes = readLateFixes({
		folder: params.folder,
		root: params.root,
		stateHash: computeStateHash(params.root),
	})
	const words = lateFixesDetailOf({ lateFixes })
	const detail = lateFixes.kind === 'none' ? words : `${LATE_FIXES_LINE_NAME} ${words}`
	if (lateFixes.kind === 'not-checked') return { ok: true, warning: true, detail }
	if (lateFixes.kind !== 'unverified') return { ok: true, detail }
	return params.rehearsal ? { ok: true, warning: true, detail } : { ok: false, exitCode: 2, detail }
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
 * would have now (that tree, what it locks, the contrib rows) at the lots file's HEAD, before any lot is
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
	const releaseBase = contribReleaseBaseOf({ root })
	const record = findContribRecord({ root, tree, head: params.run.head, releaseBase })
	if (record && isGreenRecord(record))
		return { ok: true, detail: GREEN_CONTRIB_DETAIL.replace('{at}', originOfRecord(record).at) }
	const failed = (record?.steps ?? [])
		.filter((step) => step.status === 'failed')
		.map((step) => step.name)
	return {
		ok: false,
		detail: failed.length
			? FAILED_CONTRIB_DETAIL.replace('{rows}', failed.join(', '))
			: `${NO_GREEN_CONTRIB_DETAIL}${otherKeyContribDetail({ root, tree, head: params.run.head })}`,
	}
}

/**
 * The note on the newest green contrib record of `tree` stored under another key than a run at `head` computes:
 * when it ran and what differs (`otherKeyCauseOf`); empty without one.
 */
function otherKeyContribDetail(params: { root: string; tree: string; head: string }): string {
	const green = readTreeRecords(params)
		.filter((record) => record.mode === CONTRIB_RECORD_MODE && isGreenRecord(record))
		.sort((first, second) => originOfRecord(second).at.localeCompare(originOfRecord(first).at))[0]
	return green === undefined
		? ''
		: OTHER_KEY_CONTRIB_DETAIL.replace('{at}', originOfRecord(green).at).replace('{cause}', () =>
				otherKeyCauseOf({ ...params, green }),
			)
}

/**
 * What differs between a green record's key and the one a run at `head` computes, first found wins: the `file:`
 * dependencies (`linked`), the commit it ran at, the base branch's `CHANGELOG.md` the changelog row judged against
 * (when the record holds it), else the lock or command hash - another cli or other contrib rows.
 */
function otherKeyCauseOf(params: {
	root: string
	tree: string
	head: string
	green: GateRecord
}): string {
	const { green } = params
	const key = contribKeyOf({ ...params, releaseBase: contribReleaseBaseOf({ root: params.root }) })
	if (green.key !== undefined && green.key.linked !== key.linked)
		return OTHER_KEY_CONTRIB_CAUSES.linked
	if (green.head !== params.head)
		return OTHER_KEY_CONTRIB_CAUSES.head.replace('{head}', green.head.slice(0, SHORT_SHA_LENGTH))
	// a record written before the field existed holds none: its cause is told by the steps below
	if (
		green.key?.releaseChangelog !== undefined &&
		key.releaseChangelog !== undefined &&
		(green.key.releaseChangelog.tip !== key.releaseChangelog.tip ||
			green.key.releaseChangelog.mergeBase !== key.releaseChangelog.mergeBase)
	)
		return OTHER_KEY_CONTRIB_CAUSES.releaseChangelog
	return OTHER_KEY_CONTRIB_CAUSES.cli.replace('{version}', readCliVersion())
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

/**
 * The card's failed `merges` line for the first lot not committed yet that is a merge without its recorded tree,
 * worded as the run's `merges` guard refuses it; none when every pending merge lot holds its tree, nor on a
 * rehearsal's card (a rehearsal checks no tree: it is what records one).
 */
export function mergeTreeLineOf(params: {
	lots: readonly ResolvedLot[]
	committed: number
	/** The card of a rehearsal, whose commits are the scratch clone's. */
	rehearsal: boolean
}): CardGateLine | undefined {
	if (params.rehearsal) return undefined
	const index = params.lots.findIndex(
		(lot, position) => position >= params.committed && lot.merge !== undefined && !lot.merge.tree,
	)
	if (index < 0) return undefined
	return {
		name: MERGES_GUARD_NAME,
		status: 'failed',
		detail: MERGE_TREE_NOT_RECORDED_REFUSAL.replace('{number}', String(index + 1)),
	}
}
