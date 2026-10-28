/**
 * The references of a plan made good, from the identity constraints the definition declares: every element a
 * key selects gets each of its key fields (a value sampled for it), and every element a keyref selects whose
 * fields are all planned points at an element of the referred key holding the same values - an element
 * already planned when the values can meet (itself included), else one planted along the key's selector,
 * with what it requires in turn. Walked again until nothing changes (an
 * element planted can hold references of its own), a bounded number of times.
 */
import { allocateValue } from './allocate-value.ts'
import { REFERENCE_ROUND_LIMIT } from './fixture.constants.ts'
import { planNode } from './plan-node.ts'
import { attributeValues } from './sample-attribute.ts'
import { acceptsValue } from './sample-datatype.ts'
import { descendantsAndSelf, selectNodes } from './select-nodes.ts'

import type { FieldReader, PlanContext, PlanNode } from './fixture.types.ts'
import type { IdentityConstraint } from '@dialecte/core'

/** Undefined once every reference holds; the problem names the constraint the fixture cannot satisfy. */
export function plantReferences(params: {
	context: PlanContext
	root: PlanNode
	/** How many walks the references get; a guard against references that keep asking for new elements. */
	roundLimit?: number
}): { problem: string } | undefined {
	const roundLimit = params.roundLimit ?? REFERENCE_ROUND_LIMIT
	for (let round = 0; round < roundLimit; round++) {
		const walked = walkReferences(params)
		if ('problem' in walked) return walked
		if (!walked.changed) return undefined
	}
	return {
		problem: `the references still ask for new elements after ${roundLimit} walk(s) of the plan: no finite fixture satisfies them`,
	}
}

function walkReferences(params: {
	context: PlanContext
	root: PlanNode
}): { changed: boolean } | { problem: string } {
	const { context, root } = params
	let changed = false
	for (const scope of descendantsAndSelf({ node: root })) {
		const constraints = scope.definition.constraints ?? []
		for (const constraint of constraints) {
			if (constraint.kind === 'unique') continue
			const fields = fieldReaders({ constraint })
			if ('problem' in fields) return fields
			const done =
				constraint.kind === 'key'
					? fillKeyFields({ context, scope, constraint, fields: fields.readers })
					: pointReferences({
							context,
							root,
							scope,
							constraint,
							fields: fields.readers,
							constraints,
						})
			if ('problem' in done) return done
			changed ||= done.changed
		}
	}
	return { changed }
}

/** Every element the key selects holds each key field: a missing one gets a sampled value. */
function fillKeyFields(params: {
	context: PlanContext
	scope: PlanNode
	constraint: IdentityConstraint
	fields: readonly FieldReader[]
}): { changed: boolean } | { problem: string } {
	const { context, scope, constraint, fields } = params
	let changed = false
	for (const keyed of selectNodes({ scope, paths: constraint.selector })) {
		for (const field of fields) {
			if (readField({ node: keyed, field }) !== undefined) continue
			if ('text' in field)
				return { problem: `key ${constraint.name}: ${keyed.tagName} has no text to key on` }
			const offered = attributeValues({
				config: context.dialecte.config,
				readers: context.dialecte.readers,
				record: keyed.record,
				attributeName: field.attribute,
				datatype: keyed.definition.attributes.details[field.attribute]?.type,
			})
			if ('problem' in offered) return { problem: `key ${constraint.name}: ${offered.problem}` }
			keyed.attributes.set(
				field.attribute,
				allocateValue({ values: offered.values, used: context.used }),
			)
			changed = true
		}
	}
	return { changed }
}

/** Every element the keyref selects, its fields planned, points at an element of the key: planted when missing. */
function pointReferences(params: {
	context: PlanContext
	root: PlanNode
	scope: PlanNode
	constraint: IdentityConstraint
	fields: readonly FieldReader[]
	constraints: readonly IdentityConstraint[]
}): { changed: boolean } | { problem: string } {
	const { context, scope, constraint, fields, constraints } = params
	const key = constraints.find(
		(candidate) =>
			candidate.kind !== 'keyref' &&
			candidate.name === constraint.refer?.name &&
			candidate.namespace === constraint.refer?.namespace,
	)
	if (!key)
		return {
			problem: `keyref ${constraint.name} refers to ${constraint.refer?.name ?? 'no key'}, not declared on ${scope.tagName}: the fixture cannot point it`,
		}
	const keyFields = fieldReaders({ constraint: key })
	if ('problem' in keyFields) return keyFields

	let changed = false
	for (const referring of selectNodes({ scope, paths: constraint.selector })) {
		const values = fields.map((field) => readField({ node: referring, field }))
		if (values.some((value) => value === undefined)) continue
		const targets = selectNodes({ scope, paths: key.selector })
		const isPointed = targets.some((target) =>
			keyFields.readers.every(
				(field, index) => readField({ node: target, field }) === values[index],
			),
		)
		if (isPointed) continue
		const adopted = targets.some((target) =>
			pointAtExisting({
				context,
				root: params.root,
				referring,
				fields,
				target,
				targetFields: keyFields.readers,
			}),
		)
		if (adopted) {
			changed = true
			continue
		}
		const planted = plantTarget({ context, scope, key })
		if ('problem' in planted) return { problem: `keyref ${constraint.name}: ${planted.problem}` }
		const broughtAlong = selectNodes({ scope, paths: key.selector }).filter(
			(target) => !targets.includes(target),
		)
		const isPointedAtBroughtAlong = broughtAlong.some((target) =>
			pointAtExisting({
				context,
				root: params.root,
				referring,
				fields,
				target,
				targetFields: keyFields.readers,
			}),
		)
		if (!isPointedAtBroughtAlong) {
			const added = addTarget({ context, parent: planted.parent, tagName: planted.tagName })
			if ('problem' in added) return { problem: `keyref ${constraint.name}: ${added.problem}` }
			const matched = matchFields({
				context,
				referring,
				fields,
				target: added.target,
				targetFields: keyFields.readers,
			})
			if (matched) return { problem: `keyref ${constraint.name}: ${matched.problem}` }
		}
		changed = true
	}
	return { changed }
}

/**
 * Point the referring element at an element of the key already planned, when the values can meet: field by
 * field, the referring element takes the target's value when its own rules allow it, else the target takes
 * the referring value when its rules allow it and no other element holds the value it gives up (nothing else
 * points at it). Refused when a value given would repeat an entry of a unique or key constraint covering that
 * element and attribute. Applied only when every field meets; answers whether it did.
 */
function pointAtExisting(params: {
	context: PlanContext
	root: PlanNode
	referring: PlanNode
	fields: readonly FieldReader[]
	target: PlanNode
	targetFields: readonly FieldReader[]
}): boolean {
	const { context, root, referring, fields, target, targetFields } = params
	const changes: { node: PlanNode; attribute: string; value: string }[] = []
	for (const [index, targetField] of targetFields.entries()) {
		const field = fields[index]
		if (!field || 'text' in field || 'text' in targetField) return false
		const referringValue = referring.attributes.get(field.attribute)
		const targetValue = target.attributes.get(targetField.attribute)
		if (referringValue === undefined || targetValue === undefined) return false
		if (referringValue === targetValue) continue
		if (takesValue({ context, node: referring, attribute: field.attribute, value: targetValue })) {
			changes.push({ node: referring, attribute: field.attribute, value: targetValue })
			continue
		}
		const isHeldElsewhere = descendantsAndSelf({ node: root }).some(
			(node) =>
				node !== target && [...node.attributes.values()].some((value) => value === targetValue),
		)
		if (
			isHeldElsewhere ||
			!takesValue({
				context,
				node: target,
				attribute: targetField.attribute,
				value: referringValue,
			})
		)
			return false
		changes.push({ node: target, attribute: targetField.attribute, value: referringValue })
	}
	const breaksIdentity = changes.some((change) => repeatsIdentity({ root, ...change }))
	if (breaksIdentity) return false
	for (const { node, attribute, value } of changes) node.attributes.set(attribute, value)
	return true
}

/**
 * Whether giving the element's attribute the value would repeat an entry of a unique or key constraint covering
 * them: another element its selector reaches already holds the same values in every field.
 */
function repeatsIdentity(params: {
	root: PlanNode
	node: PlanNode
	attribute: string
	value: string
}): boolean {
	const { root, node, attribute, value } = params
	function entryOf(params: {
		of: PlanNode
		fields: readonly FieldReader[]
	}): (string | undefined)[] {
		return params.fields.map((field) =>
			params.of === node && 'attribute' in field && field.attribute === attribute
				? value
				: readField({ node: params.of, field }),
		)
	}
	for (const scope of descendantsAndSelf({ node: root }))
		for (const constraint of scope.definition.constraints ?? []) {
			if (constraint.kind === 'keyref') continue
			const fields = fieldReaders({ constraint })
			if ('problem' in fields) continue
			const covers = fields.readers.some(
				(field) => 'attribute' in field && field.attribute === attribute,
			)
			const selected = selectNodes({ scope, paths: constraint.selector })
			if (!covers || !selected.includes(node)) continue
			const entry = entryOf({ of: node, fields: fields.readers })
			const isRepeated = selected.some((other) => {
				if (other === node) return false
				const otherEntry = entryOf({ of: other, fields: fields.readers })
				return otherEntry.every((part, index) => part !== undefined && part === entry[index])
			})
			if (isRepeated) return true
		}
	return false
}

/** Whether the element's attribute may hold the value: its fixed value if it has one, else what its type takes. */
function takesValue(params: {
	context: PlanContext
	node: PlanNode
	attribute: string
	value: string
}): boolean {
	const { context, node, attribute, value } = params
	const { config, readers } = context.dialecte
	const rules = readers.getAttributeRules({
		dialecteConfig: config,
		record: node.record,
		attributeName: attribute,
	})
	if (rules.fixed !== undefined) return value === rules.fixed
	return acceptsValue({
		readers,
		datatype: node.definition.attributes.details[attribute]?.type,
		value,
	})
}

/**
 * The parents of a new element of the key, along the key's first selector that is not a deep one: each reused
 * when planned, else planned (what one requires may already be an element of the key). Answers the last
 * parent and the tag the new element would take.
 */
function plantTarget(params: {
	context: PlanContext
	scope: PlanNode
	key: IdentityConstraint
}): { parent: PlanNode; tagName: string } | { problem: string } {
	const { context, scope, key } = params
	const { config } = context.dialecte
	const path = key.selector.find((alternative) => !alternative.deep && alternative.steps.length)
	if (!path) return { problem: `the key ${key.name} selects no path to plant an element along` }
	let parent = scope
	for (const [index, step] of path.steps.entries()) {
		if (step.name === undefined)
			return { problem: `the key ${key.name} selects any element: no tag to plant` }
		if (!(config.children[parent.tagName] ?? []).includes(step.name))
			return {
				problem: `${parent.tagName} holds no ${step.name}, which the key ${key.name} selects`,
			}
		if (index === path.steps.length - 1) return { parent, tagName: step.name }
		const reused = parent.children.find((child) => child.tagName === step.name)
		if (reused) {
			parent = reused
			continue
		}
		const added = addTarget({ context, parent, tagName: step.name })
		if ('problem' in added) return added
		parent = added.target
	}
	return { problem: `the key ${key.name} selects no element` }
}

/** A planned element added under the parent, in sequence order. */
function addTarget(params: {
	context: PlanContext
	parent: PlanNode
	tagName: string
}): { target: PlanNode } | { problem: string } {
	const { context, parent, tagName } = params
	const { config, readers } = context.dialecte
	const planned = planNode({ context, tagName, chainBelow: [], requiredAbove: [] })
	if ('problem' in planned) return planned
	parent.children = readers.orderByConfigSequence({
		parentTagName: parent.tagName,
		children: [...parent.children, planned],
		childrenConfig: config.children,
	})
	return { target: planned }
}

/**
 * The planted element takes the referring element's values; a value its own type refuses is replaced, on
 * both, by a new one both types take.
 */
function matchFields(params: {
	context: PlanContext
	referring: PlanNode
	fields: readonly FieldReader[]
	target: PlanNode
	targetFields: readonly FieldReader[]
}): { problem: string } | undefined {
	const { context, referring, fields, target, targetFields } = params
	const { readers, config } = context.dialecte
	for (const [index, targetField] of targetFields.entries()) {
		const field = fields[index]
		if (!field || 'text' in field || 'text' in targetField)
			return { problem: 'a text field cannot be planted' }
		const value = referring.attributes.get(field.attribute) ?? ''
		const targetType = target.definition.attributes.details[targetField.attribute]?.type
		if (acceptsValue({ readers, datatype: targetType, value })) {
			target.attributes.set(targetField.attribute, value)
			continue
		}
		const referringType = referring.definition.attributes.details[field.attribute]?.type
		const offered = attributeValues({
			config,
			readers,
			record: target.record,
			attributeName: targetField.attribute,
			datatype: targetType,
		})
		if ('problem' in offered) return offered
		const shared = offered.values.filter(
			(candidate) =>
				!context.used.has(candidate) &&
				acceptsValue({ readers, datatype: referringType, value: candidate }),
		)
		if (!shared.length)
			return {
				problem: `no value both ${referring.tagName}@${field.attribute} and ${target.tagName}@${targetField.attribute} take`,
			}
		const sharedValue = allocateValue({ values: shared, used: context.used })
		referring.attributes.set(field.attribute, sharedValue)
		target.attributes.set(targetField.attribute, sharedValue)
	}
	return undefined
}

/** What each field reads: an attribute of the selected element, or its text; a field reaching further is not planted. */
function fieldReaders(params: {
	constraint: IdentityConstraint
}): { readers: FieldReader[] } | { problem: string } {
	const { constraint } = params
	const readers: FieldReader[] = []
	for (const field of constraint.fields) {
		const [path] = field
		if (!path || path.steps.length || path.deep)
			return {
				problem: `${constraint.kind} ${constraint.name}: a field reaching past the selected element is not planted`,
			}
		if (path.attribute?.name) readers.push({ attribute: path.attribute.name })
		else if (!path.attribute) readers.push({ text: true })
		else
			return {
				problem: `${constraint.kind} ${constraint.name}: a field reading any attribute is not planted`,
			}
	}
	return { readers }
}

function readField(params: { node: PlanNode; field: FieldReader }): string | undefined {
	const { node, field } = params
	return 'text' in field ? node.text : node.attributes.get(field.attribute)
}
