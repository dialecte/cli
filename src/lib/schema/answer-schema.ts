import { closestNames } from '../closest-names.ts'
import { endedOf, jsonOf, textOf } from '../print/print.ts'
import { describeDeclarations } from './describe-declarations.ts'
import { describeElement } from './describe-element.ts'
import { heldDeclarationIds } from './resolve-declaration.ts'
import { SUGGESTION_LIMIT } from './schema.constants.ts'

import type { CommandOutput } from '../command-output.types.ts'
import type {
	AttributeDescription,
	DeclarationDescription,
	ElementDescription,
	LoadedDialecte,
	LoadedDialectes,
	SchemaAnswer,
	SchemaJsonElement,
} from './schema.types.ts'

/**
 * What `dialecte schema <Tag>` prints: one block per installed dialecte holding the tag, or the closest tags.
 * A tag declared several ways prints the declaration its `--under` parent decides, else each declaration with
 * the parents that hold it.
 *
 * @intent answer a schema lookup from dialectes already loaded, tell what an element may hold and where
 */
export function answerSchema(params: {
	loaded: LoadedDialectes
	tagName: string
	/** A parent (`--under`): answers the declaration(s) the tag has there. */
	under?: string | undefined
	json: boolean
}): CommandOutput {
	const { loaded, tagName, under } = params
	const answers = loaded.dialectes.flatMap(
		(dialecte) => answerOf({ dialecte, tagName, under }) ?? [],
	)
	if (params.json)
		return {
			output: endedOf(
				jsonOf({ elements: answers.map(jsonElementOf), skipped: loaded.skipped }, '\t'),
			),
			exitCode: answers.length ? 0 : 1,
		}
	if (answers.length)
		return {
			output: textOf([
				...answers.flatMap((answer, index) => [
					...(index === 0 ? [] : ['']),
					...renderAnswer(answer),
				]),
				'',
			]),
			exitCode: 0,
		}
	return { output: textOf([...missingLines({ loaded, tagName, under }), '']), exitCode: 1 }
}

/** The answer of one dialecte: the element, the declaration it is, the declarations left open. */
function answerOf(params: {
	dialecte: LoadedDialecte
	tagName: string
	under: string | undefined
}): SchemaAnswer | undefined {
	const { dialecte, tagName, under } = params
	const element = describeElement({ dialecte, tagName, parent: under })
	if (element === undefined) return undefined
	const ways = element.resolved
		? []
		: describeDeclarations({ dialecte, tagName, ids: openIds({ dialecte, tagName, under }) })
	return { element, ways, under }
}

/**
 * The declarations an unresolved answer lists: those the `--under` parent holds; every one (undefined) without a
 * parent or when the parent names none of them (a wildcard parent).
 */
function openIds(params: {
	dialecte: LoadedDialecte
	tagName: string
	under: string | undefined
}): string[] | undefined {
	const { dialecte, tagName, under } = params
	if (under === undefined) return undefined
	const held = heldDeclarationIds({
		definition: dialecte.config.definition,
		tagName,
		parent: under,
	})
	return held.length ? held : undefined
}

/** An answer in `--json`: the element, with its declarations (`ways`) when the parent leaves them open. */
function jsonElementOf(answer: SchemaAnswer): SchemaJsonElement {
	return answer.element.resolved ? answer.element : { ...answer.element, ways: answer.ways }
}

function renderAnswer(answer: SchemaAnswer): string[] {
	const { element, under } = answer
	if (element.resolved && (element.declaration === undefined || under === undefined))
		return renderElement(element)
	if (element.resolved)
		return [
			`${element.tag} under ${under}: declaration ${element.declaration}, one of ${element.declarations} ways`,
			...renderElement(element),
		]
	const heading =
		under === undefined
			? `${element.tag} is declared ${element.declarations} ways - pick one with --under <Parent>`
			: `${element.tag} under ${under}: declarations ${listOf(answer.ways.map((way) => way.id))} of ${element.declarations}, the parent does not decide`
	return [
		heading,
		...answer.ways.flatMap((way, index) => [...(index === 0 ? [] : ['']), ...renderWay(way)]),
	]
}

function renderWay(way: DeclarationDescription): string[] {
	return [`declaration ${way.id}${way.global ? '  global' : ''}`, ...renderElement(way.element)]
}

/** `1`, `1 and 2`, `1, 2 and 3`. */
function listOf(words: readonly string[]): string {
	if (words.length < 2) return words.join('')
	return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** Why no dialecte answered: a parent that does not hold the tag (its parents named), else the closest tags. */
function missingLines(params: {
	loaded: LoadedDialectes
	tagName: string
	under: string | undefined
}): string[] {
	const { loaded, tagName, under } = params
	const skipped = loaded.skipped.length
		? ` (skipped ${loaded.skipped.map((entry) => `${entry.packageName}: ${entry.reason}`).join('; ')})`
		: ''
	if (loaded.dialectes.length === 0) return [`no installed dialecte holds "${tagName}"${skipped}`]
	const lines = loaded.dialectes.map(function missingLine(dialecte: LoadedDialecte): string {
		const tagLevel = dialecte.config.elements.includes(tagName)
			? dialecte.config.definition[tagName]
			: undefined
		if (tagLevel !== undefined && under !== undefined)
			return `no ${tagName} under ${under} - its parents: ${tagLevel.parents.join(', ') || 'none (the root)'}`
		const closest = closestNames({
			name: tagName,
			candidates: dialecte.config.elements,
			limit: SUGGESTION_LIMIT,
		})
		return `no element "${tagName}" in ${dialecte.packageName}${closest.length ? ` - closest: ${closest.join(', ')}` : ''}`
	})
	const lastIndex = lines.length - 1
	return lines.map((line, index) => (index === lastIndex ? `${line}${skipped}` : line))
}

function renderElement(element: ElementDescription): string[] {
	const lines = [`${element.tag}  ${element.packageName}  {${element.namespace}}`]
	if (element.documentation !== undefined) lines.push(`documentation: ${element.documentation}`)
	if (element.type !== undefined) lines.push(`type: ${element.type}`)
	lines.push(`parents: ${element.parents.join(', ') || 'none (the root)'}`)
	if (element.children.length || element.anyChild) lines.push('children, in order:')
	else lines.push('children: none')
	for (const child of element.children)
		lines.push(`  ${child.tag}  ${child.min}..${child.max ?? '*'}`)
	if (element.anyChild) lines.push('  any element of another namespace')
	lines.push(element.attributes.length ? 'attributes:' : 'attributes: none')
	for (const attribute of element.attributes) lines.push(`  ${renderAttribute(attribute)}`)
	lines.push(`text: ${element.text ?? 'none'}`)
	if (element.xsiTypes.length) lines.push(`xsi:type: ${element.xsiTypes.join(', ')}`)
	return lines
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
