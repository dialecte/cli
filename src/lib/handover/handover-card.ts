/**
 * The hand-over card: the verdict (READY, BLOCKED, DONE) with the size and what to read, what is committed
 * (each lot, a merge with its tree, HEAD), the gates as their records say, the test receipts, the notes (before
 * a run only), and the command, before and after the run.
 */
import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { counted } from '../counted.ts'
import { buildCardGateLines } from '../gate-records/card-gates.ts'
import { CARD_GATE_MARKS } from '../gate-records/gate-records.constants.ts'
import { readJudgedCases } from '../gate-records/gate-records.ts'
import { computeStateHash } from '../gate-records/state-hash.ts'
import { mainCheckoutOf } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { shellQuote } from '../shell-quote.ts'
import {
	entryNamesCase,
	findCaseEntry,
	readAcceptances,
	readGoneEntries,
	readRevisions,
	readTddExemption,
} from '../tdd/lot-declaration.ts'
import { caseLabel } from '../tdd/select-cases.ts'
import { countChangedFiles, readLedger, resolveBase } from '../tdd/tdd-files.ts'
import {
	ACCEPTED_REASON_INDENT,
	ALL_GATES_GREEN,
	CARD_PART_SEPARATOR,
	CARD_SHA_LENGTH,
	COMMIT_SCRIPT_FILE,
	CASE_TITLE_SEPARATOR,
	EARLIER_LOTS_LINE,
	FLAG_ORDER,
	HANDOVER_PROBE_ANSWER,
	HANDOVER_PROBE_COMMAND,
	HANDOVER_PROBE_FOLDER_PREFIX,
	HANDOVER_CARD_FOOTER,
	HANDOVER_CARD_SECTIONS,
	HANDOVER_CARD_TITLE,
	HANDOVER_PROBE_TIMEOUT_MILLISECONDS,
	MERGE_NOT_SIZED,
	MINUS_SIGN,
	NOISE_FLAG_LINE,
	NOISE_PRONE_FLAG,
	NOTHING_PUSHED,
	OTHER_TREE_GATES,
	PENDING_COMMIT,
	TDD_COUNT_WORDS,
	TDD_COUNTS_FROM_GATE_LINE,
	TO_READ_INDENT,
	TO_READ_LABEL_WIDTH,
	TO_READ_LABELS,
	TO_READ_MARK,
	TREE_NOT_RECORDED,
} from './handover.constants.ts'
import { commitSizeOf, treeDiffSizeOf, workingTreeSizeOf } from './lot-size.ts'

import type { CardLine, CardSection, SectionCard } from '../card/card.types.ts'
import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type {
	CaseStatus,
	LotCaseEntry,
	LotCaseList,
	LotGoneEntry,
	TddReceipt,
} from '../tdd/tdd.types.ts'
import type {
	CardLot,
	DeclaredReceipt,
	HandoverCard,
	HandoverCardData,
	HandoverVerdict,
	MergeLot,
	ResolvedLot,
	TddProof,
	TreeDiffSize,
} from './handover.types.ts'

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
	/** How long the repository's cli gets to answer the probe; past it, it counts as none. Default 10 s. */
	probeTimeout?: number
	/** Every lot is committed in the repository: the card says done, no command. */
	done?: boolean
}): HandoverCard {
	const { root } = params
	const commitRoot = params.commitRoot ?? root
	const ownCli =
		params.done ||
		params.cliPath === undefined ||
		runsHandovers({ root, timeout: params.probeTimeout ?? HANDOVER_PROBE_TIMEOUT_MILLISECONDS })
	const stateHash = computeStateHash(root)
	const gates = buildCardGateLines({ root, folder: params.folder, stateHash })
	const failedGates = gates.filter((line) => line.status === 'failed').map((line) => line.name)
	const otherTreeGates = gates
		.filter((line) => line.stale && line.status !== 'failed')
		.map((line) => line.name)
	const tdd = tddSection({ root, judged: readJudgedCases({ root, stateHash }) })
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
	const verdict: HandoverVerdict = params.done
		? 'DONE'
		: failedGates.length || otherTreeGates.length
			? 'BLOCKED'
			: 'READY'
	return {
		repository: mainCheckoutOf(root),
		worktree: root,
		branch: params.branch,
		head: params.head,
		verdict,
		failedGates,
		otherTreeGates,
		declarations: tdd.declarations,
		gates,
		...(params.notes && { notes: params.notes }),
		...(tdd.lines.length && { tdd: tdd.lines }),
		lots,
		...(params.commits.length && { tip: params.commits.at(-1) }),
		...(merges.length && { merges }),
		...(params.done && { done: true }),
		command: ownCli
			? `cd ${shellQuote(params.folder)} && bash ${COMMIT_SCRIPT_FILE}`
			: `node ${shellQuote(params.cliPath ?? '')} handover run ${shellQuote(params.folder)}`,
	}
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

/** The repository installs a cli that runs hand-overs: it answers the probe `commit.sh` sends. */
function runsHandovers(params: { root: string; timeout: number }): boolean {
	const [command, ...args] = HANDOVER_PROBE_COMMAND
	// the answer goes to a file, not a pipe: a process the probe left behind cannot hold the wait open
	const folder = mkdtempSync(join(tmpdir(), HANDOVER_PROBE_FOLDER_PREFIX))
	const answerPath = join(folder, 'answer.txt')
	const answer = openSync(answerPath, 'w')
	try {
		const probe = spawnSync(command, args, {
			cwd: params.root,
			stdio: ['ignore', answer, 'ignore'],
			timeout: params.timeout,
			killSignal: 'SIGKILL',
		})
		// a probe that times out is a cli that cannot be trusted to run the hand-over
		return probe.status === 0 && readFileSync(answerPath, 'utf8').includes(HANDOVER_PROBE_ANSWER)
	} finally {
		closeSync(answer)
		rmSync(folder, { recursive: true, force: true })
	}
}

/**
 * The test receipts as the reviewer of the hand-over needs them: the lot's exemption (with what the change
 * touches); each case counted once by its last proof (proven red → green, unchanged, kept); the cases its
 * lot file accepts without a red, one count per reason; the receipts of earlier lots, which the lot file no
 * longer names, as one count per kind; then the entries a person must read - the revised cases, the test
 * calls declared gone, the unused entries - and how many cases each kind of flag marks, the flagged
 * unchanged cases counted apart as noise. With how many entries are to read (revised, gone, unused).
 * Only the cases of the change count: those the gate's tdd step judged on this tree (`judged`), each
 * classified by the status the gate gave it, so the counts are the gate step's; without
 * them (no gate on this tree) one line asks for the gate instead of the counts, groups, entries and flags.
 */
function tddSection(params: {
	root: string
	judged: ReadonlyMap<string, CaseStatus> | undefined
}): {
	lines: CardLine[]
	declarations: number
} {
	const { root, judged } = params
	const lines: CardLine[] = []
	const exemption = readTddExemption(root)
	if (exemption.kind === 'exempt') {
		const packageJson = readPackageJson(root)
		const base = resolveBase({ root, packageJson })
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
		lines.push(...toReadLines({ revised: [], gone, unused: [] }))
		return { lines, declarations: gone.length }
	}
	const receipts = ledger.entries.filter((entry): entry is TddReceipt => entry.kind !== 'freeze')
	const ofChange = judged ? receipts.filter((receipt) => judged.has(caseLabel(receipt))) : []
	const accepted = caseEntryLines({
		receipts,
		ofChange: ofChange.filter((receipt) => judged?.get(caseLabel(receipt)) === 'accepted'),
		declared: 'failure' in acceptances ? [] : acceptances,
		kind: 'accepted',
		list: 'accept',
	})
	const revised = caseEntryLines({
		receipts,
		ofChange: ofChange.filter((receipt) => judged?.get(caseLabel(receipt)) === 'revised'),
		declared: 'failure' in revisions ? [] : revisions,
		kind: 'revised',
		list: 'revised',
	})
	if (!judged && receipts.length) lines.push(plainLine(TDD_COUNTS_FROM_GATE_LINE))
	const counts = judged && proofCountsLine({ receipts: ofChange, judged })
	if (counts) lines.push(counts)
	if (accepted.listed.length)
		lines.push(
			...acceptedLines({
				listed: accepted.listed,
				declared: 'failure' in acceptances ? [] : acceptances,
			}),
		)
	const earlier = [
		accepted.earlier ? `${accepted.earlier} accepted` : '',
		revised.earlier ? `${revised.earlier} revised` : '',
	].filter(Boolean)
	if (earlier.length)
		lines.push(plainLine(EARLIER_LOTS_LINE.replace('{counts}', earlier.join(', '))))
	// without the gate's cases, no entry can be told unused
	const unused = judged ? [...accepted.unused, ...revised.unused] : []
	lines.push(...toReadLines({ revised: revised.listed, gone, unused }), ...flagLines(ofChange))
	return { lines, declarations: revised.listed.length + gone.length + unused.length }
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
	gone: readonly LotGoneEntry[]
	unused: readonly string[]
}): CardLine[] {
	const { revised, gone, unused } = params
	const head = [
		revised.length ? `${revised.length} ${TO_READ_LABELS.revised}` : '',
		gone.length ? `${gone.length} ${TO_READ_LABELS.gone}` : '',
		unused.length ? `${unused.length} ${TO_READ_LABELS.unused}` : '',
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
		...gone.map((entry) =>
			entryLine({ label: TO_READ_LABELS.gone, text: `${entry.file} (${entry.reason})` }),
		),
		...unused.map((text) => entryLine({ label: TO_READ_LABELS.unused, text })),
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
 * the file's entry; how many cases of the ledger the file does not name (earlier lots') there are; then
 * the entries of the file no red run of a case of the change used, as their lines.
 */
function caseEntryLines(params: {
	/** Every receipt of the ledger. */
	receipts: readonly TddReceipt[]
	/** The receipts of the cases of the change (the gate's judged cases); none without a gate. */
	ofChange: readonly TddReceipt[]
	declared: readonly LotCaseEntry[]
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
		(receipt) => !findCaseEntry({ entries: params.declared, testCase: receipt, list }),
	).length
	const unused = params.declared
		.filter(
			(entry) =>
				!recorded.some((receipt) => entryNamesCase({ entry: entry.case, testCase: receipt, list })),
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
 * The card in sections: the verdict with the size and the declarations to read, then the commit, gates,
 * tdd and notes (before a run only) sections; the command is printed under the box, whole.
 */
export function handoverCardSections(card: HandoverCard): SectionCard {
	return {
		title: HANDOVER_CARD_TITLE.replace('{repository}', basename(card.repository)).replace(
			'{branch}',
			card.branch,
		),
		sections: [
			{ lines: verdictLines(card) },
			{ name: HANDOVER_CARD_SECTIONS.commit, lines: commitLines(card) },
			{ name: HANDOVER_CARD_SECTIONS.gates, lines: gateLines(card.gates) },
			...(card.tdd?.length ? [{ name: HANDOVER_CARD_SECTIONS.tdd, lines: card.tdd }] : []),
			...optionalSection({ name: HANDOVER_CARD_SECTIONS.notes, text: card.notes }),
		],
		footer: HANDOVER_CARD_FOOTER,
	}
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
 * the gates' tail; the declarations to read on a second line under the size.
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
	]
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
	return [...lines, { text: headText, hang: 'HEAD '.length }]
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

/** A section of the text's lines, none when there is no text. */
function optionalSection(params: { name: string; text: string | undefined }): CardSection[] {
	if (!params.text) return []
	return [
		{ name: params.name, lines: params.text.split(/\r?\n/).map((text) => ({ text, hang: 0 })) },
	]
}
