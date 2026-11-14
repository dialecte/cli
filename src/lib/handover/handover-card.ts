/**
 * The hand-over card: the verdict (READY, BLOCKED, DONE, ABANDONED) with the size and what to read, what is
 * committed (each lot, a merge with its tree, HEAD), the gates as their records say (with the review and the
 * standard check), a contributor's contrib rows, a READY card's review row (the command that opens it in an
 * editor), the test receipts, the notes (before a run only), the command,
 * before and after the run, and a closing rule naming the hand-over (its registered name, else its folder).
 */
import { basename, dirname, relative } from 'node:path'

import { counted } from '../counted.ts'
import { DEFAULT_EDITOR, EDITOR_CONFIG_KEY } from '../editor/editor.constants.ts'
import { findExecutable } from '../editor/find-executable.ts'
import { resolveEditor } from '../editor/resolve-editor.ts'
import { formatAgentTime } from '../events/format-agent-time.ts'
import { formatLotTokens } from '../events/format-tokens.ts'
import { readHandoverUsage } from '../events/handover-usage.ts'
import { realPathThroughAncestors } from '../file-system.ts'
import {
	buildCardGateLines,
	buildContribLines,
	buildMutationLines,
	buildLateFixesLine,
	buildReviewLine,
	sleptLineOf,
} from '../gate-records/card-gates.ts'
import {
	CARD_GATE_MARKS,
	CONTRIB_LINE_NAME,
	DETAIL_SEPARATOR,
	SLEPT_HANDOVER_RUN,
} from '../gate-records/gate-records.constants.ts'
import {
	readJudgedCases,
	readJudgedDuplicates,
	readJudgedMoves,
} from '../gate-records/gate-records.ts'
import { computeStateTree, hashStateTree } from '../gate-records/state-hash.ts'
import { mainCheckoutOf } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { readProfile } from '../profile/profile.ts'
import { shellQuote, shellWord } from '../shell-quote.ts'
import { readRecordedStandardLine, readStandardLine } from '../standard/read-standard-line.ts'
import { countingReceipts, describeSkippedReceipts } from '../tdd/counting-receipts.ts'
import { writtenLinesOf } from '../tdd/duplicate-case-ids.ts'
import {
	entryNamesCase,
	findCaseEntry,
	listRevisedHelpers,
	namesRevisedHelper,
	readAcceptances,
	readGoneEntries,
	readRevisions,
	readTddExemption,
} from '../tdd/lot-declaration.ts'
import { caseLabel } from '../tdd/select-cases.ts'
import {
	countChangedFiles,
	hashChangedTestCode,
	readLedger,
	resolveBase,
} from '../tdd/tdd-files.ts'
import { DUPLICATE_CARD_LABEL, DUPLICATE_LINES_DETAIL } from '../tdd/tdd.constants.ts'
import { isInside } from '../worktree/sibling-links.ts'
import { worktreeIndexOf } from '../worktree/worktree-index.ts'
import { readHandoverRunRecord } from './handover-run-record.ts'
import { registeredNameOf } from './handover-store.ts'
import {
	ACCEPTED_REASON_INDENT,
	ALL_GATES_GREEN,
	CARD_PART_SEPARATOR,
	CARD_SHA_LENGTH,
	COMMIT_SCRIPT_FILE,
	CASE_TITLE_SEPARATOR,
	EARLIER_LOTS_LINE,
	FLAG_ORDER,
	HANDOVER_CARD_FOOTER,
	HANDOVER_CARD_NAMED_FOOTER,
	HANDOVER_CARD_NUMBERED_TITLE,
	HANDOVER_CARD_SECTIONS,
	HANDOVER_CARD_TITLE,
	HANDOVER_PROBE_TIMEOUT_MILLISECONDS,
	HANDOVER_REVIEW_COMMAND,
	HANDOVER_REVIEW_NO_EDITOR_ROW,
	HANDOVER_REVIEW_ROW,
	MERGE_NOT_SIZED,
	MINUS_SIGN,
	NOISE_FLAG_LINE,
	NOISE_PRONE_FLAG,
	NOTHING_PUSHED,
	OTHER_TREE_GATES,
	PENDING_COMMIT,
	TARGET_MOVED_TAIL,
	TARGET_NOT_FOUND_TAIL,
	TDD_COUNT_WORDS,
	TDD_COUNTS_FROM_GATE_LINE,
	TO_READ_INDENT,
	TO_READ_LABEL_WIDTH,
	TO_READ_LABELS,
	TO_READ_MARK,
	TREE_NOT_RECORDED,
	USAGE_AGENT_TIME,
	USAGE_ROW,
	WORKTREE_LINE_LABEL,
} from './handover.constants.ts'
import { readInstallLine } from './install-guard.ts'
import { commitSizeOf, treeDiffSizeOf, workingTreeSizeOf } from './lot-size.ts'
import { checkedTree, mergedBranchesOf, ownLotTreeOf } from './lot-trees.ts'
import { PROCESSES_GUARD_NAME } from './stray-processes.constants.ts'
import { strayProcessesLineOf } from './stray-processes.ts'
import { targetLineOf } from './target-moved.ts'

import type { CardLine, CardSection, SectionCard } from '../card/card.types.ts'
import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type {
	CaseStatus,
	DuplicateCaseId,
	LotCaseEntry,
	LotCaseList,
	LotGoneEntry,
	RevisedHelper,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from '../tdd/tdd.types.ts'
import type {
	CardLot,
	CaseSkippedReceipts,
	DeclaredReceipt,
	HandoverCard,
	HandoverCardData,
	HandoverProbe,
	HandoverReviewRow,
	HandoverVerdict,
	MergeLot,
	ResolvedLot,
	TargetVerdict,
	TddProof,
	TreeDiffSize,
} from './handover.types.ts'
import type { StrayProcesses } from './stray-processes.types.ts'

export function buildHandoverCard(params: {
	/** Where the lots are committed. */
	root: string
	/** Where the commits named in `commits` are, when not in `root` (a rehearsal clone). */
	commitRoot?: string
	folder: string
	branch: string
	head: string
	/**
	 * The lots file's `gates` text, the caveats for the person about to run the hand-over: the notes of the
	 * cards printed before a run (the written card, a rehearsal's); undefined after a real run.
	 */
	notes: string | undefined
	lots: readonly ResolvedLot[]
	/** The commits of the lots committed already, the first lot first. */
	commits: readonly string[]
	/**
	 * The cli writing the card: its run line when the repository's own cli cannot run hand-overs
	 * (`handover run --probe`, as `commit.sh` asks). Without it, the run line is `commit.sh`.
	 */
	cliPath?: string
	/** How long the repository's cli gets to answer the probe; past it, it counts as none. Default 60 s. */
	probeTimeout?: number
	/** Every lot is committed in the repository: the card says done, no command. */
	done?: boolean
	/** `handover abandon` marked the hand-over: the card says abandoned, no command. */
	abandoned?: boolean
	/** Asks whether the repository's own cli runs hand-overs. */
	probe: HandoverProbe
	/** A release hand-over (the lots file's `"release": true`): the card requires a `gate release` row. */
	release?: boolean
	/**
	 * Where the target branch stands (`targetMoved`), on the cards that judge it (`handover show`): moved or missing
	 * makes a READY or BLOCKED card BLOCKED with its `!` line; a DONE or ABANDONED card ignores it.
	 */
	target?: TargetVerdict
	/**
	 * The processes working in the worktree (`strayProcesses`), on the cards that judge them (`handover show` of one
	 * hand-over): left behind makes a READY or BLOCKED card BLOCKED with a failed `processes` line; the person's tools
	 * or a list not known add a warning line; a DONE or ABANDONED card ignores them.
	 */
	processes?: StrayProcesses
}): HandoverCard {
	const { root } = params
	const commitRoot = params.commitRoot ?? root
	const ownCli =
		params.done ||
		params.abandoned ||
		params.cliPath === undefined ||
		params.probe({ root, timeout: params.probeTimeout ?? HANDOVER_PROBE_TIMEOUT_MILLISECONDS })
	const stateTree = computeStateTree(root)
	const stateHash = hashStateTree(stateTree)
	const profile = readProfile(root)
	const checked = {
		root,
		stateHash,
		folder: params.folder,
		tree: checkedTree({
			root,
			stateTree,
			// the lots committed in the repository already are in its tree
			lots: params.lots.slice(commitRoot === root ? params.commits.length : 0),
		}),
		branch: params.branch,
		mergedBranches: mergedBranchesOf(params.lots),
	}
	// a committed merge hand-over judges tdd on the worktree's own lot tree, as its READY card did
	const ownLotTree = params.done
		? ownLotTreeOf({ root: commitRoot, lots: params.lots, commits: params.commits })
		: undefined
	const ownLotStateHash = ownLotTree === undefined ? undefined : hashStateTree(ownLotTree)
	const pending = !params.abandoned && !params.done
	const processes = pending ? params.processes : undefined
	const processesLine = processes && strayProcessesLineOf(processes)
	const lateFixesLine = pending
		? buildLateFixesLine({ folder: params.folder, root, stateHash })
		: undefined
	const installLine = readInstallLine({ folder: params.folder, worktree: root })
	// a consumer's mutation line stands among the gates; a contributor's is a contrib row
	const gates = [
		// the base is resolved on the lots file's HEAD, as the hand-over resolves it
		...buildCardGateLines({
			...checked,
			head: params.head,
			release: params.release,
			...(ownLotStateHash !== undefined && { ownLotStateHash }),
		}),
		// a committed hand-over whose run spanned a sleep says so
		...(params.done ? sleptRunLines(params.folder) : []),
		...(profile === 'consumer' ? buildMutationLines(checked) : []),
		buildReviewLine({ folder: params.folder, release: params.release }),
		// changes after the last snapshot, on a card still to run: nothing late, no line
		...(lateFixesLine ? [lateFixesLine] : []),
		// the install guard's last record, on every card; none recorded: no line
		...(installLine ? [installLine] : []),
		// a committed card shows the state recorded on the lot, never the runner's environment
		params.done
			? readRecordedStandardLine({ folder: params.folder })
			: readStandardLine({ folder: params.folder }),
		// nothing working there: no line
		...(processesLine && processesLine.status !== 'passed'
			? [{ name: PROCESSES_GUARD_NAME, ...processesLine }]
			: []),
	]
	const contrib =
		profile === 'contributor' ? buildContribLines({ ...checked, head: params.head }) : undefined
	const allLines = [...gates, ...(contrib ?? [])]
	const failedGates = allLines.filter((line) => line.status === 'failed').map((line) => line.name)
	const otherTreeGates = allLines
		.filter((line) => line.stale && line.status !== 'failed')
		.map((line) => line.name)
	const tddStateHash = ownLotStateHash ?? stateHash
	const tdd = tddSection({
		root,
		judged: readJudgedCases({ root, stateHash: tddStateHash }),
		moved: readJudgedMoves({ root, stateHash: tddStateHash }),
		duplicates: readJudgedDuplicates({ root, stateHash: tddStateHash }),
	})
	const lots = params.lots.map(function cardLot(lot, index): CardLot {
		const commit = params.commits[index]
		const subject = lot.message.trim().split('\n')[0]
		const state = commit ? { commit } : { pending: true as const }
		if (lot.merge) {
			const size = mergeSizeOf({ merge: lot.merge, root, commitRoot, commit })
			const merge = mergeLine(lot.merge)
			if (!size)
				return {
					index: index + 1,
					fileCount: lot.merge.resolutions.length,
					insertions: 0,
					deletions: 0,
					subject,
					...state,
					merge,
					notSized: true,
				}
			return { index: index + 1, ...size, subject, ...state, merge }
		}
		const size = commit
			? commitSizeOf({ root: commitRoot, commit })
			: workingTreeSizeOf({ root: commitRoot, files: lot.files, deletedFiles: lot.deletedFiles })
		return {
			index: index + 1,
			fileCount: lot.files.length + lot.deletedFiles.length,
			subject,
			...size,
			...state,
		}
	})
	const merges = lots.flatMap((lot) => (lot.merge ? [`lot ${lot.index}: ${lot.merge}`] : []))
	const target = pending && params.target ? params.target : undefined
	const targetLine = target && targetLineOf(target)
	const verdict: HandoverVerdict = params.abandoned
		? 'ABANDONED'
		: params.done
			? 'DONE'
			: failedGates.length || otherTreeGates.length || targetLine !== undefined
				? 'BLOCKED'
				: 'READY'
	const name = registeredNameOf({ root, folder: params.folder })
	const index = worktreeIndexOf(root)
	// the lot folder's events only: no probe, no git
	const usage = readHandoverUsage({ folder: params.folder })
	const review = verdict === 'READY' ? reviewRowOf({ root, id: name ?? params.folder }) : undefined
	return {
		repository: mainCheckoutOf(root),
		worktree: root,
		...(index && { index }),
		branch: params.branch,
		head: params.head,
		verdict,
		failedGates,
		otherTreeGates,
		...(targetLine !== undefined && { targetLine }),
		...(target?.kind === 'moved' && {
			targetMoved: {
				branch: target.branch,
				ref: target.ref,
				tip: target.tip,
				behind: target.behind,
			},
		}),
		...(processes && { processes }),
		declarations: tdd.declarations,
		gates,
		profile,
		...(contrib && { contrib }),
		...(params.notes && { notes: params.notes }),
		...(tdd.lines.length && { tdd: tdd.lines }),
		lots,
		...(params.commits.length && { tip: params.commits.at(-1) }),
		...(merges.length && { merges }),
		...(review && { review }),
		...(params.done && { done: true }),
		...(name && { name }),
		folder: params.folder,
		...(usage && { usage }),
		command: ownCli
			? `cd ${shellQuote(params.folder)} && bash ${COMMIT_SCRIPT_FILE}`
			: `node ${shellQuote(params.cliPath ?? '')} handover run ${shellQuote(params.folder)}`,
	}
}

/** The warning row of the folder's last run when it spanned a sleep of the machine; none otherwise. */
function sleptRunLines(folder: string): CardGateLine[] {
	const sleptMs = readHandoverRunRecord(folder)?.sleptMs
	return sleptMs === undefined ? [] : [sleptLineOf({ sleptMs, run: SLEPT_HANDOVER_RUN })]
}

/**
 * A READY card's `review` row: the command that opens the hand-over `id` (its name, else its folder, as one shell
 * word) and the word of the editor it would open from `root`, the search path read now, nothing started.
 */
function reviewRowOf(params: { root: string; id: string }): HandoverReviewRow {
	const cwd = params.root
	const searchPath = process.env.PATH
	const { editor, command } = resolveEditor({ cwd, searchPath, paths: [] })
	const row = { command: HANDOVER_REVIEW_COMMAND.replace('{id}', shellWord(params.id)) }
	// the fallback word and not on the path: the verb would refuse, the row says so
	const noneFound =
		editor === DEFAULT_EDITOR.word && !findExecutable({ word: command[0], searchPath, cwd })
	return noneFound ? row : { ...row, editor }
}

/**
 * A merge lot's size: its commit against its first parent once committed, else between the tree it merges
 * on and the tree a rehearsal recorded; undefined while no tree is recorded (or git cannot read it).
 */
function mergeSizeOf(params: {
	merge: MergeLot
	root: string
	commitRoot: string
	commit: string | undefined
}): TreeDiffSize | undefined {
	const { merge, commit } = params
	try {
		if (commit) return treeDiffSizeOf({ root: params.commitRoot, from: `${commit}^1`, to: commit })
		if (merge.tree) return treeDiffSizeOf({ root: params.root, from: merge.onTree, to: merge.tree })
	} catch {
		// an object git does not hold: the size waits for a rehearsal
		return undefined
	}
	return undefined
}

/** A merge lot on the card: what it merges, its conflicts, and the tree it must hold (or that it is not recorded). */
function mergeLine(merge: MergeLot): string {
	const conflicts = merge.conflicts.length
	return [
		`merge ${merge.branch} at ${merge.tip.slice(0, CARD_SHA_LENGTH)}`,
		`${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`,
		merge.tree ? `tree ${merge.tree.slice(0, CARD_SHA_LENGTH)}` : TREE_NOT_RECORDED,
	].join(CARD_PART_SEPARATOR)
}

/**
 * The test receipts as the reviewer of the hand-over needs them: the lot's exemption (with what the change
 * touches); each case counted once by its last proof (proven red → green, unchanged, kept); the cases its
 * lot file accepts without a red, one count per reason; the receipts of earlier lots (cases outside the
 * change), which the lot file no longer names, as one count per kind; then the entries a person must read -
 * the revised cases, the test calls declared gone, the unused entries, the cases of the change whose
 * receipts the read rule skips - and how many cases each kind of flag marks, the flagged unchanged cases
 * counted apart as noise. With how many entries are to read (revised, gone, unused, skipped).
 * Only the cases of the change count: those the gate's tdd step judged on this tree (`judged`), each
 * classified by the status the gate gave it, so the counts are the gate step's; without
 * them (no gate on this tree) one line asks for the gate instead of the counts, groups, entries and flags.
 */
function tddSection(params: {
	root: string
	judged: ReadonlyMap<string, CaseStatus> | undefined
	/** The grouped lines of the cases moved from the base, as the same gate record holds them. */
	moved: readonly string[]
	/** The case ids more than one case holds, as the same gate record holds them. */
	duplicates: readonly DuplicateCaseId[]
}): {
	lines: CardLine[]
	declarations: number
} {
	const { root, judged } = params
	const lines: CardLine[] = []
	const exemption = readTddExemption(root)
	const packageJson = readPackageJson(root)
	const base = resolveBase({ root, packageJson })
	if (exemption.kind === 'exempt') {
		if (typeof base !== 'string')
			lines.push(plainLine(`exempt: ${exemption.reason} (${base.failure})`))
		else {
			const changed = countChangedFiles({ root, base, packageJson })
			lines.push(
				plainLine(
					`exempt: ${exemption.reason} (${changed.production} production file(s), ${changed.test} test file(s) changed)`,
				),
			)
		}
	}
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) lines.push(plainLine(acceptances.failure))
	const revisions = readRevisions(root)
	if ('failure' in revisions) lines.push(plainLine(revisions.failure))
	const goneEntries = readGoneEntries(root)
	if ('failure' in goneEntries) lines.push(plainLine(goneEntries.failure))
	const gone = 'failure' in goneEntries ? [] : goneEntries
	const ledger = readLedger(root)
	if ('failure' in ledger) {
		lines.push(plainLine(ledger.failure))
		lines.push(...toReadLines({ revised: [], revisedHelpers: [], gone, unused: [], skipped: [] }))
		return { lines, declarations: gone.length }
	}
	const receipts = ledger.entries.filter((entry): entry is TddReceipt => entry.kind !== 'freeze')
	const ofChange = judged ? receipts.filter((receipt) => judged.has(caseLabel(receipt))) : []
	const declaredAcceptances = 'failure' in acceptances ? [] : acceptances
	const declaredRevisions = 'failure' in revisions ? [] : revisions
	const accepted = caseEntryLines({
		receipts,
		ofChange: ofChange.filter((receipt) => judged?.get(caseLabel(receipt)) === 'accepted'),
		judged,
		declared: declaredAcceptances,
		kind: 'accepted',
		list: 'accept',
	})
	const skipped = skippedReceiptsOf({
		ledger,
		ofChange,
		acceptances: declaredAcceptances,
		revisions: declaredRevisions,
	})
	// the helpers a red run froze for a `revised` entry read as revised cases; with the gate's cases only
	const revisedHelpers =
		judged && typeof base === 'string'
			? listRevisedHelpers({
					ledger,
					testCode: hashChangedTestCode({ root, base, packageJson }),
					revisions: declaredRevisions,
				})
			: []
	const revised = caseEntryLines({
		receipts,
		ofChange: ofChange.filter((receipt) => judged?.get(caseLabel(receipt)) === 'revised'),
		judged,
		declared: declaredRevisions,
		// an entry a helper used is no unused entry, as at the gate
		used: (entry) => namesRevisedHelper({ entry, helpers: revisedHelpers }),
		kind: 'revised',
		list: 'revised',
	})
	if (!judged && receipts.length) lines.push(plainLine(TDD_COUNTS_FROM_GATE_LINE))
	const counts = judged && proofCountsLine({ receipts: ofChange, judged })
	if (counts) lines.push(counts)
	// one grouped line per source file cases moved out of, under the counts that read them unchanged
	if (judged) lines.push(...params.moved.map(plainLine))
	// one failed line per shared id: the gate's tdd step failed on them, the card is blocked
	lines.push(
		...params.duplicates.map((duplicate) =>
			plainLine(
				[
					`${CARD_GATE_MARKS.failed} ${DUPLICATE_CARD_LABEL}`,
					caseLabel(duplicate),
					DUPLICATE_LINES_DETAIL.replace('{lines}', () => writtenLinesOf(duplicate)),
				].join('  '),
			),
		),
	)
	if (accepted.listed.length)
		lines.push(...acceptedLines({ listed: accepted.listed, declared: declaredAcceptances }))
	const earlier = [
		accepted.earlier ? `${accepted.earlier} accepted` : '',
		revised.earlier ? `${revised.earlier} revised` : '',
	].filter(Boolean)
	if (earlier.length)
		lines.push(plainLine(EARLIER_LOTS_LINE.replace('{counts}', earlier.join(', '))))
	// without the gate's cases, no entry can be told unused
	const unused = judged ? [...accepted.unused, ...revised.unused] : []
	lines.push(
		...toReadLines({ revised: revised.listed, revisedHelpers, gone, unused, skipped }),
		...flagLines(ofChange),
	)
	return {
		lines,
		declarations:
			revised.listed.length + revisedHelpers.length + gone.length + unused.length + skipped.length,
	}
}

/**
 * The cases of the change (the gate's judged cases) the read rule skips receipts of (`countingReceipts`):
 * an acceptance or a revision the lot file no longer declares, an acceptance after a proof. One per case,
 * in ledger order.
 */
function skippedReceiptsOf(params: {
	ledger: TddLedger
	/** The receipts of the cases of the change. */
	ofChange: readonly TddReceipt[]
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
}): CaseSkippedReceipts[] {
	const cases = new Map<string, TestCaseId>()
	for (const receipt of params.ofChange)
		cases.set(caseLabel(receipt), {
			file: receipt.file,
			name: receipt.name,
			project: receipt.project,
		})
	return [...cases.values()].flatMap(function skippedOf(testCase): CaseSkippedReceipts[] {
		const { skipped } = countingReceipts({ ...params, testCase })
		return skipped.length ? [{ testCase, skipped }] : []
	})
}

/** A tdd line that wraps under its first column. */
function plainLine(text: string): CardLine {
	return { text, hang: 0 }
}

/**
 * `<n> proven red → green · <m> unchanged` (`· <k> kept` when any): each judged case counted once, by the
 * status the gate gave it - red then green counts proven, unless its last proof in the ledger is a kept
 * after a green (then kept); unchanged counts unchanged; accepted, revised and open cases in none. No line
 * when no case counts.
 */
function proofCountsLine(params: {
	receipts: readonly TddReceipt[]
	judged: ReadonlyMap<string, CaseStatus>
}): CardLine | undefined {
	const { receipts } = params
	const proofByCase = new Map<string, TddProof>()
	for (const receipt of receipts) {
		const label = caseLabel(receipt)
		const proof = proofByCase.get(label)
		if (receipt.kind === 'red') proofByCase.set(label, 'red')
		else if (receipt.kind === 'green') proofByCase.set(label, 'proven')
		else if (receipt.kind === 'unchanged') proofByCase.set(label, 'unchanged')
		else if (receipt.kind === 'kept' && (proof === 'proven' || proof === 'kept'))
			proofByCase.set(label, 'kept')
	}
	const proofs = [...params.judged].map(function proofOf([label, status]): TddProof | undefined {
		if (status === 'unchanged') return 'unchanged'
		if (status !== 'green') return undefined
		return proofByCase.get(label) === 'kept' ? 'kept' : 'proven'
	})
	function countOf(proof: TddProof): number {
		return proofs.filter((each) => each === proof).length
	}
	const proven = countOf('proven')
	const unchanged = countOf('unchanged')
	const kept = countOf('kept')
	if (proven + unchanged + kept === 0) return undefined
	return plainLine(
		[
			`${proven} ${TDD_COUNT_WORDS.proven}`,
			`${unchanged} ${TDD_COUNT_WORDS.unchanged}`,
			...(kept ? [`${kept} ${TDD_COUNT_WORDS.kept}`] : []),
		].join(CARD_PART_SEPARATOR),
	)
}

/**
 * `<n> accepted`, then one row per reason of the lot file's entries - `  <count>  <reason>`, the counts
 * aligned - the largest group first, a tie in the lot file's order; each reason wrapped under itself.
 */
function acceptedLines(params: {
	listed: readonly DeclaredReceipt[]
	declared: readonly LotCaseEntry[]
}): CardLine[] {
	const groups = new Map<string, number>()
	for (const { entry } of params.listed)
		groups.set(entry.reason, (groups.get(entry.reason) ?? 0) + 1)
	function fileOrder(reason: string): number {
		return params.declared.findIndex((entry) => entry.reason === reason)
	}
	const reasons = [...groups].sort(
		(first, second) => second[1] - first[1] || fileOrder(first[0]) - fileOrder(second[0]),
	)
	const countWidth = Math.max(...reasons.map(([, count]) => String(count).length))
	const hang = ACCEPTED_REASON_INDENT.length * 2 + countWidth
	return [
		plainLine(`${params.listed.length} accepted`),
		...reasons.map(([reason, count]) => ({
			text: `${ACCEPTED_REASON_INDENT}${String(count).padStart(countWidth)}${ACCEPTED_REASON_INDENT}${reason}`,
			hang,
			plain: `${count} ${reason}`,
		})),
	]
}

/**
 * The entries a person must read: a head line counting each kind (`to read ↓` at the right edge), then
 * one entry each - `revised <file> › <case title>` (the title cut to one row) with its reason on the next
 * line, `gone <file> (<reason>)`, the unused entries - each wrapped under its text column.
 */
function toReadLines(params: {
	revised: readonly DeclaredReceipt[]
	/** The helpers a red run froze for a `revised` entry: `revised <helper>`, no case title. */
	revisedHelpers: readonly RevisedHelper[]
	gone: readonly LotGoneEntry[]
	unused: readonly string[]
	/** The cases of the change with receipts the read rule skips: `skipped <file> › <case title>: <receipts>`. */
	skipped: readonly CaseSkippedReceipts[]
}): CardLine[] {
	const { revised, revisedHelpers, gone, unused, skipped } = params
	const revisedCount = revised.length + revisedHelpers.length
	const head = [
		revisedCount ? `${revisedCount} ${TO_READ_LABELS.revised}` : '',
		gone.length ? `${gone.length} ${TO_READ_LABELS.gone}` : '',
		unused.length ? `${unused.length} ${TO_READ_LABELS.unused}` : '',
		skipped.length ? `${skipped.length} ${TO_READ_LABELS.skipped}` : '',
	].filter(Boolean)
	if (!head.length) return []
	function entryLead(label: string): string {
		return `${TO_READ_INDENT}${label.padEnd(TO_READ_LABEL_WIDTH)}`
	}
	const hang = entryLead('').length
	/** An entry's line: its label padded to the column, its text after; plain, one space between. */
	function entryLine(params: { label: string; text: string; cut?: boolean }): CardLine {
		return {
			text: `${entryLead(params.label)}${params.text}`,
			hang,
			plain: `${params.label} ${params.text}`,
			...(params.cut && { cut: true }),
		}
	}
	return [
		{ text: head.join(CARD_PART_SEPARATOR), hang: 0, trailing: TO_READ_MARK },
		...revised.flatMap(({ receipt, entry }): CardLine[] => [
			entryLine({
				label: TO_READ_LABELS.revised,
				text: `${receipt.file}${CASE_TITLE_SEPARATOR}${receipt.name}${receipt.project ? ` [${receipt.project}]` : ''}`,
				cut: true,
			}),
			{ text: `${' '.repeat(hang)}${entry.reason}`, hang, plain: entry.reason },
		]),
		...revisedHelpers.flatMap(({ file, entry }): CardLine[] => [
			entryLine({ label: TO_READ_LABELS.revised, text: file, cut: true }),
			{ text: `${' '.repeat(hang)}${entry.reason}`, hang, plain: entry.reason },
		]),
		...gone.map((entry) =>
			entryLine({ label: TO_READ_LABELS.gone, text: `${entry.file} (${entry.reason})` }),
		),
		...unused.map((text) => entryLine({ label: TO_READ_LABELS.unused, text })),
		...skipped.map(({ testCase, skipped: receipts }) =>
			entryLine({
				label: TO_READ_LABELS.skipped,
				text: `${testCase.file}${CASE_TITLE_SEPARATOR}${testCase.name}${testCase.project ? ` [${testCase.project}]` : ''}: ${describeSkippedReceipts(receipts)}`,
			}),
		),
	]
}

/**
 * One line per kind of flag with its count of cases, in a fixed order; a case whose only flag is `test code
 * changed around it` and whose receipts are otherwise only unchanged is counted apart, as noise: decided
 * by its flags, so a case flagged rollback or red after green never is.
 */
function flagLines(receipts: readonly TddReceipt[]): CardLine[] {
	const receiptsByCase = new Map<string, TddReceipt[]>()
	for (const receipt of receipts) {
		const label = caseLabel(receipt)
		receiptsByCase.set(label, [...(receiptsByCase.get(label) ?? []), receipt])
	}
	const casesByFlag = new Map<string, number>()
	let noise = 0
	for (const caseReceipts of receiptsByCase.values()) {
		const flags = new Set(caseReceipts.flatMap((receipt) => receipt.flags ?? []))
		if (flags.size === 0) continue
		const onlyNoiseFlag = [...flags].every((flag) => flag === NOISE_PRONE_FLAG)
		const onlyUnchanged = caseReceipts.every(
			(receipt) => receipt.kind === 'unchanged' || receipt.kind === 'kept',
		)
		if (onlyNoiseFlag && onlyUnchanged) {
			noise++
			continue
		}
		for (const flag of flags) casesByFlag.set(flag, (casesByFlag.get(flag) ?? 0) + 1)
	}
	function flagOrder(flag: string): number {
		const index = FLAG_ORDER.indexOf(flag)
		return index < 0 ? FLAG_ORDER.length : index
	}
	const kinds = [...casesByFlag].sort((first, second) => flagOrder(first[0]) - flagOrder(second[0]))
	return [
		...kinds.map(([flag, count]) => plainLine(`${counted({ count, noun: 'flag' })}: ${flag}`)),
		...(noise ? [plainLine(`${counted({ count: noise, noun: 'flag' })}: ${NOISE_FLAG_LINE}`)] : []),
	]
}

/**
 * The accepted (or revised) receipts of the cases of the change whose case the lot file names, each with
 * the file's entry; how many cases of the ledger outside the change the file does not name (earlier lots')
 * there are; then
 * the entries of the file no red run of a case of the change used (nor `used` otherwise), as their lines.
 */
function caseEntryLines(params: {
	/** Every receipt of the ledger. */
	receipts: readonly TddReceipt[]
	/** The receipts of the cases of the change (the gate's judged cases); none without a gate. */
	ofChange: readonly TddReceipt[]
	/** The cases of the change, by label, as the gate judged them: never counted among earlier lots'. */
	judged: ReadonlyMap<string, CaseStatus> | undefined
	declared: readonly LotCaseEntry[]
	/** An entry used otherwise than by a case (a helper a red run froze for it): never unused. */
	used?: (entry: LotCaseEntry) => boolean
	kind: 'accepted' | 'revised'
	list: LotCaseList
}): { listed: DeclaredReceipt[]; earlier: number; unused: string[] } {
	const { list, ofChange } = params
	// one per case, however many runs recorded it
	function lastOfKind(receipts: readonly TddReceipt[]): TddReceipt[] {
		const byCase = new Map<string, TddReceipt>()
		for (const receipt of receipts)
			if (receipt.kind === params.kind) byCase.set(caseLabel(receipt), receipt)
		return [...byCase.values()]
	}
	const recorded = lastOfKind(ofChange)
	const listed: DeclaredReceipt[] = []
	for (const receipt of recorded) {
		const entry = findCaseEntry({ entries: params.declared, testCase: receipt, list })
		if (entry) listed.push({ receipt, entry })
	}
	const earlier = lastOfKind(params.receipts).filter(
		(receipt) =>
			!params.judged?.has(caseLabel(receipt)) &&
			!findCaseEntry({ entries: params.declared, testCase: receipt, list }),
	).length
	const unused = params.declared
		.filter(
			(entry) =>
				!recorded.some((receipt) =>
					entryNamesCase({ entry: entry.case, testCase: receipt, list }),
				) && !params.used?.(entry),
		)
		.map(
			(entry) =>
				`${list} ${entry.case} (${entry.reason}): ${
					ofChange.some((receipt) => entryNamesCase({ entry: entry.case, testCase: receipt, list }))
						? `not ${params.kind} at a red run`
						: 'no receipt of that case'
				}`,
		)
	return { listed, earlier, unused }
}

/**
 * The card in sections: the verdict with the size and the declarations to read, then the commit, gates, the
 * usage row (a lot folder's stations), contrib (a contributor's), review (READY only), tdd and notes (before a run
 * only) sections; the command is printed under the box, whole.
 */
export function handoverCardSections(card: HandoverCard): SectionCard {
	return {
		// the repository's own folder, never the worktree's: the index is shown once
		title: (card.index ? HANDOVER_CARD_NUMBERED_TITLE : HANDOVER_CARD_TITLE)
			.replace('{index}', card.index ?? '')
			.replace('{repository}', basename(card.repository))
			.replace('{branch}', () => card.branch),
		sections: [
			{ lines: verdictLines(card) },
			{ name: HANDOVER_CARD_SECTIONS.commit, lines: commitLines(card) },
			{ name: HANDOVER_CARD_SECTIONS.gates, lines: gateLines(card.gates) },
			...usageSection(card),
			...(card.contrib
				? [{ name: HANDOVER_CARD_SECTIONS.contrib, lines: gateLines(contribLines(card.contrib)) }]
				: []),
			...(card.review
				? [{ name: HANDOVER_CARD_SECTIONS.review, lines: reviewLines(card.review) }]
				: []),
			...(card.tdd?.length ? [{ name: HANDOVER_CARD_SECTIONS.tdd, lines: card.tdd }] : []),
			...optionalSection({ name: HANDOVER_CARD_SECTIONS.notes, text: card.notes }),
		],
		footer: footerOf(card),
	}
}

/**
 * The usage row in a section of its own, no rule: what the lot's stations cost and the report that details it,
 * the lot named by its folder; none without a usage. Never a gate line: it plays no part in the verdict.
 */
function usageSection(card: HandoverCard): CardSection[] {
	const { usage, folder } = card
	if (usage === undefined || folder === undefined) return []
	const text = USAGE_ROW.replace('{tokens}', formatLotTokens({ total: usage.tokens.total }))
		.replace('{agents}', counted({ count: usage.agents, noun: 'agent' }))
		.replace('{runs}', counted({ count: usage.runs, noun: 'run' }))
		.replace(
			'{time}',
			formatAgentTime({ agentTime: usage.agentTime, runs: usage.runs, texts: USAGE_AGENT_TIME }),
		)
		.replace('{lot}', basename(folder))
	// a wrapped row continues under its value, after the label
	return [{ lines: [{ text, hang: USAGE_ROW.indexOf('{tokens}') }] }]
}

/** The closing rule: the hand-over's registered name, else its folder, so a partial copy still names it. */
function footerOf(card: HandoverCard): string {
	const id = card.name ?? card.folder
	if (!id) return HANDOVER_CARD_FOOTER
	// one shell word, so the footer's commands run as copied; a plain path stays as it reads
	return HANDOVER_CARD_NAMED_FOOTER.replaceAll('{id}', shellWord(id))
}

/**
 * The card as data (`--json`): the tdd lines as the text a person reads - no layout field; only the
 * layout the card puts in a line left out (its indent, a label's padding, a count's alignment, the
 * right-edge mark): the runs of spaces inside titles, reasons and paths kept.
 */
export function handoverCardData(card: HandoverCard): HandoverCardData {
	const { tdd, ...rest } = card
	return {
		...rest,
		...(tdd && { tdd: tdd.map((line) => line.plain ?? line.text.trimStart()) }),
	}
}

/** `+<added> −<removed>`. */
function lineCounts(size: { insertions: number; deletions: number }): string {
	return `+${size.insertions} ${MINUS_SIGN}${size.deletions}`
}

/**
 * The verdict line: the word, the lots, files and lines (the merges not sized yet counted apart), then
 * the gates' and the target's tail; the declarations to read on a second line under the size, the target's `!` line
 * last.
 */
function verdictLines(card: HandoverCard): CardLine[] {
	const sized = card.lots.filter((lot) => !lot.notSized)
	const notSized = card.lots.length - sized.length
	const tail = [
		card.failedGates.length
			? `${counted({ count: card.failedGates.length, noun: 'gate' })} failed: ${card.failedGates.join(', ')}`
			: '',
		card.otherTreeGates.length
			? OTHER_TREE_GATES.replace('{names}', card.otherTreeGates.join(', '))
			: '',
		targetTailOf(card),
	].filter(Boolean)
	const size = [
		counted({ count: card.lots.length, noun: 'lot' }),
		counted({ count: sum(sized.map((lot) => lot.fileCount)), noun: 'file' }),
		lineCounts({
			insertions: sum(sized.map((lot) => lot.insertions)),
			deletions: sum(sized.map((lot) => lot.deletions)),
		}),
		...(notSized ? [`${counted({ count: notSized, noun: 'merge' })} not sized`] : []),
		...(tail.length ? tail : [ALL_GATES_GREEN]),
	].join(CARD_PART_SEPARATOR)
	const hang = card.verdict.length + 2
	const targetLead = `${CARD_GATE_MARKS.warning} `
	return [
		{ text: `${card.verdict}  ${size}`, hang, emphasis: 'strong' },
		...(card.declarations
			? [
					{
						text: `${' '.repeat(hang)}${counted({ count: card.declarations, noun: 'declaration' })} to read (below)`,
						hang,
					},
				]
			: []),
		...(card.targetLine === undefined
			? []
			: [{ text: `${targetLead}${card.targetLine}`, hang: targetLead.length }]),
	]
}

/** The verdict's tail part for a target that blocks (its `!` line under the verdict), else empty. */
function targetTailOf(card: HandoverCard): string {
	if (card.targetLine === undefined) return ''
	return card.targetMoved
		? TARGET_MOVED_TAIL.replace('{branch}', () => card.targetMoved?.branch ?? '')
		: TARGET_NOT_FOUND_TAIL
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0)
}

/**
 * One line per lot - its commit or `pending`, its files, its lines, its subject (the sized lots' columns
 * aligned) - a merge lot's merge line under its subject, then HEAD (`base → tip · nothing pushed` after a
 * run). On a width that leaves the subject too little room, the subject and the merge line go under the
 * lot's columns.
 */
function commitLines(card: HandoverCard): CardLine[] {
	const sized = card.lots.filter((lot) => !lot.notSized)
	const fileWidth = Math.max(0, ...sized.map((lot) => filesCell(lot).length))
	const countWidth = Math.max(0, ...sized.map((lot) => lineCounts(lot).length))
	const lines = card.lots.flatMap(function lotLines(lot): CardLine[] {
		const sha = lot.commit ? lot.commit.slice(0, CARD_SHA_LENGTH) : PENDING_COMMIT
		const size = lot.notSized
			? MERGE_NOT_SIZED
			: `${filesCell(lot).padEnd(fileWidth)}  ${lineCounts(lot).padEnd(countWidth)}`
		const lead = `${sha}  ${size}  `
		return [
			{ text: `${lead}${lot.subject}`, hang: lead.length, stack: true },
			...(lot.merge
				? [{ text: `${' '.repeat(lead.length)}${lot.merge}`, hang: lead.length, stack: true }]
				: []),
		]
	})
	const head = card.head.slice(0, CARD_SHA_LENGTH)
	const moved = card.tip && card.tip !== card.head
	const headText = moved
		? `HEAD ${head} → ${card.tip?.slice(0, CARD_SHA_LENGTH)}${CARD_PART_SEPARATOR}${NOTHING_PUSHED}`
		: `HEAD ${head}`
	return [
		...lines,
		{ text: headText, hang: 'HEAD '.length },
		{ text: `${WORKTREE_LINE_LABEL}${worktreeShown(card)}`, hang: WORKTREE_LINE_LABEL.length },
	]
}

/**
 * The worktree as the card names it: relative to the workspace (the main checkout's folder) when it is inside
 * it (`.worktrees/0171-cli-x`, `cli` for the main checkout), else its absolute path. Both sides compared as real
 * paths, so a side reached through a link (`/var` -> `/private/var`) reads the same as one reached directly.
 */
function worktreeShown(card: HandoverCard): string {
	const workspace = realPathThroughAncestors(dirname(card.repository))
	const worktree = realPathThroughAncestors(card.worktree)
	return isInside({ path: worktree, folder: workspace })
		? relative(workspace, worktree)
		: card.worktree
}

function filesCell(lot: CardLot): string {
	return counted({ count: lot.fileCount, noun: 'file' })
}

/** The gate lines: `<mark> <name>  <detail>`, the details aligned, the mark in its status's colour. */
function gateLines(lines: readonly CardGateLine[]): CardLine[] {
	const nameWidth = Math.max(...lines.map((line) => line.name.length))
	return lines.map((line) => ({
		text: `${CARD_GATE_MARKS[line.status]} ${line.name.padEnd(nameWidth)}  ${line.detail}`.trimEnd(),
		hang: 2 + nameWidth + 2,
		emphasis: line.status,
	}))
}

/**
 * The contrib section's lines: one `contrib` line naming every row when each one passed, with the source of the
 * record they came from (`· rehearsal`, `· from <commit>`); else the rows, one line each.
 */
function contribLines(lines: readonly CardGateLine[]): readonly CardGateLine[] {
	if (!lines.every((line) => line.status === 'passed')) return lines
	const source = lines.find((line) => line.source)?.source
	return [
		{
			name: CONTRIB_LINE_NAME,
			status: 'passed',
			detail: [...lines.map((line) => line.name), ...(source ? [source] : [])].join(
				DETAIL_SEPARATOR,
			),
		},
	]
}

/** The `review` section's one line: the command, then the editor it opens; a wrap hangs under the command. */
function reviewLines(review: HandoverReviewRow): CardLine[] {
	return [
		{
			text:
				review.editor === undefined
					? HANDOVER_REVIEW_NO_EDITOR_ROW.replace('{command}', review.command).replace(
							'{key}',
							EDITOR_CONFIG_KEY,
						)
					: HANDOVER_REVIEW_ROW.replace('{command}', review.command).replace(
							'{editor}',
							review.editor,
						),
			hang: 0,
		},
	]
}

/** A section of the text's lines, none when there is no text. */
function optionalSection(params: { name: string; text: string | undefined }): CardSection[] {
	if (!params.text) return []
	return [
		{ name: params.name, lines: params.text.split(/\r?\n/).map((text) => ({ text, hang: 0 })) },
	]
}
