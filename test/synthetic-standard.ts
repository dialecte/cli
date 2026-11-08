/**
 * Builds the markdown text of a synthetic standard from a short description: invented prose that names
 * the core test dialecte's tags and attributes, headings, definitions, tables, captions, runs of
 * one-character lines, repeated lines, letter-spaced lines, fences. Every citation-shaped string is
 * assembled from parts at run time (`CITATION_WORDS`), so the code rules pass on this file and its users.
 */
import {
	CITATION_WORDS,
	DOT_LEADER,
	LETTER_SPACED_WORD_SEPARATOR,
	SYNTHETIC_ATTRIBUTES,
	SYNTHETIC_TAGS,
	TABLE_SEPARATOR_CELL,
} from './synthetic-standard.constants.ts'

import type { CitationWord, SyntheticBlock } from './synthetic-standard.types.ts'

export function buildSyntheticStandard(params: { blocks: SyntheticBlock[] }): string {
	const fillerCounter = { next: 1 }
	return params.blocks.flatMap((block) => linesOfBlock({ block, fillerCounter })).join('\n')
}

/** `<word> <number>`: the citation shape, assembled at run time from the word and the number. */
export function citationOf(params: { word: CitationWord; number: string }): string {
	return [CITATION_WORDS[params.word], params.number].join(' ')
}

/** A caption line: the word, the number, then the separator and title when given. */
export function captionLine(params: {
	word: 'table' | 'figure'
	number: string
	title?: string
	separator?: string
}): string {
	const citation = citationOf({ word: params.word, number: params.number })
	return params.title === undefined
		? citation
		: `${citation}${params.separator ?? ' - '}${params.title}`
}

/** The letters a one-character run is made of: `a`, `b`, ... cycling after `z`. */
export function oneCharacterLines(count: number): string[] {
	return Array.from({ length: count }, (_unused, index) => String.fromCharCode(97 + (index % 26)))
}

/** `occurrences - 1` gaps of the same length, for a `repeated` block. */
export function evenGaps(params: { occurrences: number; gap: number }): number[] {
	return Array.from({ length: params.occurrences - 1 }, () => params.gap)
}

/** A word with a space between its letters; words separated by two spaces, as a bad conversion leaves it. */
export function letterSpaced(text: string): string {
	return text
		.split(' ')
		.map((word) => word.split('').join(' '))
		.join(LETTER_SPACED_WORD_SEPARATOR)
}

function linesOfBlock(params: {
	block: SyntheticBlock
	fillerCounter: { next: number }
}): string[] {
	const { block, fillerCounter } = params
	switch (block.kind) {
		case 'blank':
			return Array.from({ length: block.count ?? 1 }, () => '')
		case 'raw':
			return block.lines
		case 'heading':
			return [`${block.marker ?? ''}${block.number}  ${block.title}`]
		case 'annexHeading':
			return [annexHeadingLine(block)]
		case 'definition':
			return block.layout === 'inline'
				? [`${block.number}  ${block.term}`]
				: [block.number, block.term]
		case 'caption':
			return [captionLine(block)]
		case 'table':
			return tableLines(block)
		case 'tocEntry':
			return [`${block.number}  ${block.title} ${DOT_LEADER} ${block.page}`]
		case 'oneCharacterRun':
			return oneCharacterLines(block.count)
		case 'filler':
			return fillerLines({ count: block.count, fillerCounter })
		case 'letterSpaced':
			return [letterSpaced(block.text)]
		case 'fence':
			return ['```', ...block.lines, '```']
		case 'repeated':
			return repeatedLines({ block, fillerCounter })
	}
}

function annexHeadingLine(block: {
	letter: string
	title: string
	qualifier?: { text: string; position: 'before' | 'after' }
}): string {
	const start = `${CITATION_WORDS.annex} ${block.letter}`
	if (!block.qualifier) return `${start}  ${block.title}`
	const qualifier = `(${block.qualifier.text})`
	return block.qualifier.position === 'before'
		? `${start} ${qualifier} ${block.title}`
		: `${start}  ${block.title} ${qualifier}`
}

function tableLines(block: {
	columns: string[]
	rows: string[][]
	withSeparator?: boolean
}): string[] {
	const separator = `|${block.columns.map(() => TABLE_SEPARATOR_CELL).join('|')}|`
	return [
		rowLine(block.columns),
		...(block.withSeparator === false ? [] : [separator]),
		...block.rows.map(rowLine),
	]
}

function rowLine(cells: string[]): string {
	return `| ${cells.join(' | ')} |`
}

/** Unique invented sentences naming a tag and an attribute of the test dialecte. */
function fillerLines(params: { count: number; fillerCounter: { next: number } }): string[] {
	return Array.from({ length: params.count }, () => {
		const sequence = params.fillerCounter.next++
		const tag = SYNTHETIC_TAGS[sequence % SYNTHETIC_TAGS.length]
		const attribute = SYNTHETIC_ATTRIBUTES[sequence % SYNTHETIC_ATTRIBUTES.length]
		return `Passage ${sequence} covers element ${tag} with attribute ${attribute}.`
	})
}

function repeatedLines(params: {
	block: Extract<SyntheticBlock, { kind: 'repeated' }>
	fillerCounter: { next: number }
}): string[] {
	const { block, fillerCounter } = params
	const lines = block.isolated ? ['', block.line] : [block.line]
	for (const gap of block.gaps) {
		const between = block.isolated
			? ['', ...fillerLines({ count: gap - 3, fillerCounter }), '']
			: fillerLines({ count: gap - 1, fillerCounter })
		lines.push(...between, block.line)
	}
	if (block.isolated) lines.push('')
	return lines
}
