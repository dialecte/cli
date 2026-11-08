import { cellsOfRow } from './cells-of-row.ts'
import { TABLE_SEPARATOR_ROW_PATTERN } from './standard-index.constants.ts'
import {
	ATTRIBUTE_AT_SIGN,
	ATTRIBUTE_EQUAL_SIGN,
	LINK_STRENGTHS,
	SHORT_ATTRIBUTE_LENGTH,
	WORD_TOKEN_PATTERN,
} from './standard-search.constants.ts'

import type { StandardFileIndex, StandardLogicalLine } from './standard-index.types.ts'
import type {
	StandardNameRule,
	StandardTagLink,
	StandardTagLinks,
	StandardUnit,
	TagLinksOfParams,
} from './standard-search.types.ts'

/**
 * The tag links of a standard: every tag, attribute and enumeration value of the vocabulary, case kept,
 * linked to the units naming it word-bounded (`LN` never inside `LNode`). The strength of a hit is by where
 * it is: the heading title or the caption of the unit, a definition term, a table cell, other text. An
 * attribute name shorter than three characters links only as `@name`, `name=` or a table cell equal to it,
 * an enumeration value shorter than three characters only as a table cell equal to it. Per
 * name and unit the strongest hit counts; the lines of every hit are kept for the slice.
 */
export function tagLinksOf(params: TagLinksOfParams): StandardTagLinks {
	const { files, units, lineUnits, vocabulary } = params
	const rules = rulesOf(vocabulary)
	if (rules.size === 0) return {}
	const otherNames = [...rules.keys()].filter((name) => !isWholeWord(name))
	const found = new Map<string, Map<number, StandardTagLink>>()
	const definitionTerms = definitionTermLinesOf({ files })
	const lines = files.flatMap((file) => file.logicalLines)
	for (const [standardLine, line] of lines.entries()) {
		const unit = lineUnits[standardLine]
		const strength = strengthOf({
			line,
			unit: units[unit],
			standardLine,
			definitionTerms,
		})
		for (const name of namesOfLine({ line, rules, otherNames }))
			record({ found, name, unit, strength, standardLine })
	}
	const links: StandardTagLinks = Object.create(null)
	for (const [name, byUnit] of found) links[name] = [...byUnit.values()]
	return links
}

/**
 * Each name of the vocabulary and its rule; a name both a tag and an attribute links as a tag, a name both an
 * attribute and an enumeration value as an attribute.
 */
function rulesOf(vocabulary: TagLinksOfParams['vocabulary']): Map<string, StandardNameRule> {
	const rules = new Map<string, StandardNameRule>()
	for (const value of vocabulary.values)
		rules.set(value, value.length < SHORT_ATTRIBUTE_LENGTH ? 'cellOnly' : 'anywhere')
	for (const attribute of vocabulary.attributes)
		rules.set(attribute, attribute.length < SHORT_ATTRIBUTE_LENGTH ? 'attributeForms' : 'anywhere')
	for (const tag of vocabulary.tags) rules.set(tag, 'anywhere')
	return rules
}

/**
 * The standard lines holding a definition's term: the definition line when the term is written on it,
 * else the line after it.
 */
function definitionTermLinesOf(params: { files: StandardFileIndex[] }): Set<number> {
	const termLines = new Set<number>()
	let offset = 0
	for (const file of params.files) {
		const indexOfFrom = new Map(file.logicalLines.map((line, index) => [line.from, index]))
		for (const definition of file.definitions) {
			const index = indexOfFrom.get(definition.from)
			if (index === undefined) continue
			const onItsLine = file.logicalLines[index].text.includes(definition.term)
			termLines.add(offset + (onItsLine ? index : index + 1))
		}
		offset += file.logicalLines.length
	}
	return termLines
}

function strengthOf(params: {
	line: StandardLogicalLine
	unit: StandardUnit
	standardLine: number
	definitionTerms: Set<number>
}): number {
	const { line, unit, standardLine, definitionTerms } = params
	if (unit.titleLine === standardLine)
		return unit.kind === 'table' ? LINK_STRENGTHS.caption : LINK_STRENGTHS.heading
	if (definitionTerms.has(standardLine)) return LINK_STRENGTHS.definition
	if (line.kind === 'table') return LINK_STRENGTHS.cell
	return LINK_STRENGTHS.text
}

/**
 * The vocabulary names a logical line names. A word-bounded name is a whole word of the line (its
 * letters, digits and underscores); a name with other characters is looked for with the same bounds.
 */
function namesOfLine(params: {
	line: StandardLogicalLine
	rules: Map<string, StandardNameRule>
	otherNames: string[]
}): Set<string> {
	const { line, rules, otherNames } = params
	const names = new Set<string>()
	const text = line.text
	for (const match of text.matchAll(WORD_TOKEN_PATTERN)) {
		const name = match[0]
		const rule = rules.get(name)
		if (rule === undefined || rule === 'cellOnly') continue
		if (rule === 'anywhere' || inAttributeForm({ text, start: match.index, name })) names.add(name)
	}
	for (const name of otherNames)
		if (rules.get(name) === 'anywhere' && containsBounded({ text, name })) names.add(name)
	if (line.kind === 'table' && !TABLE_SEPARATOR_ROW_PATTERN.test(text))
		for (const cell of cellsOfRow(text)) if (rules.has(cell)) names.add(cell)
	return names
}

function inAttributeForm(params: { text: string; start: number; name: string }): boolean {
	const { text, start, name } = params
	return (
		text.charAt(start - 1) === ATTRIBUTE_AT_SIGN ||
		text.charAt(start + name.length) === ATTRIBUTE_EQUAL_SIGN
	)
}

/** A name made of word characters only: it is found as a whole word of a line. */
function isWholeWord(name: string): boolean {
	const match = name.match(WORD_TOKEN_PATTERN)
	return match?.length === 1 && match[0] === name
}

/** The name in the text with no word character on either side. */
function containsBounded(params: { text: string; name: string }): boolean {
	const { text, name } = params
	let start = text.indexOf(name)
	while (start !== -1) {
		const before = text.charAt(start - 1)
		const after = text.charAt(start + name.length)
		if (!isWordCharacter(before) && !isWordCharacter(after)) return true
		start = text.indexOf(name, start + 1)
	}
	return false
}

function isWordCharacter(character: string): boolean {
	return character !== '' && isWholeWord(character)
}

function record(params: {
	found: Map<string, Map<number, StandardTagLink>>
	name: string
	unit: number
	strength: number
	standardLine: number
}): void {
	const { found, name, unit, strength, standardLine } = params
	let byUnit = found.get(name)
	if (!byUnit) {
		byUnit = new Map()
		found.set(name, byUnit)
	}
	const link = byUnit.get(unit)
	if (!link) byUnit.set(unit, { unit, strength, lines: [standardLine] })
	else {
		link.strength = Math.max(link.strength, strength)
		link.lines.push(standardLine)
	}
}
