import {
	COMMON_WORD_SHARE,
	COMMON_WORD_WEIGHT_FACTOR,
	TITLE_HIT_FACTOR,
} from './standard-search.constants.ts'

import type {
	StandardQueryTerm,
	StandardSearchIndex,
	StandardTermHit,
	StandardUnitScore,
} from './standard-search.types.ts'

/**
 * The units of one standard the terms hit, with their scores: per term, its base score in the unit
 * divided by its frequency weight, times its factor, doubled when it hits the unit's heading title or
 * caption. The base is 1 per unit, for a word and a vocabulary name alike (a name's link strength does
 * not weigh). A term weighs `1 + ln(1 + n)`, n the logical lines holding it (a name: the lines it is
 * linked on), ten times that when it is in more than 5 % of the standard's logical lines. Units in no
 * particular order.
 */
export function scoreUnits(params: {
	index: StandardSearchIndex
	terms: StandardQueryTerm[]
}): StandardUnitScore[] {
	const { index, terms } = params
	const scores = new Map<number, StandardUnitScore>()
	for (const [termIndex, term] of terms.entries()) {
		const { hits, weight } =
			term.kind === 'word'
				? wordHits({ index, stem: term.key })
				: nameHits({ index, name: term.key })
		for (const hit of hits) {
			const titleLine = index.units[hit.unit].titleLine
			const titleFactor = titleLine !== null && hit.lines.includes(titleLine) ? TITLE_HIT_FACTOR : 1
			const score = scoreOf({ scores, unit: hit.unit, termCount: terms.length })
			const contribution = (titleFactor * term.factor) / weight
			score.score += contribution
			score.termsHit[termIndex] = true
			score.contributions.push({ term: termIndex, contribution, lines: hit.lines })
			for (const line of hit.lines) score.hitLines.push(line)
		}
	}
	return [...scores.values()]
}

function wordHits(params: { index: StandardSearchIndex; stem: string }): {
	hits: StandardTermHit[]
	weight: number
} {
	const { words, lineUnits } = params.index
	const lines = Object.hasOwn(words.stems, params.stem) ? words.stems[params.stem] : []
	const byUnit = new Map<number, StandardTermHit>()
	for (const line of lines) {
		const unit = lineUnits[line]
		const hit = byUnit.get(unit)
		if (hit) hit.lines.push(line)
		else byUnit.set(unit, { unit, lines: [line] })
	}
	return {
		hits: [...byUnit.values()],
		weight: frequencyWeight({ lineCount: lines.length, logicalLineCount: words.logicalLineCount }),
	}
}

/** A name's hits: base 1 per unit it links (its link strength does not weigh), weighted by its lines as a word. */
function nameHits(params: { index: StandardSearchIndex; name: string }): {
	hits: StandardTermHit[]
	weight: number
} {
	const { tagLinks, words } = params.index
	const links = Object.hasOwn(tagLinks, params.name) ? tagLinks[params.name] : []
	const lineCount = links.reduce((count, link) => count + link.lines.length, 0)
	return {
		hits: links.map((link) => ({ unit: link.unit, lines: link.lines })),
		weight: frequencyWeight({ lineCount, logicalLineCount: words.logicalLineCount }),
	}
}

/**
 * The weight of a term held by `lineCount` logical lines: `1 + ln(1 + n)`, ten times that when it is in
 * more than 5 % of the standard's logical lines.
 */
function frequencyWeight(params: { lineCount: number; logicalLineCount: number }): number {
	const { lineCount, logicalLineCount } = params
	const common = lineCount > COMMON_WORD_SHARE * logicalLineCount
	return (1 + Math.log(1 + lineCount)) * (common ? COMMON_WORD_WEIGHT_FACTOR : 1)
}

function scoreOf(params: {
	scores: Map<number, StandardUnitScore>
	unit: number
	termCount: number
}): StandardUnitScore {
	const { scores, unit, termCount } = params
	let score = scores.get(unit)
	if (!score) {
		score = {
			unit,
			score: 0,
			termsHit: Array.from({ length: termCount }, () => false),
			hitLines: [],
			contributions: [],
		}
		scores.set(unit, score)
	}
	return score
}
