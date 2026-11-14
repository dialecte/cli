import { closestNames } from '../../closest-names.ts'
import { describeElement } from '../../schema/describe-element.ts'
import { resolveDeclaration } from '../../schema/resolve-declaration.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	ASK_REFUSALS,
	ASK_SUGGESTION_LIMIT,
	CLOSEST_TEMPLATE,
	HOLDERS_SEPARATOR,
	HOLDERS_TEMPLATE,
	NAME_SEPARATOR,
	NAMED_WITHOUT_DIALECTE,
} from './ask.constants.ts'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { FactSubjectTag } from '../facts/facts.types.ts'
import type { ContextAnswer, ContextTag, KindSlots, ResolveContextParams } from './ask.types.ts'

/**
 * The question in its dialecte: per subject tag, how many ways it is declared and whether its parent decides which.
 */
export function resolveContext(params: ResolveContextParams): ContextAnswer {
	const { subject, slots, dialectes } = params
	const tagNames = [...new Set(subject.tags.map(({ tag }) => tag))]
	const attributes = [
		...subject.attributes,
		...(slots.attribute === undefined ? [] : [slots.attribute]),
	]

	if (dialectes.length === 0) {
		const named = namedWithoutDialecte({ tagNames, attributes, packageName: params.packageName })
		if (named !== undefined)
			return {
				refused: fillMessage({ template: ASK_REFUSALS.noDialecteInstalled, values: { named } }),
			}
	}

	const unknown = tagNames.find((tag) => holdersOf({ dialectes, tag }).length === 0)
	if (unknown !== undefined) return { refused: unknownTagRefusal({ dialectes, tag: unknown }) }

	const chosen = chooseDialecte({ ...params, tagNames })
	if ('refused' in chosen) return chosen
	const { dialecte } = chosen

	const attributeRefusal = unknownAttributeRefusal({
		attributes,
		dialectes: dialecte === undefined ? dialectes : [dialecte],
	})
	if (attributeRefusal !== undefined) return { refused: attributeRefusal }
	if (dialecte === undefined)
		return {
			context: { package: null, tags: [], resolved: true, decision: params.decision === true },
			dialecte,
		}

	const placed = placeTags({ dialecte, tags: subject.tags, slots })
	if ('refused' in placed) return placed
	const tags = placed.tags.map(function contextTagOf(entry: FactSubjectTag): ContextTag {
		return contextTag({ dialecte, dialectes, entry })
	})
	const resolved = tags.every((entry) => entry.resolved)
	return {
		context: {
			package: dialecte.packageName,
			tags,
			resolved,
			decision: params.decision === true || !resolved,
		},
		dialecte,
	}
}

/** The first thing a question names that only a dialecte reads (a tag, an attribute, `--package`); else undefined. */
function namedWithoutDialecte(params: {
	tagNames: readonly string[]
	attributes: readonly string[]
	packageName: string | undefined
}): string | undefined {
	const [tag] = params.tagNames
	if (tag !== undefined)
		return fillMessage({ template: NAMED_WITHOUT_DIALECTE.tag, values: { name: tag } })
	const [attribute] = params.attributes
	if (attribute !== undefined)
		return fillMessage({ template: NAMED_WITHOUT_DIALECTE.attribute, values: { name: attribute } })
	if (params.packageName !== undefined)
		return fillMessage({
			template: NAMED_WITHOUT_DIALECTE.package,
			values: { name: params.packageName },
		})
	return undefined
}

/** The loaded dialectes declaring a tag. */
function holdersOf(params: {
	dialectes: readonly LoadedDialecte[]
	tag: string
}): LoadedDialecte[] {
	return params.dialectes.filter((dialecte) => dialecte.config.elements.includes(params.tag))
}

/**
 * The dialecte the question is read in: the one declaring every subject tag; `--package` among several, else the
 * folder's own package when it is one of them; refused when none or several remain. No dialecte (undefined) when
 * the question names no tag and several or none are loaded.
 */
function chooseDialecte(
	params: ResolveContextParams & { tagNames: string[] },
): { dialecte: LoadedDialecte | undefined } | { refused: string } {
	const { dialectes, tagNames, packageName, ownPackage } = params
	const tags = tagNames.join(NAME_SEPARATOR)
	const candidates = dialectes.filter((dialecte) =>
		tagNames.every((tag) => dialecte.config.elements.includes(tag)),
	)
	const candidateNames = candidates.map(({ packageName: name }) => name).join(NAME_SEPARATOR)

	if (packageName !== undefined) {
		const named = candidates.find((dialecte) => dialecte.packageName === packageName)
		if (named !== undefined) return { dialecte: named }
		const installed = dialectes.some((dialecte) => dialecte.packageName === packageName)
		if (!installed)
			return {
				refused: fillMessage({
					template: ASK_REFUSALS.packageNotInstalled,
					values: {
						package: packageName,
						packages: dialectes.map(({ packageName: name }) => name).join(NAME_SEPARATOR),
					},
				}),
			}
		return {
			refused: fillMessage({
				template: ASK_REFUSALS.packageNotHolding,
				values: { package: packageName, tags, packages: candidateNames },
			}),
		}
	}
	if (candidates.length === 1) return { dialecte: candidates[0] }
	const own = candidates.find((dialecte) => dialecte.packageName === ownPackage)
	if (own !== undefined) return { dialecte: own }
	if (tagNames.length === 0) return { dialecte: undefined }
	if (candidates.length === 0)
		return {
			refused: fillMessage({
				template: ASK_REFUSALS.noCommonDialecte,
				values: { tags, holders: holdersLine({ dialectes, tagNames }) },
			}),
		}
	return {
		refused: fillMessage({
			template: ASK_REFUSALS.severalDialectes,
			values: { tags, packages: candidateNames },
		}),
	}
}

/** Each tag with the dialectes declaring it: `AA_1: @x/a; BB_1: @x/b`. */
function holdersLine(params: { dialectes: readonly LoadedDialecte[]; tagNames: string[] }): string {
	return params.tagNames
		.map(function holdersOfTag(tag: string): string {
			const names = holdersOf({ dialectes: params.dialectes, tag }).map(
				({ packageName }) => packageName,
			)
			return fillMessage({
				template: HOLDERS_TEMPLATE,
				values: { tag, packages: names.join(NAME_SEPARATOR) },
			})
		})
		.join(HOLDERS_SEPARATOR)
}

/** A tag no loaded dialecte declares, with the closest declared names. */
function unknownTagRefusal(params: { dialectes: readonly LoadedDialecte[]; tag: string }): string {
	const candidates = [...new Set(params.dialectes.flatMap((dialecte) => dialecte.config.elements))]
	return fillMessage({
		template: ASK_REFUSALS.unknownTag,
		values: {
			tag: params.tag,
			packages: packagesLine({ dialectes: params.dialectes }),
			closest: closestPart({ name: params.tag, candidates }),
		},
	})
}

/** The first attribute the dialectes do not declare, refused with the closest declared names; else undefined. */
function unknownAttributeRefusal(params: {
	attributes: string[]
	dialectes: readonly LoadedDialecte[]
}): string | undefined {
	const declared = new Set(params.dialectes.flatMap((dialecte) => attributesOf({ dialecte })))
	const unknown = params.attributes.find((attribute) => !declared.has(attribute))
	if (unknown === undefined) return undefined
	return fillMessage({
		template: ASK_REFUSALS.unknownAttribute,
		values: {
			attribute: unknown,
			packages: packagesLine({ dialectes: params.dialectes }),
			closest: closestPart({ name: unknown, candidates: [...declared] }),
		},
	})
}

/** Every attribute name a dialecte's elements declare, in each of their declarations. */
function attributesOf(params: { dialecte: LoadedDialecte }): string[] {
	const { definition, elements } = params.dialecte.config
	return elements.flatMap(function attributesOfTag(tag: string): string[] {
		const tagLevel = definition[tag]
		if (tagLevel === undefined) return []
		return [tagLevel, ...Object.values(tagLevel.declarations ?? {})].flatMap(
			(entry) => entry.attributes.sequence,
		)
	})
}

/** The packages of the dialectes, joined. */
function packagesLine(params: { dialectes: readonly LoadedDialecte[] }): string {
	return params.dialectes.map(({ packageName }) => packageName).join(NAME_SEPARATOR)
}

/** ` - closest: ...` when a declared name is close, else nothing. */
function closestPart(params: { name: string; candidates: readonly string[] }): string {
	const names = closestNames({ ...params, limit: ASK_SUGGESTION_LIMIT })
	if (names.length === 0) return ''
	return fillMessage({ template: CLOSEST_TEMPLATE, values: { names: names.join(NAME_SEPARATOR) } })
}

/**
 * Each subject tag with its parent: the `--about` parent, else the slot parent, else the one other subject tag
 * the tag lists as a parent (two: none). A subject tag taken as another's parent is folded into it (D5b). A given
 * parent the tag does not admit is refused, naming the tag's parents.
 */
function placeTags(params: {
	dialecte: LoadedDialecte
	tags: readonly FactSubjectTag[]
	slots: KindSlots
}): { tags: FactSubjectTag[] } | { refused: string } {
	const { dialecte, tags, slots } = params
	const { definition } = dialecte.config
	const tagNames = tags.map(({ tag }) => tag)
	function parentsOf(tag: string): readonly string[] {
		return definition[tag]?.parents ?? []
	}

	const folded = new Set<string>(slots.parent === undefined ? [] : [slots.parent])
	for (const { tag, parent } of tags) {
		if (parent !== null) folded.add(parent)
		for (const other of tagNames)
			if (other !== tag && parentsOf(tag).includes(other) && !parentsOf(other).includes(tag))
				folded.add(other)
	}

	const placed: FactSubjectTag[] = []
	for (const { tag, parent } of tags) {
		if (folded.has(tag) || placed.some((entry) => entry.tag === tag)) continue
		const given = parent ?? (slots.tag === tag ? slots.parent : undefined)
		if (given !== undefined && !parentsOf(tag).includes(given))
			return {
				refused: fillMessage({
					template: ASK_REFUSALS.parentNotAdmitted,
					values: {
						tag,
						parent: given,
						package: dialecte.packageName,
						parents: parentsOf(tag).join(NAME_SEPARATOR),
					},
				}),
			}
		const named = tagNames.filter((other) => other !== tag && parentsOf(tag).includes(other))
		placed.push({ tag, parent: given ?? (named.length === 1 ? named[0] : null) })
	}
	return { tags: placed }
}

/** A placed tag in its context: its declarations, whether its parent resolves one, the dialectes declaring it. */
function contextTag(params: {
	dialecte: LoadedDialecte
	dialectes: readonly LoadedDialecte[]
	entry: FactSubjectTag
}): ContextTag {
	const { dialecte, entry } = params
	const parent = entry.parent ?? undefined
	const element = describeElement({ dialecte, tagName: entry.tag, parent })
	const declarations =
		element?.declarations ??
		resolveDeclaration({ definition: dialecte.config.definition, tagName: entry.tag })
			?.declarations ??
		0
	return {
		tag: entry.tag,
		parent: entry.parent,
		declarations,
		resolved: element?.resolved === true,
		packages: holdersOf({ dialectes: params.dialectes, tag: entry.tag }).map(
			({ packageName }) => packageName,
		),
	}
}
