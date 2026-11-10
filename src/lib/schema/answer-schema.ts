import { closestNames } from '../closest-names.ts'
import { describeElement } from './describe-element.ts'
import { SUGGESTION_LIMIT } from './schema.constants.ts'

import type { CommandOutput } from '../command-output.types.ts'
import type { AttributeDescription, ElementDescription, LoadedDialectes } from './schema.types.ts'

/**
 * What `dialecte schema <Tag>` prints: one block per installed dialecte holding the tag, or the closest tags.
 *
 * @intent answer a schema lookup from dialectes already loaded, tell what an element may hold and where
 */
export function answerSchema(params: {
	loaded: LoadedDialectes
	tagName: string
	json: boolean
}): CommandOutput {
	const { loaded, tagName } = params
	const elements = loaded.dialectes.flatMap(
		(dialecte) => describeElement({ dialecte, tagName }) ?? [],
	)
	if (params.json)
		return {
			output: `${JSON.stringify({ elements, skipped: loaded.skipped }, null, '\t')}\n`,
			exitCode: elements.length ? 0 : 1,
		}
	if (elements.length) return { output: elements.map(renderElement).join('\n'), exitCode: 0 }

	const skipped = loaded.skipped.length
		? ` (skipped ${loaded.skipped.map((entry) => `${entry.packageName}: ${entry.reason}`).join('; ')})`
		: ''
	if (loaded.dialectes.length === 0)
		return { output: `no installed dialecte holds "${tagName}"${skipped}\n`, exitCode: 1 }
	const suggestions = loaded.dialectes.map((dialecte) => {
		const closest = closestNames({
			name: tagName,
			candidates: dialecte.config.elements,
			limit: SUGGESTION_LIMIT,
		})
		return `no element "${tagName}" in ${dialecte.packageName}${closest.length ? ` - closest: ${closest.join(', ')}` : ''}`
	})
	return { output: `${suggestions.join('\n')}${skipped}\n`, exitCode: 1 }
}

function renderElement(element: ElementDescription): string {
	const lines = [
		`${element.tag}  ${element.packageName}  {${element.namespace}}`,
		`parents: ${element.parents.join(', ') || 'none (the root)'}`,
	]
	if (element.children.length || element.anyChild) lines.push('children, in order:')
	else lines.push('children: none')
	for (const child of element.children)
		lines.push(`  ${child.tag}  ${child.min}..${child.max ?? '*'}`)
	if (element.anyChild) lines.push('  any element of another namespace')
	lines.push(element.attributes.length ? 'attributes:' : 'attributes: none')
	for (const attribute of element.attributes) lines.push(`  ${renderAttribute(attribute)}`)
	lines.push(`text: ${element.text ?? 'none'}`)
	if (element.xsiTypes.length) lines.push(`xsi:type: ${element.xsiTypes.join(', ')}`)
	return `${lines.join('\n')}\n`
}

function renderAttribute(attribute: AttributeDescription): string {
	const parts = [
		// a foreign attribute is stored and written with its prefix (`ext:cA`): the name says it
		attribute.name,
		attribute.required ? 'required' : 'optional',
	]
	if (attribute.identityField) parts.push('identity')
	if (attribute.type) parts.push(attribute.type)
	if (attribute.fixed !== undefined) parts.push(`fixed ${JSON.stringify(attribute.fixed)}`)
	if (attribute.default !== undefined) parts.push(`default ${JSON.stringify(attribute.default)}`)
	if (attribute.enumeration.length) parts.push(`one of: ${attribute.enumeration.join(', ')}`)
	for (const pattern of attribute.patterns) parts.push(`pattern ${pattern}`)
	return parts.join('  ')
}
