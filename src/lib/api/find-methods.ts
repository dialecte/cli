/**
 * `dialecte api find "<need>"`: the methods whose intents, summary or name share words with the need.
 *
 * Ranking, in order: how many words of the need the method's intents hold, then its summary, then its name
 * (the route's segments split on camelCase) - one intent word beats any number of summary words. A source function
 * without `@intent` counts the words its summary and name hold together as its intent hits (an undocumented helper
 * still surfaces). Words are lower-cased, stop words dropped, reduced to a light stem. Ties: an indexed method before
 * a source function, a dialecte's method before core's (the business verb wins), then by path. Nothing
 * random, nothing timed: the same need on the same indexes answers the same list.
 */
import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { CORE_PACKAGE_NAME, STEM_SUFFIXES, STOP_WORDS } from './find-methods.constants.ts'
import { SOURCE_PATH_MARK } from './source-functions.constants.ts'

import type { ApiJson, ApiMethod, FoundMethod } from './api-json.types.ts'

export function findMethods(params: {
	indexes: readonly ApiJson[]
	need: string
	limit: number
}): FoundMethod[] {
	const needWords = new Set(wordsOf(params.need))
	if (needWords.size === 0) return []
	return params.indexes
		.flatMap((index) =>
			index.methods.map((method) => scoreMethod({ method, packageName: index.package, needWords })),
		)
		.filter((found) => found.hits.intent + found.hits.summary + found.hits.name > 0)
		.sort(compareFound)
		.slice(0, params.limit)
}

/** Lower-cased words, camelCase split, stop words dropped, reduced to a common stem (`copied` → `copy`). */
export function wordsOf(text: string): string[] {
	return text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== '' && !STOP_WORDS.has(word))
		.map(stem)
}

/**
 * A light stem, the same for a word's usual forms: `-ies` / `-ied` → `y`, then `-ing`, `-ed` dropped when a stem
 * of four letters stays, `-es`, `-s` when one of three (two for `-s`) stays, always with a vowel; then a final `e`
 * (`clone` and `cloned` meet; `naming` stays apart from the noun `name`).
 */
function stem(word: string): string {
	const base = word.match(/^(.{2,})ie[sd]$/)
		? `${word.slice(0, -3)}y`
		: (STEM_SUFFIXES.map((suffix) => stripped({ word, suffix })).find(isDefined) ?? word)
	return base.length > 3 && base.endsWith('e') ? base.slice(0, -1) : base
}

function stripped(params: {
	word: string
	suffix: { ending: string; minimumStem: number }
}): string | undefined {
	const { word, suffix } = params
	if (
		!word.endsWith(suffix.ending) ||
		(word.endsWith(`s${suffix.ending}`) && suffix.ending === 's')
	)
		return undefined
	const rest = word.slice(0, -suffix.ending.length)
	return rest.length >= suffix.minimumStem && /[aeiouy]/.test(rest) ? rest : undefined
}

function isDefined<GenericValue>(value: GenericValue | undefined): value is GenericValue {
	return value !== undefined
}

function scoreMethod(params: {
	method: ApiMethod
	packageName: string
	needWords: ReadonlySet<string>
}): FoundMethod {
	const { method, needWords } = params
	const intentMatches = method.intents.map((intent) => sharedCount({ text: intent, needWords }))
	const intentText =
		method.root === 'source' && method.intents.length === 0
			? `${method.summary ?? ''} ${routeName(method)}`
			: method.intents.join(' ')
	const hits = {
		intent: sharedCount({ text: intentText, needWords }),
		summary: sharedCount({ text: method.summary ?? '', needWords }),
		name: sharedCount({ text: routeName(method), needWords }),
	}
	const best = Math.max(0, ...intentMatches)
	return {
		method,
		packageName: params.packageName,
		hits,
		matchingIntent: best > 0 ? method.intents[intentMatches.indexOf(best)] : undefined,
	}
}

function sharedCount(params: { text: string; needWords: ReadonlySet<string> }): number {
	return new Set(wordsOf(params.text).filter((word) => params.needWords.has(word))).size
}

/**
 * The route below its root (`doc.query.info.of` → `info.of`); an export's name without its entry; a source
 * function's name without its file (`src/lib/git.ts#readGit` → `readGit`).
 */
function routeName(method: ApiMethod): string {
	if (method.root === 'source')
		return method.path.slice(method.path.indexOf(SOURCE_PATH_MARK) + SOURCE_PATH_MARK.length)
	if (method.entry !== undefined && method.path.startsWith(`${method.entry}.`))
		return method.path.slice(method.entry.length + 1)
	return method.path.replace(/^(doc\.query|tx|doc|project)\./, '')
}

function compareFound(left: FoundMethod, right: FoundMethod): number {
	return (
		right.hits.intent - left.hits.intent ||
		right.hits.summary - left.hits.summary ||
		right.hits.name - left.hits.name ||
		Number(left.method.root === 'source') - Number(right.method.root === 'source') ||
		Number(left.packageName === CORE_PACKAGE_NAME) -
			Number(right.packageName === CORE_PACKAGE_NAME) ||
		TEXT_COLLATOR.compare(left.method.path, right.method.path)
	)
}
