/**
 * The lot `lot start --from <lot>` carries receipts from (FIX-receipt-carry-over D6): its state first (checked before
 * the brief, so a live source with the same scope is told to stop, never met as an overlap), then its repository,
 * worktree, ledger, lot file and bases, every refusal at once. Nothing is written.
 */
import { isUtf8 } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { sha256Of } from '../corpus/corpus-lock.ts'
import { isFolder, realPathOf } from '../file-system.ts'
import { isInWorkTree, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readLotDeclaration } from '../tdd/lot-declaration.ts'
import { ledgerOfText, ledgerPath } from '../tdd/tdd-files.ts'
import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { CARRY_REFUSALS } from './carry-source.constants.ts'
import { readIdentity } from './identity.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { isCanceledByMarkerOnly, lotState } from './lot-state.ts'
import { requiredLotOf } from './resolve-lot.ts'

import type {
	CarryRecord,
	CarryRefusals,
	CarrySource,
	CarrySourceState,
} from './carry-source.types.ts'

/**
 * The lot `argument` names, resolved in `cwd` (the brief's repository), when its state lets a start carry from it;
 * the refusal lines otherwise.
 *
 * @intent check the lot a start carries receipts from
 * @internal
 */
export function checkCarrySourceState(params: {
	cwd: string
	argument: string
}): CarrySourceState | CarryRefusals {
	const { argument } = params
	const required = requiredLotOf({ argument, cwd: params.cwd, mode: 'read' })
	if (!('lot' in required)) return refusedWith({ template: CARRY_REFUSALS.unknown, lot: argument })
	const lotFolder = required.lot
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined || !('input' in checked))
		return refusedWith({ template: CARRY_REFUSALS.damaged, lot: argument })
	const { input } = checked
	if (input.identity.simulated)
		return refusedWith({ template: CARRY_REFUSALS.simulated, lot: argument })
	// canceled by its marker only: `lot stop` writes nothing for it, the run the marker names settles it
	if (isCanceledByMarkerOnly(input))
		return refusedWith({ template: CARRY_REFUSALS.markerOnly, lot: argument })
	const { state } = lotState(input)
	if (state === 'committed')
		return refusedWith({ template: CARRY_REFUSALS.onMain, lot: argument, state })
	if (state !== 'canceled')
		return refusedWith({ template: CARRY_REFUSALS.live, lot: argument, state })
	return { lot: lotFolder, state }
}

/**
 * What a start copies from the checked source: its ledger and declaration read whole, and the bases of the ledger git
 * can read; every refusal at once otherwise.
 *
 * @intent read what a start carries from a canceled lot
 * @internal
 */
export function checkCarrySource(params: {
	source: CarrySourceState
	repository: string
}): CarrySource | CarryRefusals {
	const { source } = params
	const lot = basename(source.lot)
	const identity = readIdentity({ lotFolder: source.lot })
	if (identity === undefined || identity.worktree === null)
		return refusedWith({ template: CARRY_REFUSALS.damaged, lot })
	const repositoryRefusals =
		realPathOf(identity.repository) === realPathOf(params.repository)
			? []
			: [
					fillMessage({
						template: CARRY_REFUSALS.repository,
						values: {
							lot,
							sourceRepository: identity.repository,
							repository: params.repository,
						},
					}),
				]
	if (!isFolder(identity.worktree) || !isInWorkTree(identity.worktree))
		return {
			refusals: [
				...repositoryRefusals,
				fillMessage({
					template: CARRY_REFUSALS.worktreeGone,
					values: { lot, worktree: identity.worktree },
				}),
			],
		}
	const worktree = realPathOf(identity.worktree)
	const ledger = readCarryLedger({ worktree, lot })
	const declaration = readCarryDeclaration({ worktree, lot })
	const refusals = [
		...repositoryRefusals,
		...('refusals' in ledger ? ledger.refusals : []),
		...(declaration !== undefined && 'refusal' in declaration ? [declaration.refusal] : []),
	]
	if (refusals.length > 0 || 'refusals' in ledger) return { refusals }
	return {
		...source,
		worktree,
		ledger: ledger.record,
		...(declaration !== undefined && !('refusal' in declaration) && { declaration }),
		bases: ledger.bases,
		receipts: ledger.receipts,
	}
}

/** One refusal line of a carry check, `{lot}` and `{state}` filled. */
function refusedWith(params: { template: string; lot: string; state?: string }): CarryRefusals {
	const { lot, state } = params
	return {
		refusals: [
			fillMessage({
				template: params.template,
				values: { lot, ...(state !== undefined && { state }) },
			}),
		],
	}
}

/**
 * The source's ledger in its worktree's git folder, read once as bytes: the bytes and their sha256, the bases git can
 * read and the count of red receipts; the refusal lines when it is missing, no ledger of this cli, holds no production
 * state, or names no base git can read.
 */
function readCarryLedger(params: {
	worktree: string
	lot: string
}): { record: CarryRecord; bases: string[]; receipts: number } | CarryRefusals {
	const { worktree, lot } = params
	const file = ledgerPath(worktree)
	if (!existsSync(file)) return refusedWith({ template: CARRY_REFUSALS.ledgerMissing, lot })
	const bytes = readFileSync(file)
	const ledger = ledgerOfText(bytes.toString('utf8'))
	if ('unreadable' in ledger)
		return {
			refusals: [
				fillMessage({
					template:
						ledger.unreadable === 'json'
							? CARRY_REFUSALS.ledgerUnreadable
							: CARRY_REFUSALS.ledgerVersion,
					values: { lot, file },
				}),
			],
		}
	const recorded = Object.keys(ledger.production ?? {})
	if (recorded.length === 0)
		return {
			refusals: [
				fillMessage({ template: CARRY_REFUSALS.ledgerNoProduction, values: { lot, file } }),
			],
		}
	const bases = recorded.filter(function isReadableBase(base) {
		return (
			tryReadGit({ root: worktree, args: ['cat-file', '-e', `${base}^{commit}`] }) !== undefined
		)
	})
	if (bases.length === 0) return refusedWith({ template: CARRY_REFUSALS.noBase, lot })
	return {
		record: { bytes, hash: sha256Of(bytes) },
		bases,
		receipts: ledger.entries.filter((entry) => entry.kind === 'red').length,
	}
}

/**
 * The source's lot file (`.dialecte/lot.json` of its worktree), read once as bytes: its bytes and sha256; undefined
 * when absent; the refusal when it is no UTF-8 text or no lot declaration this cli reads (fail closed).
 */
function readCarryDeclaration(params: {
	worktree: string
	lot: string
}): CarryRecord | { refusal: string } | undefined {
	const file = join(params.worktree, LOT_FILE)
	if (!existsSync(file)) return undefined
	const refusal = fillMessage({
		template: CARRY_REFUSALS.declarationUnreadable,
		values: { lot: params.lot, file },
	})
	const bytes = readFileSync(file)
	if (!isUtf8(bytes) || 'failure' in readLotDeclaration(file)) return { refusal }
	return { bytes, hash: sha256Of(bytes) }
}
