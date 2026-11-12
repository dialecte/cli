/** The text and JSON `dialecte api find` and `api show` print: compact, the same for the same input. */
import { endedOf, jsonOf, textOf } from '../print/print.ts'
import { shortSummary } from './short-summary.ts'
import { NO_SUMMARY_TEXT, NOTE_LINE_PREFIX } from './source-functions.constants.ts'

import type { PrintedText } from '../print/print.types.ts'
import type { FoundMethod, PackagedMethod } from './api-json.types.ts'

/**
 * What `dialecte api find` prints for the methods found: one row each (a source function's with its `declaredAt`
 * and its summary or `(no summary)`), then a `note:` line per note of the source reader; `notes` (given only when
 * the source was read) joins the JSON answer.
 */
export function renderFound(params: {
	need: string
	found: readonly FoundMethod[]
	json: boolean
	notes?: readonly string[]
}): PrintedText {
	if (params.json)
		return endedOf(
			jsonOf(
				{
					need: params.need,
					methods: params.found.map(foundJsonOf),
					...(params.notes === undefined ? {} : { notes: params.notes }),
				},
				'\t',
			),
		)
	return endedTextOf([...params.found.map(foundRowOf), ...noteLinesOf(params.notes)])
}

/** One found method as the JSON answer holds it: a source function's row also carries its `declaredAt`. */
function foundJsonOf(found: FoundMethod): Record<string, unknown> {
	const row = {
		path: found.method.path,
		root: found.method.root,
		package: found.packageName,
		hits: found.hits,
		intent: found.matchingIntent,
		summary: found.method.summary,
	}
	return found.method.root === 'source' ? { ...row, declaredAt: found.method.declaredAt } : row
}

function foundRowOf(found: FoundMethod): string {
	const { method } = found
	if (method.root === 'source')
		return `${method.path}  source  ${method.declaredAt}  ${found.matchingIntent ?? (method.summary === undefined ? NO_SUMMARY_TEXT : shortSummary(method.summary))}  ${found.packageName}`
	return `${method.path}  ${method.root}  ${found.matchingIntent ?? shortSummary(method.summary ?? '-')}  ${found.packageName}`
}

/** One `note: <text>` line per note of the source reader: what an `api` answer prints after its rows. */
export function noteLinesOf(notes: readonly string[] | undefined): string[] {
	return (notes ?? []).map((note) => `${NOTE_LINE_PREFIX}${note}`)
}

/**
 * What `dialecte api show` prints for the methods a path names: each one's contract, then a `note:` line per note
 * of the source reader; `notes` (given only when the source was read) joins the JSON answer.
 */
export function renderShown(params: {
	methods: readonly PackagedMethod[]
	json: boolean
	notes?: readonly string[]
}): PrintedText {
	if (params.json)
		return endedOf(
			jsonOf(
				{
					methods: params.methods.map(({ method, packageName }) => ({
						package: packageName,
						...method,
					})),
					...(params.notes === undefined ? {} : { notes: params.notes }),
				},
				'\t',
			),
		)
	return endedTextOf([
		...params.methods.flatMap((packaged, index) => [
			...(index === 0 ? [] : ['']),
			...renderMethod(packaged),
		]),
		...noteLinesOf(params.notes),
	])
}

function renderMethod({ method, packageName }: PackagedMethod): string[] {
	const lines = [`${method.path}  (${packageName})`, method.signature]
	if (method.summary) lines.push(method.summary)
	if (method.intents.length) lines.push(`intents: ${method.intents.join('; ')}`)
	if (method.otherRoutes.length) lines.push(`also: ${method.otherRoutes.join(', ')}`)
	if (method.declaredAt) lines.push(`source (repository): ${method.declaredAt}`)
	if (method.example) lines.push(`example: ${method.example}`)
	return lines
}

/** The lines, each ended by a line feed; no line at all is the empty text. */
function endedTextOf(lines: readonly string[]): PrintedText {
	return textOf(lines.length === 0 ? [] : [...lines, ''])
}
