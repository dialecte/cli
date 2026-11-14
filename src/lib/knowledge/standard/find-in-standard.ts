import { bestWindowOf } from './best-window-of.ts'
import { capSliceRange } from './cap-slice-range.ts'
import { queryTermsOf } from './query-terms-of.ts'
import { roundScore } from './round-score.ts'
import { scoreUnits } from './score-units.ts'
import { DEFAULT_FIND_LIMIT } from './standard-search.constants.ts'

import type { StandardFileIndex, StandardOriginalRange } from './standard-index.types.ts'
import type {
	FindInStandardParams,
	StandardLineRange,
	StandardQueryTerm,
	StandardRankedSlice,
	StandardSearched,
	StandardSlice,
	StandardUnit,
	StandardUnitScore,
} from './standard-search.types.ts'

/**
 * Finds the slices of the standards that answer a query: one ranking of the units of every standard by
 * score (rounded), then file id, then first line; the first `limit` are the direct slices. Then, for
 * each direct slice in rank order, each resolved cross-reference inside it gives the slice of its target
 * unit (from its heading or caption, capped), once per unit, at most `limit` of them, after every direct
 * one. Pure, over search indexes already built.
 *
 * @intent find the passages of a standard that answer a question, search the standard text
 */
export function findInStandard(params: FindInStandardParams): StandardSlice[] {
	const { indexes, query, about } = params
	const limit = params.limit ?? DEFAULT_FIND_LIMIT
	const names = new Set(
		indexes.flatMap((index) => [
			...index.vocabulary.tags,
			...index.vocabulary.attributes,
			...index.vocabulary.values,
		]),
	)
	const terms = queryTermsOf({ query, about, names })
	if (terms.length === 0) return []
	const standards = indexes.map((index): StandardSearched => ({
		index,
		lines: index.files.flatMap((file) => file.logicalLines),
		noiseRanges: new Map(index.files.map((file) => [file.fileId, file.noiseRanges])),
	}))
	const direct = standards
		.flatMap((searched, standard) =>
			scoreUnits({ index: searched.index, terms }).map((score) => ({
				slice: directSliceOf({ searched, score, terms }),
				standard,
				unit: score.unit,
			})),
		)
		.sort(compareRanked)
		.slice(0, limit)
	const linked = linkedSlicesOf({ standards, direct, limit })
	return [...direct, ...linked].map((ranked) => ranked.slice)
}

function directSliceOf(params: {
	searched: StandardSearched
	score: StandardUnitScore
	terms: StandardQueryTerm[]
}): StandardSlice {
	const { searched, score, terms } = params
	const unit = searched.index.units[score.unit]
	const noiseRanges = searched.noiseRanges.get(unit.fileId) ?? []
	const window = bestWindowOf({
		lines: searched.lines,
		noiseRanges,
		contributions: score.contributions,
		titleLine: unit.titleLine,
	})
	const range = window
		? capSliceRange({
				lines: searched.lines,
				noiseRanges,
				...hitSliceBounds({ searched, noiseRanges, score, unit, window }),
			})
		: // a unit hit only in its heading title or caption: the slice runs through its body, so it cites text
			capSliceRange({
				lines: searched.lines,
				noiseRanges,
				first: unit.firstLine,
				last: unit.lastLine,
				windowFirst: unit.firstLine,
			})
	return {
		file: unit.fileId,
		from: searched.lines[range.first].from,
		to: searched.lines[range.last].to,
		clause: unit.clause,
		title: unit.title,
		score: roundScore(score.score),
		terms: terms.filter((_term, index) => score.termsHit[index]).map((term) => term.typed),
		linked: false,
	}
}

/**
 * Where the slice of a unit hit in its body runs before the cap: from the first hit of its best window
 * (a table from its caption or first row when the window ends within the slice's line count from it) to
 * the unit's last hit.
 */
function hitSliceBounds(params: {
	searched: StandardSearched
	noiseRanges: StandardOriginalRange[]
	score: StandardUnitScore
	unit: StandardUnit
	window: StandardLineRange
}): { first: number; last: number; windowFirst: number } {
	const { searched, noiseRanges, score, unit, window } = params
	const last = score.hitLines.reduce((latest, line) => Math.max(latest, line), window.last)
	const fromCaption =
		unit.kind === 'table' &&
		capSliceRange({
			lines: searched.lines,
			noiseRanges,
			first: unit.firstLine,
			last: window.last,
			windowFirst: unit.firstLine,
		}).last === window.last
	const first = fromCaption ? unit.firstLine : window.first
	return { first, last, windowFirst: first }
}

/** Score descending (as rounded), then file id, then first line. */
function compareRanked(left: StandardRankedSlice, right: StandardRankedSlice): number {
	if (left.slice.score !== right.slice.score) return right.slice.score - left.slice.score
	if (left.slice.file !== right.slice.file) return left.slice.file < right.slice.file ? -1 : 1
	return left.slice.from - right.slice.from
}

function linkedSlicesOf(params: {
	standards: StandardSearched[]
	direct: StandardRankedSlice[]
	limit: number
}): StandardRankedSlice[] {
	const { standards, direct, limit } = params
	const given = new Set(direct.map((ranked) => `${ranked.standard}:${ranked.unit}`))
	const targets = new Map<number, Map<string, number>>()
	const files = new Map<number, Map<string, StandardFileIndex>>()
	const linked: StandardRankedSlice[] = []
	for (const ranked of direct) {
		const searched = standards[ranked.standard]
		const file = filesOf({ files, searched, standard: ranked.standard }).get(ranked.slice.file)
		const unitOfTarget = targetsOf({ targets, searched, standard: ranked.standard })
		for (const reference of file?.crossReferences ?? []) {
			if (linked.length === limit) return linked
			if (!reference.resolved) continue
			if (reference.from < ranked.slice.from || reference.from > ranked.slice.to) continue
			const unit = unitOfTarget.get(`${ranked.slice.file}#${reference.target}`)
			if (unit === undefined || given.has(`${ranked.standard}:${unit}`)) continue
			given.add(`${ranked.standard}:${unit}`)
			linked.push({ slice: linkedSliceOf({ searched, unit }), standard: ranked.standard, unit })
		}
	}
	return linked
}

/** A target unit's slice: from its heading or caption, its whole range capped. */
function linkedSliceOf(params: { searched: StandardSearched; unit: number }): StandardSlice {
	const { searched } = params
	const unit = searched.index.units[params.unit]
	const range = capSliceRange({
		lines: searched.lines,
		noiseRanges: searched.noiseRanges.get(unit.fileId) ?? [],
		first: unit.firstLine,
		last: unit.lastLine,
		windowFirst: unit.firstLine,
	})
	return {
		file: unit.fileId,
		from: searched.lines[range.first].from,
		to: searched.lines[range.last].to,
		clause: unit.clause,
		title: unit.title,
		score: 0,
		terms: [],
		linked: true,
	}
}

/** The unit each cross-reference target of a standard names (`<file id>#<target>`), the first one. */
function targetsOf(params: {
	targets: Map<number, Map<string, number>>
	searched: StandardSearched
	standard: number
}): Map<string, number> {
	const known = params.targets.get(params.standard)
	if (known) return known
	const unitOfTarget = new Map<string, number>()
	for (const [index, unit] of params.searched.index.units.entries()) {
		if (unit.target === null) continue
		const key = `${unit.fileId}#${unit.target}`
		if (!unitOfTarget.has(key)) unitOfTarget.set(key, index)
	}
	params.targets.set(params.standard, unitOfTarget)
	return unitOfTarget
}

function filesOf(params: {
	files: Map<number, Map<string, StandardFileIndex>>
	searched: StandardSearched
	standard: number
}): Map<string, StandardFileIndex> {
	const known = params.files.get(params.standard)
	if (known) return known
	const byId = new Map(params.searched.index.files.map((file) => [file.fileId, file]))
	params.files.set(params.standard, byId)
	return byId
}
