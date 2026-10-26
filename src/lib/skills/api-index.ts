/**
 * The API index a skill ships: every public method a package defines, with what its JSDoc says it
 * answers and the `@intent` phrases that lead a reader to it. Built from the type checker, so it is the
 * same whether the agent reads the repository or only the installed package.
 *
 * One row per method, not per route: a method reachable from several roots (the perf helper on
 * `doc.query`, `doc` and `project`; every read also on `tx`) shares its declaration, and is listed once
 * under its canonical route.
 */
import {
	QUOTED_SENTENCE_MIN_WORDS,
	QUOTED_TEXT_PATTERN,
	ROOT_PRIORITY,
	TEXT_COLLATOR,
	UNINDEXED_GROUPS,
} from './api-index.constants.ts'
import { INLINE_CODE_PATTERN } from './skill-file.constants.ts'

import type { MethodEntry } from '../discover.types.ts'
import type { IndexedMethod } from './api-index.types.ts'

export function renderApiIndex(entries: readonly MethodEntry[]): string {
	const rows = indexedMethods(entries).map(function row({
		entry,
		otherRoutes,
	}: IndexedMethod): string {
		const also = otherRoutes.length
			? ` (also ${otherRoutes.map((route) => `\`${displayPath(route)}\``).join(', ')})`
			: ''
		const summary = entry.summary ?? '-'
		const intents = entry.intents.join('; ') || '-'
		return `| \`${displayPath(entry.path)}\`${also} | ${tableCell(summary)} | ${tableCell(intents)} |`
	})
	return ['| Method | What it answers | Reach for it to |', '|---|---|---|', ...rows].join('\n')
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

/** Every method a package defines explains itself and says when to reach for it. */
export function findUndocumentedMethods(entries: readonly MethodEntry[]): string[] {
	return indexedMethods(entries).flatMap(({ entry }) => {
		const path = displayPath(entry.path)
		const messages: string[] = []
		if (!entry.summary) messages.push(`\`${path}\` has no JSDoc summary`)
		if (entry.intents.length === 0) messages.push(`\`${path}\` has no @intent tag`)
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
function indexedMethods(entries: readonly MethodEntry[]): IndexedMethod[] {
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

function compareRoutes(left: MethodEntry, right: MethodEntry): number {
	return rootRank(left.path) - rootRank(right.path) || left.path.length - right.path.length
}

function rootRank(path: string): number {
	const rank = ROOT_PRIORITY.indexOf(path.split('.')[0])
	return rank === -1 ? ROOT_PRIORITY.length : rank
}

function displayPath(path: string): string {
	return path.startsWith('q.') ? `doc.query.${path.slice(2)}` : path
}

function tableCell(text: string): string {
	return text.replace(/\|/g, '\\|')
}
