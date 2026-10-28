/** The text and JSON `dialecte api find` and `api show` print: compact, the same for the same input. */
import { shortSummary } from './short-summary.ts'

import type { FoundMethod, PackagedMethod } from './api-json.types.ts'

export function renderFound(params: {
	need: string
	found: readonly FoundMethod[]
	json: boolean
}): string {
	if (params.json)
		return toJson({
			need: params.need,
			methods: params.found.map((found) => ({
				path: found.method.path,
				root: found.method.root,
				package: found.packageName,
				hits: found.hits,
				intent: found.matchingIntent,
				summary: found.method.summary,
			})),
		})
	return params.found
		.map(
			(found) =>
				`${found.method.path}  ${found.method.root}  ${found.matchingIntent ?? shortSummary(found.method.summary ?? '-')}  ${found.packageName}\n`,
		)
		.join('')
}

export function renderShown(params: { methods: readonly PackagedMethod[]; json: boolean }): string {
	if (params.json)
		return toJson({
			methods: params.methods.map(({ method, packageName }) => ({
				package: packageName,
				...method,
			})),
		})
	return params.methods.map(renderMethod).join('\n')
}

function renderMethod({ method, packageName }: PackagedMethod): string {
	const lines = [`${method.path}  (${packageName})`, method.signature]
	if (method.summary) lines.push(method.summary)
	if (method.intents.length) lines.push(`intents: ${method.intents.join('; ')}`)
	if (method.otherRoutes.length) lines.push(`also: ${method.otherRoutes.join(', ')}`)
	if (method.declaredAt) lines.push(`source (repository): ${method.declaredAt}`)
	if (method.example) lines.push(`example: ${method.example}`)
	return `${lines.join('\n')}\n`
}

function toJson(value: unknown): string {
	return `${JSON.stringify(value, null, '\t')}\n`
}
