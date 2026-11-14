import { ANGLE_ADDITIONS_LIMIT, ANGLE_FAMILIES, SLICE_ID_PREFIX } from './ask.constants.ts'

import type { StandardSlice } from '../standard/standard-search.types.ts'
import type {
	AngleFamily,
	AngleSlices,
	AskSlice,
	GatheredSlice,
	MergeSlicesParams,
} from './ask.types.ts'

/**
 * Merges find's own list for the whole question with the slices found per angle (D27, D27b): find's list first and
 * whole (direct then linked, in find's order), each of its slices carrying the angles that also met it; then at most
 * `ANGLE_ADDITIONS_LIMIT` direct angle slices from a clause no slice of find's list covers, in D12b's family
 * round-robin order (each family's slices ranked by score, then file and line; round n takes each family's n-th, the
 * families in their order), a slice met again gathering the angle; then the angles' linked slices not already
 * listed, angle by angle, as each find returned them. A slice is its file, first and last line.
 */
export function mergeSlices(params: MergeSlicesParams): AskSlice[] {
	const { whole } = params
	const angles = [...params.perAngle].sort(
		(first, second) => familyRank(first.angle.family) - familyRank(second.angle.family),
	)
	const listed = new Map<string, GatheredSlice>()
	for (const slice of whole) listed.set(...gathered({ from: listed, entry: { slice, angles: [] } }))
	let additions = 0
	for (const { entry } of familiesOf({ angles })) {
		const key = identityOf({ slice: entry.slice })
		if (listed.has(key)) {
			listed.set(...gathered({ from: listed, entry }))
			continue
		}
		if (additions >= ANGLE_ADDITIONS_LIMIT || isCovered({ slice: entry.slice, whole })) continue
		listed.set(...gathered({ from: listed, entry }))
		additions += 1
	}
	for (const { angle, slices } of angles)
		for (const slice of slices)
			if (slice.linked)
				listed.set(...gathered({ from: listed, entry: { slice, angles: [angle.id] } }))
	return [...listed.values()].map(function askSliceOf(entry, index): AskSlice {
		const { slice } = entry
		return {
			id: `${SLICE_ID_PREFIX}${index + 1}`,
			file: slice.file,
			from: slice.from,
			to: slice.to,
			clause: slice.clause,
			angles: entry.angles,
			score: slice.score,
			linked: slice.linked,
		}
	})
}

/**
 * Whether a slice of find's list (direct or linked) covers an angle slice: one of the same file and the same clause,
 * or, for an angle slice with no clause, one of the same file whose lines overlap or touch its range.
 */
function isCovered(params: { slice: StandardSlice; whole: StandardSlice[] }): boolean {
	const { slice, whole } = params
	return whole.some(function covers(found): boolean {
		if (found.file !== slice.file) return false
		if (slice.clause === null) return found.from <= slice.to && slice.from <= found.to
		return found.clause === slice.clause
	})
}

/** The family-ordered rounds: each family's ranked direct slices, the n-th of every family before the next. */
function familiesOf(params: { angles: AngleSlices[] }): { entry: GatheredSlice }[] {
	const byFamily = new Map<AngleFamily, Map<string, GatheredSlice>>()
	for (const { angle, slices } of params.angles) {
		const family = byFamily.get(angle.family) ?? new Map<string, GatheredSlice>()
		byFamily.set(angle.family, family)
		for (const slice of slices)
			if (!slice.linked)
				family.set(...gathered({ from: family, entry: { slice, angles: [angle.id] } }))
	}
	const ranked = [...byFamily.values()].map((family) => [...family.values()].sort(compareGathered))
	const longest = Math.max(0, ...ranked.map((family) => family.length))
	const rounds: { entry: GatheredSlice }[] = []
	for (let round = 0; round < longest; round += 1)
		for (const family of ranked) {
			const entry = family[round]
			if (entry !== undefined) rounds.push({ entry })
		}
	return rounds
}

/**
 * A slice's identity and its gathered entry: the slice with its angles when the map does not hold it yet, else the
 * entry already there with the angles it did not carry added (the map itself is left as it is).
 */
function gathered(params: {
	from: Map<string, GatheredSlice>
	entry: GatheredSlice
}): [string, GatheredSlice] {
	const { from, entry } = params
	const key = identityOf({ slice: entry.slice })
	const known = from.get(key)
	if (known === undefined) return [key, { slice: entry.slice, angles: [...entry.angles] }]
	return [key, { slice: known.slice, angles: [...new Set([...known.angles, ...entry.angles])] }]
}

/** A slice's identity: its file, first and last line (two slices of one identity are one slice). */
export function identityOf(params: { slice: StandardSlice }): string {
	const { slice } = params
	return JSON.stringify([slice.file, slice.from, slice.to])
}

/** Score descending, then file id, then first line, then last line. */
function compareGathered(first: GatheredSlice, second: GatheredSlice): number {
	const left = first.slice
	const right = second.slice
	if (left.score !== right.score) return right.score - left.score
	if (left.file !== right.file) return left.file < right.file ? -1 : 1
	return left.from - right.from || left.to - right.to
}

/** A family's place in the family order. */
function familyRank(family: AngleFamily): number {
	return ANGLE_FAMILIES.indexOf(family)
}
