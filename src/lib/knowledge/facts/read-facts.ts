/**
 * Reading the facts ledger: a key's current fact, one fact, every fact. The reads repair what a crash or a lost
 * race left (D9: a previous fact without `supersededBy` gets it, with a `repaired` line) and apply the check to the
 * key's current valid fact (D10: `stale` written once, `unverifiable` shown only, a holding re-check's new sources
 * written with a `rechecked` line). Every write goes through the record's own writers (`updateFact`).
 */
import { existsSync, readdirSync } from 'node:fs'

import { stableJson } from '../../stable-json.ts'
import { readHistory } from './fact-history.ts'
import { FACT_EXTENSION, FACT_FILE_PATTERN, SCHEMA_SOURCE_KIND } from './facts.constants.ts'
import {
	currentFactOf,
	factPathOf,
	historyLineOf,
	isCheckable,
	markSuperseded,
	readFactOrUndefined,
	staleLineOf,
	updateFact,
} from './record-fact.ts'

import type {
	CurrentFactParams,
	CurrentFactView,
	Fact,
	FactCheck,
	FactSource,
	FactView,
	FactViewState,
	HistoryLineContext,
	ReadFactParams,
	ReadFactsParams,
} from './facts.types.ts'

/**
 * The key's current fact as a view, undefined when the key has none (no pointer, a dangling one). It follows the
 * pointer only (D9b): the target, and the fact the target supersedes, repaired when a crash left it without
 * `supersededBy`; no other fact file is read (a race loser is repaired by `readFact` and `listFacts`).
 */
export function currentFact(params: CurrentFactParams): CurrentFactView | undefined {
	const { folder, key } = params
	const target = currentFactOf({ folder, key })
	if (target === undefined) return undefined
	if (target.supersedes !== null) {
		const previous = readFactOrUndefined({ folder, id: target.supersedes })
		if (previous?.key === key) notCurrentViewOf({ folder, fact: previous, target: target.id })
	}
	return checkedViewOf({ folder, fact: target, check: params.check })
}

/** One fact file as a view, undefined when there is no file of that id. */
export function readFact(params: ReadFactParams): FactView | undefined {
	const { folder, id } = params
	if (!existsSync(factPathOf({ folder, id }))) return undefined
	const fact = readFactOrUndefined({ folder, id })
	if (fact === undefined) return unreadableViewOf({ folder, id })
	const target = currentFactOf({ folder, key: fact.key })?.id
	return viewOf({ folder, fact, target, check: params.check })
}

/** Every `F-<n>.json` of the folder as a view, by id; none when the folder does not exist. */
export function listFacts(params: ReadFactsParams): FactView[] {
	const { folder } = params
	const targets = new Map<string, string | undefined>()
	return factIdsOf({ folder }).map(function viewOfId(id) {
		const fact = readFactOrUndefined({ folder, id })
		if (fact === undefined) return unreadableViewOf({ folder, id })
		if (!targets.has(fact.key)) targets.set(fact.key, currentFactOf({ folder, key: fact.key })?.id)
		return viewOf({ folder, fact, target: targets.get(fact.key), check: params.check })
	})
}

/**
 * Whether one of the facts of these ids that a check applies to (valid, not a person's) holds a schema source: the
 * reads that need the installed dialectes. It stops at the first one; an unreadable file holds none.
 */
export function readsSchemaSource(params: { folder: string; ids: readonly string[] }): boolean {
	const { folder } = params
	return params.ids.some(function holdsSchemaSource(id) {
		const fact = readFactOrUndefined({ folder, id })
		return (
			fact !== undefined &&
			isCheckable({ fact }) &&
			Array.isArray(fact.sources) &&
			fact.sources.some(isSchemaSource)
		)
	})
}

function isSchemaSource(source: FactSource): boolean {
	return source.kind === SCHEMA_SOURCE_KIND
}

/** The ids of the fact files of the folder, by number; none when the folder does not exist. */
export function factIdsOf(params: { folder: string }): string[] {
	let names: string[]
	try {
		names = readdirSync(params.folder)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
	return names
		.flatMap((name) => {
			const number = FACT_FILE_PATTERN.exec(name)?.[1]
			return number === undefined ? [] : [{ id: name.slice(0, -FACT_EXTENSION.length), number }]
		})
		.sort((first, second) => Number(first.number) - Number(second.number))
		.map((entry) => entry.id)
}

/** A readable fact as a view: checked when it is its key's current fact, else as `notCurrentViewOf` says. */
function viewOf(params: {
	folder: string
	fact: Fact
	target: string | undefined
	check: FactCheck | undefined
}): FactView {
	const { folder, fact, target } = params
	return fact.id === target
		? checkedViewOf({ folder, fact, check: params.check })
		: notCurrentViewOf({ folder, fact, target })
}

/**
 * A fact that is not its key's current one: superseded (as stored), an orphan (never pointed to: no `created`
 * line), or the previous fact a crash or a lost race left without `supersededBy`, repaired here when the key has a
 * current fact (D9).
 */
function notCurrentViewOf(params: {
	folder: string
	fact: Fact
	target: string | undefined
}): FactView {
	const { folder, fact, target } = params
	if (fact.supersededBy !== null)
		return factViewOf({ folder, fact, state: fact.state, current: false })
	const created = readHistory({ folder, id: fact.id }).some((line) => line.event === 'created')
	if (!created) return factViewOf({ folder, fact, state: 'orphan', current: false })
	if (target === undefined) return factViewOf({ folder, fact, state: fact.state, current: false })
	const repaired = markSuperseded({
		folder,
		fact,
		by: target,
		line: readContext(),
		repaired: true,
	})
	return factViewOf({ folder, fact: repaired, state: repaired.state, current: false })
}

/**
 * The key's current fact after the check (D10), applied to a valid fact that is not a person's: `stale` is written
 * with a `stale` line holding the check's reason; `unverifiable` is shown and never written; `valid` with other sources rewrites `sources`
 * with a `rechecked { from, to }` line; `valid` with the same sources writes nothing.
 */
function checkedViewOf(params: {
	folder: string
	fact: Fact
	check: FactCheck | undefined
}): CurrentFactView {
	const { folder, fact, check } = params
	if (check === undefined || !isCheckable({ fact }))
		return factViewOf({ folder, fact, state: fact.state, current: true })
	const outcome = check({ fact })
	const { reason } = outcome
	if (outcome.state === 'unverifiable')
		return factViewOf({ folder, fact, state: 'unverifiable', current: true, reason })
	const context = readContext()
	if (outcome.state === 'stale') {
		const stale = updateFact({
			folder,
			fact,
			changes: { state: 'stale' },
			line: staleLineOf({ context, fact: fact.id, reason }),
		})
		return factViewOf({ folder, fact: stale, state: stale.state, current: true, reason })
	}
	if (outcome.sources === undefined || stableJson(outcome.sources) === stableJson(fact.sources))
		return factViewOf({ folder, fact, state: fact.state, current: true })
	const rechecked = updateFact({
		folder,
		fact,
		changes: { sources: outcome.sources },
		line: {
			...historyLineOf({ context, event: 'rechecked', fact: fact.id }),
			from: fact.sources,
			to: outcome.sources,
		},
	})
	return factViewOf({ folder, fact: rechecked, state: rechecked.state, current: true })
}

/**
 * A readable fact as a view; the check's reason kept only when it gave one. A stale fact the read did not find
 * stale itself says the reason its last `stale` line stored (R4-1), none when that line holds none.
 */
function factViewOf(params: {
	folder: string
	fact: Fact
	state: FactViewState
	current: boolean
	reason?: string
}): CurrentFactView {
	const { folder, fact, state } = params
	const reason =
		params.reason ?? (state === 'stale' ? storedStaleReasonOf({ folder, id: fact.id }) : undefined)
	return {
		id: fact.id,
		path: factPathOf({ folder, id: fact.id }),
		fact,
		state,
		current: params.current,
		...(reason === undefined ? {} : { reason }),
	}
}

/** The reason the last `stale` line of a fact's history holds; undefined when there is none or it holds none. */
function storedStaleReasonOf(params: { folder: string; id: string }): string | undefined {
	const last = readHistory(params)
		.filter((line) => line.event === 'stale')
		.at(-1)
	return typeof last?.reason === 'string' ? last.reason : undefined
}

/** A fact file that is not readable JSON of its id: no fact, never current. */
function unreadableViewOf(params: { folder: string; id: string }): FactView {
	return {
		id: params.id,
		path: factPathOf(params),
		fact: undefined,
		state: 'unreadable',
		current: false,
	}
}

/** The history context of a line a read writes: now, no lot, no ask. */
function readContext(): HistoryLineContext {
	return { at: new Date().toISOString(), lot: null, ask: null }
}
