/** The hand-over card: what is committed where, the gates run, and the command, before and after the run. */
import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
	COMMIT_SCRIPT_FILE,
	EARLIER_LOTS_LINE,
	FLAGS_LIST_COMMAND,
	HANDOVER_PROBE_ANSWER,
	HANDOVER_PROBE_COMMAND,
	HANDOVER_PROBE_FOLDER_PREFIX,
	HANDOVER_PROBE_TIMEOUT_MILLISECONDS,
} from './handover.constants.ts'
import { commitSizeOf, workingTreeSizeOf } from './lot-size.ts'

import type { Card } from '../card/card.types.ts'
import type { LotCaseEntry, LotCaseList, TddLedger, TddReceipt } from '../tdd/tdd.types.ts'
import type { HandoverCard, MergeLot, ResolvedLot } from './handover.types.ts'

export function buildHandoverCard(params: {
	/** Where the lots are committed. */
	root: string
	/** Where the commits named in `commits` are, when not in `root` (a rehearsal clone). */
	commitRoot?: string
	folder: string
	branch: string
	head: string
	gates: string | undefined
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
	const merges = params.lots.flatMap((lot, index) =>
		lot.merge ? [mergeLine({ merge: lot.merge, number: index + 1 })] : [],
	)
	return {
		repository: mainCheckoutOf(root),
		worktree: root,
		branch: params.branch,
		head: params.head,
		gates: params.gates ?? 'not stated',
		...tddRow(root),
		lots: params.lots.map(function cardLot(lot, index) {
			const commit = params.commits[index]
			const size = commit
				? commitSizeOf({ root: commitRoot, commit })
				: workingTreeSizeOf({ root: commitRoot, files: lot.files, deletedFiles: lot.deletedFiles })
			return {
				index: index + 1,
				fileCount: lot.merge
					? lot.merge.resolutions.length
					: lot.files.length + lot.deletedFiles.length,
				subject: lot.message.trim().split('\n')[0],
				...size,
				...(commit && { commit }),
			}
		}),
		...(params.commits.length && { tip: params.commits.at(-1) }),
		...(merges.length && { merges }),
		...(params.done && { done: true }),
		command: ownCli
			? `cd ${shellQuote(params.folder)} && bash ${COMMIT_SCRIPT_FILE}`
			: `node ${shellQuote(params.cliPath ?? '')} handover run ${shellQuote(params.folder)}`,
	}
}

/** A merge lot on the card: what it merges, its conflicts, and the tree it must hold (or that it is not recorded). */
function mergeLine(params: { merge: MergeLot; number: number }): string {
	const { merge } = params
	return `lot ${params.number}: merge ${merge.branch} at ${merge.tip.slice(0, 12)}, ${merge.conflicts.length} conflict(s), ${merge.resolutions.length} resolved file(s); ${merge.tree ? `tree ${merge.tree.slice(0, 12)}` : 'tree not recorded: rehearse first'}`
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
 * touches), the cases its lot file accepts without a red or revised at review (the receipts of earlier
 * lots, which the lot file no longer names, as one count per kind), the test calls it declares gone, and
 * how many cases each kind of flag marks (a rollback, a red after a green), with the command that lists
 * them.
 */
function tddRow(root: string): { tdd?: string } {
	const lines: string[] = []
	const exemption = readTddExemption(root)
	if (exemption.kind === 'exempt') {
		const packageJson = readPackageJson(root)
		const base = resolveBase({ root, packageJson })
		if (typeof base !== 'string') lines.push(`exempt: ${exemption.reason} (${base.failure})`)
		else {
			const changed = countChangedFiles({ root, base, packageJson })
			lines.push(
				`exempt: ${exemption.reason} (${changed.production} production file(s), ${changed.test} test file(s) changed)`,
			)
		}
	}
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) lines.push(acceptances.failure)
	const revisions = readRevisions(root)
	if ('failure' in revisions) lines.push(revisions.failure)
	const gone = readGoneEntries(root)
	lines.push(
		...('failure' in gone
			? [gone.failure]
			: gone.map((entry) => `gone: ${entry.file} (${entry.reason})`)),
	)
	const ledger = readLedger(root)
	if ('failure' in ledger) lines.push(ledger.failure)
	else {
		const accepted = caseEntryLines({
			ledger,
			declared: 'failure' in acceptances ? [] : acceptances,
			kind: 'accepted',
			list: 'accept',
		})
		const revised = caseEntryLines({
			ledger,
			declared: 'failure' in revisions ? [] : revisions,
			kind: 'revised',
			list: 'revised',
		})
		lines.push(...accepted.lines, ...revised.lines)
		const earlier = [
			accepted.earlier ? `${accepted.earlier} accepted` : '',
			revised.earlier ? `${revised.earlier} revised` : '',
		].filter(Boolean)
		if (earlier.length) lines.push(EARLIER_LOTS_LINE.replace('{counts}', earlier.join(', ')))
		// the flags as a count per kind: the list is one command away
		const casesByFlag = new Map<string, Set<string>>()
		for (const entry of ledger.entries) {
			if (entry.kind === 'freeze') continue
			for (const flag of entry.flags ?? [])
				casesByFlag.set(flag, (casesByFlag.get(flag) ?? new Set()).add(caseLabel(entry)))
		}
		if (casesByFlag.size)
			lines.push(
				`${[...casesByFlag].map(([flag, cases]) => `${cases.size} flags: ${flag}`).join('; ')} - ${FLAGS_LIST_COMMAND} for the list`,
			)
	}
	return lines.length ? { tdd: lines.join('\n') } : {}
}

/**
 * The accepted (or revised) receipts of the ledger whose case the lot file names, each with the file's
 * reason; how many cases of the others (earlier lots') there are; then the entries of the file no red run
 * used.
 */
function caseEntryLines(params: {
	ledger: TddLedger
	declared: readonly LotCaseEntry[]
	kind: 'accepted' | 'revised'
	list: LotCaseList
}): { lines: string[]; earlier: number } {
	const { list } = params
	const receipts = params.ledger.entries.filter(
		(entry): entry is TddReceipt => entry.kind !== 'freeze',
	)
	// one per case, however many runs recorded it
	const recorded = new Map<string, TddReceipt>()
	for (const receipt of receipts)
		if (receipt.kind === params.kind) recorded.set(caseLabel(receipt), receipt)
	const lines: string[] = []
	let earlier = 0
	for (const [label, receipt] of recorded) {
		const declared = findCaseEntry({ entries: params.declared, testCase: receipt, list })
		if (declared) lines.push(`${params.kind}: ${label} (${declared.reason})`)
		else earlier++
	}
	for (const entry of params.declared)
		if (
			![...recorded.values()].some((receipt) =>
				entryNamesCase({ entry: entry.case, testCase: receipt, list }),
			)
		)
			lines.push(
				`${list} unused: ${entry.case} (${entry.reason}): ${
					receipts.some((receipt) => entryNamesCase({ entry: entry.case, testCase: receipt, list }))
						? `not ${params.kind} at a red run`
						: 'no receipt of that case'
				}`,
			)
	return { lines, earlier }
}

/** The card as rows: the lots aligned in columns, a committed one with its commit. */
export function handoverCardRows(card: HandoverCard): Card {
	const columns = card.lots.map((lot) => [
		String(lot.index),
		`${lot.fileCount} ${lot.fileCount === 1 ? 'file' : 'files'}`,
		`+${lot.insertions} -${lot.deletions}`,
		lot.commit ? lot.commit.slice(0, 7) : 'pending',
		lot.subject,
	])
	const widths = [0, 1, 2, 3].map((column) =>
		Math.max(...columns.map((cells) => cells[column].length)),
	)
	return {
		title: 'hand-over',
		rows: [
			{ label: 'repository', lines: [card.repository] },
			{ label: 'worktree', lines: [card.worktree] },
			{ label: 'branch', lines: [card.branch] },
			{
				label: 'HEAD',
				lines: [
					card.tip && card.tip !== card.head
						? `${card.head.slice(0, 12)} → ${card.tip.slice(0, 12)}`
						: card.head.slice(0, 12),
				],
			},
			{ label: 'gates', lines: card.gates.split(/\r?\n/) },
			...(card.merges ? [{ label: 'merges', lines: card.merges }] : []),
			...(card.tdd ? [{ label: 'tdd', lines: card.tdd.split('\n') }] : []),
			{
				label: `lots (${card.lots.length})`,
				lines: columns.map((cells) =>
					cells.map((cell, column) => (column < 4 ? cell.padEnd(widths[column]) : cell)).join('  '),
				),
			},
			// the command is printed whole under the box: a wrapped one cannot be copied
			{ label: 'run', lines: [card.done ? 'done' : 'see below'] },
		],
	}
}
