/**
 * The API index a skill ships: every public method a package defines, with what its JSDoc says it
 * answers and the `@intent` phrases that lead a reader to it. Built from the type checker, so it is the
 * same whether the agent reads the repository or only the installed package.
 *
 * One row per method, not per route: a method reachable from several roots (the perf helper on
 * `doc.query`, `doc` and `project`; every read also on `tx`) shares its declaration, and is listed once
 * under its canonical route. The functions exported by the package entries (`@dialecte/core/sqlite`) are
 * indexed too, under `<specifier>.<name>`; a function also reached from a root is that root's row.
 */
import {
	PLACEHOLDER_MARKER,
	QUOTED_SENTENCE_MIN_WORDS,
	QUOTED_TEXT_PATTERN,
	EXPORT_TABLE_HEADER,
	METHOD_TABLE_HEADER,
	ROOT_PRIORITY,
	TABLE_SEPARATOR,
	TEXT_COLLATOR,
	UNINDEXED_GROUPS,
} from './api-index.constants.ts'
import { INLINE_CODE_PATTERN } from './skill-file.constants.ts'

import type { MethodEntry } from '../discover.types.ts'
import type { IndexedMethod } from './api-index.types.ts'

/**
 * The method table, then one section per package entry, in the order the entries come (the `exports` map's),
 * holding the functions whose canonical route is an export of that entry, written by their name.
 */
export function renderApiIndex(entries: readonly MethodEntry[]): string {
	const indexed = indexedMethods(entries)
	const methodRows = indexed
		.filter(({ entry }) => entry.entry === undefined)
		.map((method) => indexRow({ method, name: displayPath(method.entry.path) }))
	const sections = entryOrder(entries).flatMap(function section(specifier: string): string[] {
		const rows = indexed
			.filter(({ entry }) => entry.entry === specifier)
			.map((method) => ({ method, name: exportName(method.entry) }))
			.sort((left, right) => TEXT_COLLATOR.compare(left.name, right.name))
			.map(indexRow)
		return rows.length
			? ['', `### \`${specifier}\``, '', EXPORT_TABLE_HEADER, TABLE_SEPARATOR, ...rows]
			: []
	})
	return [METHOD_TABLE_HEADER, TABLE_SEPARATOR, ...methodRows, ...sections].join('\n')
}

function indexRow(params: { method: IndexedMethod; name: string }): string {
	const { entry, otherRoutes } = params.method
	const also = otherRoutes.length
		? ` (also ${otherRoutes.map((route) => `\`${displayPath(route)}\``).join(', ')})`
		: ''
	const summary = entry.summary ?? '-'
	const intents = entry.intents.join('; ') || '-'
	return `| \`${params.name}\`${also} | ${tableCell(summary)} | ${tableCell(intents)} |`
}

/** The package entries in the order their exports come: the order of the `exports` map. */
function entryOrder(entries: readonly MethodEntry[]): string[] {
	return [...new Set(entries.flatMap((entry) => (entry.entry === undefined ? [] : [entry.entry])))]
}

/** The function name of an export route: `@dialecte/core/sqlite.connectHub` → `connectHub`. */
function exportName(entry: MethodEntry): string {
	return entry.entry === undefined ? entry.path : entry.path.slice(entry.entry.length + 1)
}

export function renderIntentIndex(entries: readonly MethodEntry[]): string {
	const methodsByIntent = new Map<string, string[]>()
	for (const { entry } of indexedMethods(entries))
		for (const intent of entry.intents) {
			const methods = methodsByIntent.get(intent) ?? []
			methods.push(`\`${displayPath(entry.path)}\``)
			methodsByIntent.set(intent, methods)
		}
	const rows = [...methodsByIntent.keys()]
		.sort(TEXT_COLLATOR.compare)
		.map((intent) => `| ${tableCell(intent)} | ${methodsByIntent.get(intent)?.join(', ')} |`)
	return ['| When you need to... | Use |', '|---|---|', ...rows].join('\n')
}

/**
 * Every method a package defines explains itself and says when to reach for it, in words of its own: a
 * placeholder `dialecte new verb` wrote counts as missing.
 */
export function findUndocumentedMethods(entries: readonly MethodEntry[]): string[] {
	return indexedMethods(entries).flatMap(({ entry }) => {
		const path = displayPath(entry.path)
		const messages: string[] = []
		if (!entry.summary) messages.push(`\`${path}\` has no JSDoc summary`)
		else if (entry.summary.includes(PLACEHOLDER_MARKER))
			messages.push(`\`${path}\` JSDoc summary is still a placeholder: write it`)
		if (entry.intents.length === 0) messages.push(`\`${path}\` has no @intent tag`)
		else if (entry.intents.some((intent) => intent.includes(PLACEHOLDER_MARKER)))
			messages.push(`\`${path}\` @intent is still a placeholder: write it`)
		return messages
	})
}

/**
 * A summary or intent quoting a sentence: the generated pages republish the JSDoc, so a quote of another
 * text (a standard, a spec) would be published too. Quotes inside inline code are code, not quotes.
 */
export function findQuotedSentences(entries: readonly MethodEntry[]): string[] {
	return indexedMethods(entries).flatMap(({ entry }) => {
		const path = displayPath(entry.path)
		const messages: string[] = []
		if (entry.summary && quotesSentence(entry.summary))
			messages.push(
				`\`${path}\` summary quotes a sentence: rephrase it, generated pages republish JSDoc`,
			)
		if (entry.intents.some(quotesSentence))
			messages.push(
				`\`${path}\` intent quotes a sentence: rephrase it, generated pages republish JSDoc`,
			)
		return messages
	})
}

function quotesSentence(text: string): boolean {
	const prose = text.replace(INLINE_CODE_PATTERN, '')
	return [...prose.matchAll(QUOTED_TEXT_PATTERN)].some(
		(quote) => (quote[1] ?? quote[2]).trim().split(/\s+/).length >= QUOTED_SENTENCE_MIN_WORDS,
	)
}

/** The package's own public methods, one per declaration, sorted by canonical path. */
export function indexedMethods(entries: readonly MethodEntry[]): IndexedMethod[] {
	const routesByDeclaration = new Map<string, MethodEntry[]>()
	for (const entry of entries) {
		if (!entry.definedInPackage || entry.internal) continue
		if (entry.path.startsWith('doc.query.')) continue
		if (UNINDEXED_GROUPS.some((group) => entry.path.startsWith(`${group}.`))) continue
		const key = entry.declaredAt ?? entry.path
		routesByDeclaration.set(key, [...(routesByDeclaration.get(key) ?? []), entry])
	}
	return [...routesByDeclaration.values()]
		.map(function canonical(routes: MethodEntry[]): IndexedMethod {
			const [entry, ...others] = [...routes].sort(compareRoutes)
			const readName = entry.path.startsWith('q.') ? entry.path.slice(2) : undefined
			return {
				entry,
				otherRoutes: others
					.map((other) => other.path)
					.filter((path) => !(readName && path === `tx.${readName}`)),
			}
		})
		.sort((left, right) =>
			TEXT_COLLATOR.compare(displayPath(left.entry.path), displayPath(right.entry.path)),
		)
}

/**
 * Roots first (in their priority, the shorter route first); then the exports, in the order they come (the
 * entries' order, `sort` being stable): the export of the first entry of the `exports` map names the function.
 */
function compareRoutes(left: MethodEntry, right: MethodEntry): number {
	if (left.entry !== undefined && right.entry !== undefined) return 0
	return rootRank(left) - rootRank(right) || left.path.length - right.path.length
}

function rootRank(entry: MethodEntry): number {
	if (entry.entry !== undefined) return ROOT_PRIORITY.length
	const rank = ROOT_PRIORITY.indexOf(entry.path.split('.')[0])
	return rank === -1 ? ROOT_PRIORITY.length : rank
}

/** A route as a caller writes it: a read on `doc.query`. */
export function displayPath(path: string): string {
	return path.startsWith('q.') ? `doc.query.${path.slice(2)}` : path
}

function tableCell(text: string): string {
	return text.replace(/\|/g, '\\|')
}
