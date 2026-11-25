/**
 * What `tdd red` carries from the lot a rebuilt lot was started from (`lot start --from`): the records the start
 * copied, read and checked against the sha256 recorded beside them (`readCarry`), and, for one passing case, the red
 * of the source it carries or why it carries none (`lotCarryOf`, pure: git comes in through two readers).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { sha256Of } from '../corpus/corpus-lock.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	CARRY_DECLARATION_COPY_NAME,
	CARRY_LEDGER_COPY_NAME,
	CARRY_SCHEMA,
} from '../store/carry-source.constants.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { NOT_CARRIED, NOT_CARRIED_REASONS, CARRY_RECORD_FAILURES } from './carry-over.constants.ts'
import { caseStatusOf, frozenHashOf, lastIndexOf, lastInvalidatingFreeze } from './case-status.ts'
import { countingReceipts } from './counting-receipts.ts'
import { readDeclaredCases } from './lot-declaration.ts'
import { hashTestCodeText, ledgerOfText } from './tdd-files.ts'
import { DELETED_PRODUCTION_FILE, PROOF_KINDS, PYTHON_FILE_PATTERN } from './tdd.constants.ts'

import type { CarryFile } from '../store/carry-source.types.ts'
import type {
	Carry,
	CarryFailure,
	CarryGreen,
	CarryProof,
	LotCarryParams,
} from './carry-over.types.ts'
import type { LotCaseEntry, MovedCarry, TddEntry, TddFreeze, TddReceipt } from './tdd.types.ts'

/**
 * The red of the source lot a passing case carries, or why it carries none: the case must stand as the source's green
 * case did (its test call, file and test code), over the same production slice (FIX-receipt-carry-over D5). The first
 * counted green of the source after its proof that stands as the case stands now is the one compared; none: the last
 * green's first difference is named.
 *
 * @intent decide whether a passing case carries the red of the lot it was rebuilt from
 * @internal
 */
export function lotCarryOf(params: LotCarryParams): MovedCarry {
	const { testCase } = params
	const proven = sourceProofOf(params)
	if ('why' in proven) return notCarriedOf({ lot: params.carry.from, why: proven.why })
	let why: string = NOT_CARRIED_REASONS.noGreen
	for (const green of proven.greens) {
		const differing = greenDifferenceOf({ ...params, green })
		if (differing === undefined)
			return {
				kind: 'carry',
				from: { file: testCase.file, name: testCase.name, project: testCase.project },
				red: proven.proof,
				lot: params.carry.from,
			}
		why = differing
	}
	return notCarriedOf({ lot: params.carry.from, why })
}

/**
 * The source's red of the case and its counted greens after that red and after the last freeze that changed what a
 * green of it proves (the greens `caseStatusOf` counts), in ledger order; or why the source holds no proof to carry.
 */
function sourceProofOf(params: LotCarryParams): CarryProof | { why: string } {
	const { carry, testCase, root, dependencies } = params
	const { ledger, acceptances, revisions } = carry
	const { entries } = ledger
	const counting = new Set<TddEntry>(
		countingReceipts({ ledger, testCase, acceptances, revisions }).counting,
	)
	const proofIndex = lastIndexOf({
		entries,
		matches: (entry) =>
			counting.has(entry) && entry.kind !== 'freeze' && PROOF_KINDS.includes(entry.kind),
	})
	if (proofIndex < 0) return { why: NOT_CARRIED_REASONS.noGreen }
	const proof = entries[proofIndex] as TddReceipt
	if (proof.caseHash !== params.caseHash) return { why: NOT_CARRIED_REASONS.callDiffers }
	if (frozenHashOf({ ledger, file: testCase.file }) !== params.testFileHash)
		return {
			why: fillMessage({
				template: NOT_CARRIED_REASONS.fileDiffers,
				values: { file: testCase.file },
			}),
		}
	if (proof.kind !== 'red')
		return {
			why: fillMessage({ template: NOT_CARRIED_REASONS.notRed, values: { kind: proof.kind } }),
		}
	const status = caseStatusOf({ ...params, ledger, acceptances, revisions })
	if (status !== 'green') return { why: NOT_CARRIED_REASONS.noGreen }
	const lastFreeze = lastInvalidatingFreeze({ root, entries, file: testCase.file, dependencies })
	const greens = entries.flatMap((entry, index): CarryGreen[] =>
		counting.has(entry) &&
		entry.kind === 'green' &&
		entry.caseHash === params.caseHash &&
		index > proofIndex &&
		index > lastFreeze
			? [{ receipt: entry, index }]
			: [],
	)
	return { proof, greens }
}

/**
 * Why the case as it stands now is not the case the source's green `green` ran (its test file, the test code it
 * depends on, its conftests), or its production slice is not that green's; undefined when it is.
 */
function greenDifferenceOf(params: LotCarryParams & { green: CarryGreen }): string | undefined {
	const { green, testCase } = params
	if (green.receipt.testFileHash !== params.testFileHash)
		return fillMessage({
			template: NOT_CARRIED_REASONS.fileDiffers,
			values: { file: testCase.file },
		})
	const recorded = sourceStateOf({ ...params, productionHash: green.receipt.productionHash })
	if ('why' in recorded) return recorded.why
	const { base, files } = recorded
	// what the source's green ran on: the ledger cut at that green
	const before = {
		...params.carry.ledger,
		entries: params.carry.ledger.entries.slice(0, green.index),
	}
	const helper = params.dependencies.find(function differsFromGreen(file) {
		const frozen = frozenHashOf({ ledger: before, file })
		const atBase = frozen === undefined ? params.readBaseBlob({ base, path: file }) : undefined
		const then =
			frozen ?? (atBase === undefined ? undefined : hashTestCodeText({ file, text: atBase }))
		return then === undefined || params.hashNow(file) !== then
	})
	if (helper !== undefined)
		return fillMessage({ template: NOT_CARRIED_REASONS.helperDiffers, values: { file: helper } })
	if (PYTHON_FILE_PATTERN.test(testCase.file)) {
		const conftests = conftestDifferenceOf({ ...params, entries: before.entries })
		if (conftests !== undefined) return conftests
	}
	const production = productionDifferenceOf({ ...params, base, files })
	return production === undefined
		? undefined
		: fillMessage({ template: NOT_CARRIED_REASONS.productionDiffers, values: { file: production } })
}

/**
 * The production state the source recorded for `productionHash` and the base it was measured from: the first base
 * of the ledger's `production`, in key order, that holds the hash and that git can read (after a rebase the same
 * hash can sit under several bases, each describing the same tree); why none when no base holds it or none reads.
 */
function sourceStateOf(params: {
	carry: Carry
	productionHash: string
	isBaseReadable: LotCarryParams['isBaseReadable']
}): { base: string; files: Readonly<Record<string, string>> } | { why: string } {
	const states = params.carry.ledger.production ?? {}
	const holding = Object.keys(states).filter((base) =>
		Object.hasOwn(states[base], params.productionHash),
	)
	if (holding.length === 0) return { why: NOT_CARRIED_REASONS.unrecorded }
	const base = holding.find((candidate) => params.isBaseReadable({ base: candidate }))
	if (base === undefined) return { why: NOT_CARRIED_REASONS.baseUnreadable }
	return { base, files: states[base][params.productionHash] }
}

/**
 * Why a pytest case's conftests now are not the ones the last freeze of its file before the source's green recorded
 * (the differing ones, those of now first); a freeze that recorded none refuses (fail closed). Undefined when equal.
 */
function conftestDifferenceOf(params: {
	testCase: LotCarryParams['testCase']
	conftests: readonly string[]
	entries: readonly TddEntry[]
}): string | undefined {
	const { file } = params.testCase
	const index = lastIndexOf({
		entries: params.entries,
		matches: (entry) => entry.kind === 'freeze' && Object.hasOwn(entry.files, file),
	})
	const recorded = index < 0 ? undefined : (params.entries[index] as TddFreeze).conftests?.[file]
	if (recorded === undefined)
		return fillMessage({ template: NOT_CARRIED_REASONS.conftestsUnrecorded, values: { file } })
	const differing = [
		...params.conftests.filter((conftest) => !recorded.includes(conftest)),
		...recorded.filter((conftest) => !params.conftests.includes(conftest)),
	]
	return differing.length === 0
		? undefined
		: fillMessage({
				template: NOT_CARRIED_REASONS.conftestsDiffer,
				values: { files: differing.join(', ') },
			})
}

/**
 * The first production path (sorted) over both states whose content at the source's green differs from its content
 * now: the source side is the state's, else its blob at the source's base; today's side is today's state's, else its
 * blob at the new base; a blob missing is a deleted file. Undefined when every path is equal.
 */
function productionDifferenceOf(params: {
	base: string
	files: Readonly<Record<string, string>>
	production: LotCarryParams['production']
	readBaseBlob: LotCarryParams['readBaseBlob']
}): string | undefined {
	const { files, production, readBaseBlob } = params
	const paths = [...new Set([...Object.keys(files), ...Object.keys(production.files)])].sort()
	/** The content of `path` in the commit `base`: its sha256, or deleted when the commit holds none. */
	function contentAt(at: { base: string; path: string }): string {
		const text = readBaseBlob(at)
		return text === undefined ? DELETED_PRODUCTION_FILE : sha256Of(text)
	}
	return paths.find(function differsNow(path) {
		const then = Object.hasOwn(files, path) ? files[path] : contentAt({ base: params.base, path })
		const now = Object.hasOwn(production.files, path)
			? production.files[path]
			: contentAt({ base: production.base, path })
		return then !== now
	})
}

/** The refusal of a case the source does not cover: `NOT_CARRIED` with the source lot and why. */
function notCarriedOf(params: { lot: string; why: string }): MovedCarry {
	return { kind: 'refused', reason: fillMessage({ template: NOT_CARRIED, values: params }) }
}

/**
 * The carry the lot of `lotFolder` was started with (`lot start --from`): `carry.json`, the ledger copy and the lot
 * file copy, each copy's sha256 checked against the record; undefined when the lot carries nothing (no `carry.json`).
 * Any fault (a record unreadable or of another shape, a copy missing, changed since the start, or no ledger of this
 * cli) is a failure naming the file: `tdd red` then records nothing (D7).
 *
 * @intent read the records a rebuilt lot carries receipts from
 * @internal
 */
export function readCarry(params: { lotFolder: string }): Carry | CarryFailure | undefined {
	const recordPath = join(params.lotFolder, STORE_FILES.carry)
	if (!existsSync(recordPath)) return undefined
	const record = carryFileOf(recordPath)
	if ('failure' in record) return record
	const copies = join(params.lotFolder, STORE_FILES.carryCopies)
	const ledgerFile = join(copies, CARRY_LEDGER_COPY_NAME)
	const ledgerText = checkedCopyOf({ file: ledgerFile, hash: record.ledger })
	if (typeof ledgerText !== 'string') return ledgerText
	const ledger = ledgerOfText(ledgerText)
	if ('unreadable' in ledger)
		return failureOf({ template: CARRY_RECORD_FAILURES.ledger, file: ledgerFile })
	const declaration = readCarryDeclaration({
		file: join(copies, CARRY_DECLARATION_COPY_NAME),
		hash: record.declaration,
	})
	if ('failure' in declaration) return declaration
	return { from: record.from, ledger, ...declaration }
}

/** `carry.json` at `path` when it holds a record of this cli's shape; the failure naming it otherwise. */
function carryFileOf(path: string): CarryFile | CarryFailure {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return failureOf({ template: CARRY_RECORD_FAILURES.notJson, file: path })
	}
	return isCarryFile(parsed)
		? parsed
		: failureOf({ template: CARRY_RECORD_FAILURES.shape, file: path })
}

function isCarryFile(value: unknown): value is CarryFile {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const { schema, from, ledger, declaration } = value as Record<string, unknown>
	return (
		schema === CARRY_SCHEMA &&
		typeof from === 'string' &&
		from !== '' &&
		typeof ledger === 'string' &&
		(declaration === undefined || typeof declaration === 'string')
	)
}

/** The text of the copy `file` when its bytes hash to `hash`; the failure naming it when it is missing or changed. */
function checkedCopyOf(params: { file: string; hash: string }): string | CarryFailure {
	if (!existsSync(params.file))
		return failureOf({ template: CARRY_RECORD_FAILURES.missing, file: params.file })
	const bytes = readFileSync(params.file)
	if (sha256Of(bytes) !== params.hash)
		return failureOf({ template: CARRY_RECORD_FAILURES.changed, file: params.file })
	return bytes.toString('utf8')
}

/**
 * The `accept` and `revised` entries of the lot file copy, checked against its recorded sha256; none when the source
 * had no lot file. A copy without its record, or a record without its copy, is a failure naming the file.
 */
function readCarryDeclaration(params: {
	file: string
	hash: string | undefined
}): { acceptances: LotCaseEntry[]; revisions: LotCaseEntry[] } | CarryFailure {
	const { file, hash } = params
	if (hash === undefined)
		return existsSync(file)
			? failureOf({ template: CARRY_RECORD_FAILURES.unrecorded, file })
			: { acceptances: [], revisions: [] }
	const checked = checkedCopyOf({ file, hash })
	if (typeof checked !== 'string') return checked
	const acceptances = readDeclaredCases({ path: file, list: 'accept' })
	if ('failure' in acceptances)
		return failureOf({
			template: CARRY_RECORD_FAILURES.declaration,
			file,
			why: acceptances.failure,
		})
	const revisions = readDeclaredCases({ path: file, list: 'revised' })
	if ('failure' in revisions)
		return failureOf({ template: CARRY_RECORD_FAILURES.declaration, file, why: revisions.failure })
	return { acceptances, revisions }
}

function failureOf(params: { template: string; file: string; why?: string }): CarryFailure {
	return {
		failure: fillMessage({
			template: params.template,
			values: { file: params.file, why: params.why ?? '' },
		}),
	}
}
