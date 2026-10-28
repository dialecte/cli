import { allocateValue } from './allocate-value.ts'
import { XSI_NAMESPACE, XSI_TYPE_ATTRIBUTE } from './fixture.constants.ts'
import { attributeValues, textValues } from './sample-attribute.ts'

import type { FixtureDialecte, PlanContext, PlanNode } from './fixture.types.ts'
import type { RequiredChoice, ResolvableRecord } from '@dialecte/core/utils'

/**
 * An element of the plan: its required attributes and text, then its children in sequence order - each it
 * requires, as many times as required, the first branch of each choice it requires that no child already
 * takes, and the next element of the chain (counted as one of them when required too). `requiredAbove` holds
 * the elements added above this one only because they were required, up to the chain: a required child among
 * them would require itself again, without end.
 */
export function planNode(params: {
	context: PlanContext
	tagName: string
	chainBelow: readonly string[]
	requiredAbove: readonly string[]
}): PlanNode | { problem: string } {
	const { context, tagName, chainBelow, requiredAbove } = params
	const { dialecte } = context
	const { config, readers } = dialecte
	const typed = typedRecord({ dialecte, tagName })
	if ('problem' in typed) return typed
	const { record, xsiType } = typed
	const definition = readers.resolveDefinition({ dialecteConfig: config, record })
	if (!definition) return { problem: `no definition of ${tagName} in ${dialecte.packageName}` }

	const node: PlanNode = {
		tagName,
		...(xsiType && { xsiType }),
		record,
		definition,
		attributes: new Map(),
		children: [],
	}
	for (const attributeName of definition.attributes.sequence) {
		const rules = readers.getAttributeRules({ dialecteConfig: config, record, attributeName })
		if (!rules.isRequired) continue
		const offered = attributeValues({
			config,
			readers,
			record,
			attributeName,
			datatype: definition.attributes.details[attributeName]?.type,
		})
		if ('problem' in offered) return offered
		node.attributes.set(
			attributeName,
			allocateValue({ values: offered.values, used: context.used }),
		)
	}
	const text = textValues({ readers, definition })
	if (text && 'problem' in text) return text
	if (text) node.text = allocateValue({ values: text.values, used: context.used })

	const [next, ...below] = chainBelow
	const lineage = [...requiredAbove, tagName]
	for (const [childTagName, occurrences] of Object.entries(
		readers.childOccurrences({ definition }),
	)) {
		const isNext = childTagName === next
		const count = isNext ? Math.max(occurrences.min, 1) : occurrences.min
		for (let copy = 0; copy < count; copy++) {
			const continuesChain = isNext && copy === 0
			const child = continuesChain
				? planNode({ context, tagName: childTagName, chainBelow: below, requiredAbove: [] })
				: planRequiredChild({ context, tagName: childTagName, lineage })
			if ('problem' in child) return child
			node.children.push(child)
		}
	}
	const chosen = takeRequiredChoices({
		context,
		node,
		choices: readers.requiredChoices({ definition }),
		lineage,
	})
	if (chosen) return chosen
	node.children = readers.orderByConfigSequence({
		parentTagName: tagName,
		children: node.children,
		childrenConfig: config.children,
	})
	return node
}

/** A child added because its parent requires it: refused when it would require itself again below. */
function planRequiredChild(params: {
	context: PlanContext
	tagName: string
	lineage: readonly string[]
}): PlanNode | { problem: string } {
	const { context, tagName, lineage } = params
	if (lineage.includes(tagName))
		return {
			problem: `${tagName} requires itself below it (${[...lineage, tagName].join(' > ')}): no finite fixture holds it`,
		}
	return planNode({ context, tagName, chainBelow: [], requiredAbove: lineage })
}

/**
 * For each required choice no planned child already takes, the children its first branch requires (as many
 * as the branch and the choice require, less those planned), then the choices that branch requires in turn.
 */
function takeRequiredChoices(params: {
	context: PlanContext
	node: PlanNode
	choices: readonly RequiredChoice[]
	lineage: readonly string[]
}): { problem: string } | undefined {
	const { context, node, choices, lineage } = params
	for (const choice of choices) {
		const planned = node.children.map((child) => child.tagName)
		const isTaken = choice.branches.some((branch) =>
			Object.keys(branch.children).some((tagName) => planned.includes(tagName)),
		)
		const [first] = choice.branches
		if (isTaken || first === undefined) continue
		for (const [tagName, occurrences] of Object.entries(first.children)) {
			const missing =
				occurrences.min * choice.min - planned.filter((plannedTag) => plannedTag === tagName).length
			for (let copy = 0; copy < missing; copy++) {
				const child = planRequiredChild({ context, tagName, lineage })
				if ('problem' in child) return child
				node.children.push(child)
			}
		}
		const nested = takeRequiredChoices({ context, node, choices: first.choices, lineage })
		if (nested) return nested
	}
	return undefined
}

/**
 * The record the element's definition is read for: as declared, or - its declared type abstract - naming the
 * first variant it admits with xsi:type, so the variant's own attributes and children are planned.
 */
function typedRecord(params: {
	dialecte: FixtureDialecte
	tagName: string
}): { record: ResolvableRecord; xsiType?: string } | { problem: string } {
	const { dialecte, tagName } = params
	const { config, readers } = dialecte
	const declared: ResolvableRecord = { tagName, parent: null, attributes: [] }
	const definition = readers.resolveDefinition({ dialecteConfig: config, record: declared })
	if (!definition?.abstractType) return { record: declared }
	const [xsiType] = readers.admittedXsiTypes({ dialecteConfig: config, record: declared })
	if (xsiType === undefined)
		return { problem: `${tagName} is declared with an abstract type that has no variant` }
	return {
		record: {
			...declared,
			attributes: [{ name: XSI_TYPE_ATTRIBUTE, value: xsiType, namespace: XSI_NAMESPACE }],
		},
		xsiType,
	}
}
