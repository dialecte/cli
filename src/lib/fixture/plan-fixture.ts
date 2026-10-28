/**
 * What `dialecte fixture <Tag>` builds, read from the dialecte's definition through core's readers: the chain
 * of parents from the root (the `--under` path, or the shortest one), every child an element on the way
 * requires (`childOccurrences` min of 1 or more, as many as the min; the first branch of each choice it
 * requires, `requiredChoices`), each with what it requires in turn, a valid value for every required attribute
 * and for text an empty value does not satisfy - each sampled value new in the document, so unique and key
 * fields stay distinct - and, for every reference a key constraint checks, the element it points at
 * (`plantReferences`). An element of an abstract type names its first variant. Nothing is built here: the
 * engine builds the plan.
 */
import { closestNames } from '../closest-names.ts'
import { SUGGESTION_LIMIT } from '../schema/schema.constants.ts'
import { planNode } from './plan-node.ts'
import { plantReferences } from './plant-references.ts'

import type {
	FixtureDialecte,
	FixtureElement,
	FixturePlanResult,
	PlanContext,
	PlanNode,
} from './fixture.types.ts'

export function planFixture(params: {
	dialecte: FixtureDialecte
	tagName: string
	under?: readonly string[]
}): FixturePlanResult {
	const { dialecte, tagName, under } = params
	const { config, packageName } = dialecte
	if (!config.elements.includes(tagName))
		return {
			problem: `no element "${tagName}" in ${packageName}${closestText({ name: tagName, candidates: config.elements })}`,
		}

	const chained = under
		? chainUnder({ dialecte, tagName, under })
		: shortestChain({ dialecte, tagName })
	if ('problem' in chained) return chained
	const { chain } = chained

	const context: PlanContext = { dialecte, used: new Set() }
	const root = planNode({
		context,
		tagName: config.rootElementName,
		chainBelow: chain.slice(1),
		requiredAbove: [],
	})
	if ('problem' in root) return root
	const planted = plantReferences({ context, root })
	if (planted) return planted
	return { plan: { tagName, chain, root: toFixtureElement({ node: root }) } }
}

/** The chain from the root through the `--under` tags (the root itself may be named first) to the tag. */
function chainUnder(params: {
	dialecte: FixtureDialecte
	tagName: string
	under: readonly string[]
}): { chain: string[] } | { problem: string } {
	const { dialecte, tagName, under } = params
	const { rootElementName, children } = dialecte.config
	const steps = under[0] === rootElementName ? under.slice(1) : [...under]
	const chain = [rootElementName]
	for (const step of [...steps, tagName]) {
		const parent = chain[chain.length - 1]
		const held = children[parent] ?? []
		if (!held.includes(step))
			return {
				problem: `--under ${under.join('/')}: ${parent} holds no ${step}${closestText({ name: step, candidates: held })}`,
			}
		chain.push(step)
	}
	return { chain }
}

/** The fewest parents from the root down to the tag; among chains as short, the one met first in sequence order. */
function shortestChain(params: {
	dialecte: FixtureDialecte
	tagName: string
}): { chain: string[] } | { problem: string } {
	const { dialecte, tagName } = params
	const { rootElementName, children } = dialecte.config
	const reachedFrom = new Map<string, string | null>([[rootElementName, null]])
	const queue = [rootElementName]
	for (let index = 0; index < queue.length && !reachedFrom.has(tagName); index++) {
		const parent = queue[index]
		for (const child of children[parent] ?? []) {
			if (reachedFrom.has(child)) continue
			reachedFrom.set(child, parent)
			queue.push(child)
		}
	}
	if (!reachedFrom.has(tagName))
		return { problem: `no chain of children from ${rootElementName} reaches ${tagName}` }

	const chain: string[] = []
	for (let step: string | null | undefined = tagName; step; step = reachedFrom.get(step))
		chain.unshift(step)
	return { chain }
}

function toFixtureElement(params: { node: PlanNode }): FixtureElement {
	const { node } = params
	return {
		tagName: node.tagName,
		...(node.xsiType && { xsiType: node.xsiType }),
		attributes: [...node.attributes].map(([name, value]) => ({ name, value })),
		...(node.text !== undefined && { text: node.text }),
		children: node.children.map((child) => toFixtureElement({ node: child })),
	}
}

function closestText(params: { name: string; candidates: readonly string[] }): string {
	const closest = closestNames({ ...params, limit: SUGGESTION_LIMIT })
	return ` - closest: ${closest.length ? closest.join(', ') : 'none'}`
}
