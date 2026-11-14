import { fillMessage } from '../standard/fill-message.ts'
import {
	ASK_REFUSALS,
	GROUP_SLOT_PATTERN,
	KIND_SHAPES,
	KIND_SLOT_NEEDS,
	MAY_PATTERN,
	MAY_WORD,
	PLACEHOLDER_NUMBER_MARK,
	QUESTION_END_PATTERN,
	REGEX_SPECIAL_PATTERN,
	REGEX_SPECIAL_REPLACEMENT,
	SEMANTIC_KIND,
	SHAPE_END,
	SHAPE_FLAGS,
	SHAPE_START,
	SHAPE_WORD_SEPARATOR,
	SLOT_PLACEHOLDER_PATTERNS,
} from './ask.constants.ts'

import type {
	AskKind,
	AskSubject,
	KindAnswer,
	KindOfParams,
	KindSlots,
	SlotPlaceholder,
} from './ask.types.ts'

/**
 * The kind a question asks and its slots from the subject; `semantic` when no shape fits; a forced kind whose slot the subject cannot fill is refused.
 */
export function kindOf(params: KindOfParams): KindAnswer {
	const { question, subject, kind } = params
	if (kind !== undefined) return forcedKind({ question, subject, kind })
	for (const shape of KIND_SHAPES) {
		const groups = patternOf({ shape: shape.shape }).exec(question)?.groups
		if (groups === undefined) continue
		const slots = slotsOf({ groups, subject })
		if (slots !== undefined) return { kind: shape.kind, slots }
	}
	return { kind: SEMANTIC_KIND, slots: {} }
}

/** A shape's words as an anchored pattern: fixed words escaped (`may` also `can`), placeholders as named groups. */
function patternOf(params: { shape: string }): RegExp {
	let number = 0
	const words = params.shape.split(' ').map(function wordPattern(word: string): string {
		if (Object.hasOwn(SLOT_PLACEHOLDER_PATTERNS, word)) {
			number += 1
			return SLOT_PLACEHOLDER_PATTERNS[word as SlotPlaceholder].replace(
				PLACEHOLDER_NUMBER_MARK,
				String(number),
			)
		}
		if (word.toLowerCase() === MAY_WORD) return MAY_PATTERN
		return word.replace(REGEX_SPECIAL_PATTERN, REGEX_SPECIAL_REPLACEMENT)
	})
	return new RegExp(`${SHAPE_START}${words.join(SHAPE_WORD_SEPARATOR)}${SHAPE_END}`, SHAPE_FLAGS)
}

/**
 * The slots a match took, when each holds a subject of its sort (tags and parents among the subject's tags,
 * attributes among its attributes, codes among its codes) and no slot took two names; else undefined.
 */
function slotsOf(params: {
	groups: Record<string, string | undefined>
	subject: AskSubject
}): KindSlots | undefined {
	const { subject } = params
	const tagNames = subject.tags.map(({ tag }) => tag)
	const slots: KindSlots = {}
	for (const [group, name] of Object.entries(params.groups)) {
		if (name === undefined) continue
		const slot = GROUP_SLOT_PATTERN.exec(group)?.groups?.slot as keyof KindSlots | undefined
		if (slot === undefined) return undefined
		const known =
			slot === 'rest' ||
			((slot === 'tag' || slot === 'parent') && tagNames.includes(name)) ||
			(slot === 'attribute' && subject.attributes.includes(name)) ||
			(slot === 'code' && subject.codes.includes(name))
		if (!known) return undefined
		if (slots[slot] !== undefined && slots[slot] !== name) return undefined
		slots[slot] = name
	}
	return slots
}

/** The kind `--kind` forces, its slots from the subject, or the refusal naming the slot the subject cannot fill. */
function forcedKind(params: { question: string; subject: AskSubject; kind: AskKind }): KindAnswer {
	const { question, subject, kind } = params
	const first = subject.tags[0]
	const tagSlots: KindSlots =
		first === undefined
			? {}
			: first.parent === null
				? { tag: first.tag }
				: { tag: first.tag, parent: first.parent }
	const attribute = subject.attributes[0]
	const attributeSlots: KindSlots = attribute === undefined ? {} : { attribute }
	const values = { kind }
	switch (KIND_SLOT_NEEDS[kind]) {
		case 'tag':
			if (first === undefined)
				return { refused: fillMessage({ template: ASK_REFUSALS.kindNeedsTag, values }) }
			return { kind, slots: tagSlots }
		case 'attribute':
			if (attribute === undefined)
				return { refused: fillMessage({ template: ASK_REFUSALS.kindNeedsAttribute, values }) }
			return { kind, slots: { ...tagSlots, ...attributeSlots } }
		case 'tagOrAttribute':
			if (first === undefined && attribute === undefined)
				return {
					refused: fillMessage({ template: ASK_REFUSALS.kindNeedsTagOrAttribute, values }),
				}
			return { kind, slots: { ...tagSlots, ...attributeSlots } }
		case 'code':
			if (subject.codes[0] === undefined)
				return { refused: fillMessage({ template: ASK_REFUSALS.kindNeedsCode, values }) }
			return { kind, slots: { code: subject.codes[0] } }
		case 'rest':
			return { kind, slots: { rest: question.trim().replace(QUESTION_END_PATTERN, '') } }
		case 'nothing':
			return { kind, slots: {} }
	}
}
