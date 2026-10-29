/** The hand-over card: what is committed where, the gates run, and the command, before and after the run. */
import { mainCheckoutOf } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { shellQuote } from '../shell-quote.ts'
import { readAcceptances, readTddExemption } from '../tdd/lot-declaration.ts'
import { caseLabel } from '../tdd/select-cases.ts'
import { countChangedFiles, readLedger, resolveBase } from '../tdd/tdd-files.ts'
import { COMMIT_SCRIPT_FILE } from './handover.constants.ts'
import { commitSizeOf, workingTreeSizeOf } from './lot-size.ts'

import type { Card } from '../card/card.types.ts'
import type { CaseAcceptance, TddLedger, TddReceipt } from '../tdd/tdd.types.ts'
import type { HandoverCard, ResolvedLot } from './handover.types.ts'

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
}): HandoverCard {
	const { root } = params
	const commitRoot = params.commitRoot ?? root
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
				fileCount: lot.files.length + lot.deletedFiles.length,
				subject: lot.message.trim().split('\n')[0],
				...size,
				...(commit && { commit }),
			}
		}),
		command: `cd ${shellQuote(params.folder)} && bash ${COMMIT_SCRIPT_FILE}`,
	}
}

/**
 * The test receipts as the reviewer of the hand-over needs them: the lot's exemption (with what the change
 * touches), the cases it accepts without a red, and every flag a receipt of the worktree carries (a rollback, a red after a green).
 */
function tddRow(root: string): { tdd?: string } {
	const lines: string[] = []
	const exemption = readTddExemption(root)
	if (exemption.kind === 'exempt') {
		const packageJson = readPackageJson(root)
		const changed = countChangedFiles({
			root,
			base: resolveBase({ root, packageJson }),
			packageJson,
		})
		lines.push(
			`exempt: ${exemption.reason} (${changed.production} production file(s), ${changed.test} test file(s) changed)`,
		)
	}
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) lines.push(acceptances.failure)
	const declared = 'failure' in acceptances ? [] : acceptances
	const ledger = readLedger(root)
	if ('failure' in ledger) lines.push(ledger.failure)
	else {
		lines.push(...acceptanceLines({ ledger, declared }))
		const flagged = new Map<string, Set<string>>()
		for (const entry of ledger.entries) {
			if (entry.kind === 'freeze' || !entry.flags?.length) continue
			const label = caseLabel(entry)
			const flags = flagged.get(label) ?? new Set<string>()
			for (const flag of entry.flags) flags.add(flag)
			flagged.set(label, flags)
		}
		for (const [label, flags] of flagged) lines.push(`flag: ${label} (${[...flags].join(', ')})`)
	}
	return lines.length ? { tdd: lines.join('\n') } : {}
}

/**
 * The accepted receipts of the ledger, each with the reason the lot file gives (or marked when its entry
 * left the file), then the acceptances of the file no red run used.
 */
function acceptanceLines(params: {
	ledger: TddLedger
	declared: readonly CaseAcceptance[]
}): string[] {
	const receipts = params.ledger.entries.filter(
		(entry): entry is TddReceipt => entry.kind !== 'freeze',
	)
	const accepted = new Map<string, string>()
	for (const receipt of receipts)
		if (receipt.kind === 'accepted') accepted.set(caseLabel(receipt), receipt.reason ?? '')
	const lines = [...accepted].map(([label, reason]) => {
		const declared = params.declared.find((acceptance) => acceptance.case === label)
		return declared
			? `accepted: ${label} (${declared.reason})`
			: `accepted: ${label} (${reason}) - no longer in the lot file`
	})
	for (const acceptance of params.declared)
		if (!accepted.has(acceptance.case))
			lines.push(
				`accept unused: ${acceptance.case} (${acceptance.reason}): ${
					receipts.some((receipt) => caseLabel(receipt) === acceptance.case)
						? 'not accepted at a red run'
						: 'no receipt of that case'
				}`,
			)
	return lines
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
			{ label: 'HEAD', lines: [card.head.slice(0, 12)] },
			{ label: 'gates', lines: card.gates.split(/\r?\n/) },
			...(card.tdd ? [{ label: 'tdd', lines: card.tdd.split('\n') }] : []),
			{
				label: `lots (${card.lots.length})`,
				lines: columns.map((cells) =>
					cells.map((cell, column) => (column < 4 ? cell.padEnd(widths[column]) : cell)).join('  '),
				),
			},
			{ label: 'run', lines: [card.command] },
		],
	}
}
