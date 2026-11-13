/**
 * Recording a fact (D5): read the key's current fact (a check saying it is stale writes it stale first, D10b),
 * decide by the replacement rule (D6), then either append a
 * `reused` line to the current fact's history, or publish the new fact under the next free id, swap the key's
 * pointer, append `created`, and mark the previous fact superseded. Each step is whole or not at all, so a crash
 * between two leaves states the reads repair.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { publishOnce, recordText, replaceWhole } from '../../store/publish.ts'
import { appendHistory, fittedHistoryLine, historyPathOf } from './fact-history.ts'
import { factKeyOf } from './fact-key.ts'
import {
	BY_KEY_FOLDER,
	EFFORT_RANK,
	FACT_EXTENSION,
	FACT_FILE_PATTERN,
	FACT_ID_DIGITS,
	FACT_ID_PATTERN,
	FACT_ID_PREFIX,
} from './facts.constants.ts'

import type {
	CheckOutcome,
	Fact,
	FactChanges,
	FactDraft,
	HistoryEvent,
	HistoryLine,
	HistoryLineContext,
	RecordFactParams,
	RecordOutcome,
	RecordSeams,
	ReplacementDecision,
} from './facts.types.ts'

/** Records a fact in the ledger: creates it, replaces the key's current fact, or reuses it (D5, D6). */
export function recordFact(params: RecordFactParams): RecordOutcome {
	const { folder, draft, seams = {} } = params
	const lot = params.lot ?? null
	const ask = params.ask ?? null
	const key = factKeyOf({
		question: draft.question,
		subject: draft.subject,
		kind: draft.kind,
		package: draft.subject.package,
	})
	mkdirSync(join(folder, BY_KEY_FOLDER), { recursive: true })
	const at = (params.now ?? currentTime)().toISOString()
	const context: HistoryLineContext = { at, lot, ask }
	const read = currentFactOf({ folder, key })
	const outcome =
		read === undefined || params.check === undefined || !isCheckable({ fact: read })
			? undefined
			: params.check({ fact: read })
	const checked = outcome?.state
	// a check that says stale writes it, as a read does, before the new fact replaces it (D10b)
	const current =
		read !== undefined && checked === 'stale'
			? updateFact({
					folder,
					fact: read,
					changes: { state: 'stale' },
					line: staleLineOf({ context, fact: read.id, reason: outcome?.reason }),
				})
			: read
	const decision = current === undefined ? 'replace' : replacementOf({ current, draft, checked })
	seams.afterDecide?.()
	if (current !== undefined && decision === 'reuse') {
		const file = historyPathOf({ folder, id: current.id })
		appendHistory({
			file,
			line: fittedHistoryLine({
				file,
				line: historyLineOf({ context, event: 'reused', fact: current.id }),
			}),
		})
		return { outcome: 'reused', id: current.id, previous: null }
	}
	const id = publishFact({ folder, draft, key, at, supersedes: current?.id ?? null, seams })
	seams.afterPublish?.()
	replaceWhole({ path: pointerPathOf({ folder, key }), text: `${id}\n` })
	seams.afterPointer?.()
	const createdFile = historyPathOf({ folder, id })
	appendHistory({
		file: createdFile,
		line: fittedHistoryLine({
			file: createdFile,
			line: historyLineOf({ context, event: 'created', fact: id }),
		}),
	})
	seams.afterCreated?.()
	if (current === undefined) return { outcome: 'created', id, previous: null }
	markSuperseded({ folder, fact: current, by: id, line: context })
	return { outcome: 'replaced', id, previous: current.id }
}

/**
 * Marks a fact superseded by another: `supersededBy` set by a whole-file replace, then a `superseded` line
 * appended (with `repaired: true` when a read repairs what a crash or a lost race left). Answers the fact as written.
 */
export function markSuperseded(params: {
	folder: string
	fact: Fact
	by: string
	line: HistoryLineContext
	repaired?: true
}): Fact {
	return updateFact({
		folder: params.folder,
		fact: params.fact,
		changes: { supersededBy: params.by },
		line: {
			...historyLineOf({ context: params.line, event: 'superseded', fact: params.fact.id }),
			supersededBy: params.by,
			...(params.repaired === undefined ? {} : { repaired: params.repaired }),
		},
	})
}

/**
 * Changes a fact file (its state, `supersededBy` or `sources` only): the history line is built and fitted first (a
 * line that cannot fit refuses the change, nothing written), the file is re-read just before the replace and the
 * change applied to that copy (a field another writer set meanwhile is kept; the given fact when the file is no
 * longer readable), the file replaced whole, then the line appended. Answers the fact as written.
 */
export function updateFact(params: {
	folder: string
	fact: Fact
	changes: FactChanges
	line: HistoryLine
}): Fact {
	const { folder } = params
	const file = historyPathOf({ folder, id: params.fact.id })
	const line = fittedHistoryLine({ file, line: params.line })
	const onDisk = readFactOrUndefined({ folder, id: params.fact.id }) ?? params.fact
	const updated: Fact = { ...onDisk, ...params.changes }
	replaceWhole({ path: factPathOf({ folder, id: updated.id }), text: recordText(updated) })
	appendHistory({ file, line })
	return updated
}

/** A history line's common members, in the order every line writes them: `at`, `event`, `fact`, `lot`, `ask`. */
export function historyLineOf(params: {
	context: HistoryLineContext
	event: HistoryEvent
	fact: string
}): HistoryLine {
	const { context } = params
	return {
		at: context.at,
		event: params.event,
		fact: params.fact,
		lot: context.lot,
		ask: context.ask,
	}
}

/** A `stale` line, holding the check's `reason` (what failed and the fix) when it gave one (R4-1). */
export function staleLineOf(params: {
	context: HistoryLineContext
	fact: string
	reason: string | undefined
}): HistoryLine {
	const { reason } = params
	return {
		...historyLineOf({ context: params.context, event: 'stale', fact: params.fact }),
		...(reason === undefined ? {} : { reason }),
	}
}

/** The path of a fact's file in the facts folder. */
export function factPathOf(params: { folder: string; id: string }): string {
	return join(params.folder, `${params.id}${FACT_EXTENSION}`)
}

/** The path of a key's pointer file in the facts folder. */
export function pointerPathOf(params: { folder: string; key: string }): string {
	return join(params.folder, BY_KEY_FOLDER, params.key)
}

/**
 * The key's current fact: the one its pointer names, when that fact file is readable JSON of that id and key;
 * undefined when there is no pointer or it dangles (garbage, a missing or unreadable fact, another key's).
 */
export function currentFactOf(params: { folder: string; key: string }): Fact | undefined {
	const pointer = readTextOrUndefined({ path: pointerPathOf(params) })?.trim()
	if (pointer === undefined || !FACT_ID_PATTERN.test(pointer)) return undefined
	const fact = readFactOrUndefined({ folder: params.folder, id: pointer })
	return fact?.key === params.key ? fact : undefined
}

/** A fact file parsed, when it holds a JSON object of that id; undefined when missing or unreadable. */
export function readFactOrUndefined(params: { folder: string; id: string }): Fact | undefined {
	const text = readTextOrUndefined({ path: factPathOf(params) })
	if (text === undefined) return undefined
	try {
		const value: unknown = JSON.parse(text)
		const isFact =
			typeof value === 'object' && value !== null && (value as { id?: unknown }).id === params.id
		return isFact ? (value as Fact) : undefined
	} catch {
		return undefined
	}
}

function readTextOrUndefined(params: { path: string }): string | undefined {
	try {
		return readFileSync(params.path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
}

/**
 * The replacement rule (D6, Q-K2b-1): the new fact replaces a stale, forgotten or unverifiable current one; a new
 * unchecked fact replaces only an unchecked one of lower effort; a new checked fact (schema, Dialecte, standard, or
 * a person's without `unchecked: true`) replaces an unchecked one whatever the efforts (D19); a new person fact, or
 * one of higher effort, replaces the current one; else the current one is reused.
 */
function replacementOf(params: {
	current: Fact
	draft: FactDraft
	checked: CheckOutcome['state'] | undefined
}): ReplacementDecision {
	const { current, draft } = params
	if (current.state === 'stale' || current.state === 'forgotten') return 'replace'
	if (params.checked === 'unverifiable') return 'replace'
	const higherEffort = EFFORT_RANK[draft.effort] > EFFORT_RANK[current.effort]
	const currentUnchecked = current.state === 'unchecked' || current.unchecked === true
	if (draftIsUnchecked({ draft })) return currentUnchecked && higherEffort ? 'replace' : 'reuse'
	if (currentUnchecked) return 'replace'
	return draft.source === 'person' || higherEffort ? 'replace' : 'reuse'
}

/** Whether a check applies to the fact: a valid one that is not a person's (D10). */
export function isCheckable(params: { fact: Fact }): boolean {
	return params.fact.state === 'valid' && params.fact.source !== 'person'
}

/** An outside fact, or a person fact given without documents. */
function draftIsUnchecked(params: { draft: FactDraft }): boolean {
	return params.draft.source === 'outside' || params.draft.unchecked === true
}

/**
 * Publishes the new fact whole under the next free id (1 + the highest `F-<n>.json`), the file being the id's
 * claim; a name taken meanwhile -> the next number. Answers the id.
 */
function publishFact(params: {
	folder: string
	draft: FactDraft
	key: string
	at: string
	supersedes: string | null
	seams: RecordSeams
}): string {
	for (;;) {
		const id = nextFactId({ folder: params.folder })
		params.seams.beforeIdClaim?.(id)
		const fact = factOf({ ...params, id })
		const published = publishOnce({
			path: factPathOf({ folder: params.folder, id }),
			text: recordText(fact),
			readOnly: false,
		})
		if (published) return id
	}
}

/**
 * The fact a draft becomes, its members in the ledger's order (id, key, question, subject, kind, answer, source,
 * effort, evidence, by, sources, at, state, unchecked when given, supersedes, supersededBy), whatever the draft's.
 */
function factOf(params: {
	id: string
	key: string
	draft: FactDraft
	at: string
	supersedes: string | null
}): Fact {
	const { draft } = params
	return {
		id: params.id,
		key: params.key,
		question: draft.question,
		subject: draft.subject,
		kind: draft.kind,
		answer: draft.answer,
		source: draft.source,
		effort: draft.effort,
		evidence: draft.evidence,
		by: draft.by,
		sources: draft.sources,
		at: params.at,
		state: draft.source === 'outside' ? 'unchecked' : 'valid',
		...(draft.unchecked === undefined ? {} : { unchecked: draft.unchecked }),
		supersedes: params.supersedes,
		supersededBy: null,
	}
}

/** `F-<n>` for 1 + the highest number of a fact file in the folder, padded to four digits at least. */
function nextFactId(params: { folder: string }): string {
	let highest = 0
	for (const name of readdirSync(params.folder)) {
		const number = FACT_FILE_PATTERN.exec(name)?.[1]
		if (number !== undefined) highest = Math.max(highest, Number(number))
	}
	return `${FACT_ID_PREFIX}${String(highest + 1).padStart(FACT_ID_DIGITS, '0')}`
}

/** The clock of a real record. */
function currentTime(): Date {
	return new Date()
}
