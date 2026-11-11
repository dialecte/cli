/** The text and JSON `dialecte api find` and `api show` print: compact, the same for the same input. */
import { endedOf, jsonOf, textOf } from '../print/print.ts'
import { shortSummary } from './short-summary.ts'

import type { PrintedText } from '../print/print.types.ts'
import type { FoundMethod, PackagedMethod } from './api-json.types.ts'

export function renderFound(params: {
	need: string
	found: readonly FoundMethod[]
	json: boolean
}): PrintedText {
	if (params.json)
		return endedOf(
			jsonOf(
				{
					need: params.need,
					methods: params.found.map((found) => ({
						path: found.method.path,
						root: found.method.root,
						package: found.packageName,
						hits: found.hits,
						intent: found.matchingIntent,
						summary: found.method.summary,
					})),
				},
				'\t',
			),
		)
	return endedTextOf(
		params.found.map(
			(found) =>
				`${found.method.path}  ${found.method.root}  ${found.matchingIntent ?? shortSummary(found.method.summary ?? '-')}  ${found.packageName}`,
		),
	)
}

export function renderShown(params: {
	methods: readonly PackagedMethod[]
	json: boolean
}): PrintedText {
	if (params.json)
		return endedOf(
			jsonOf(
				{
					methods: params.methods.map(({ method, packageName }) => ({
						package: packageName,
						...method,
					})),
				},
				'\t',
			),
		)
	return endedTextOf(
		params.methods.flatMap((packaged, index) => [
			...(index === 0 ? [] : ['']),
			...renderMethod(packaged),
		]),
	)
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
