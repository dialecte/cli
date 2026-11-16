import { ANGLE_FAMILIES, QUESTION_FAMILY } from './ask.constants.ts'

import type { AngleFamily, AskAngle, AskSlice, PackPoolOfParams, PoolSlice } from './ask.types.ts'

/**
 * The pool the readers draw from: the ask's list first, then the wider search's other slices (D3) in angle-family
 * order, then score, then file id and line (D31), the slices of an unreadable block dropped (D5), each with its
 * family (the first angle's; none: `question`, D4), its counted lines and its quality.
 */
export function packPoolOf(params: PackPoolOfParams): PoolSlice[] {
	const { listed, angles } = params
	const listedIds = new Set(listed.map((slice) => slice.id))
	const others = params.wider
		.filter((slice) => !listedIds.has(slice.id))
		.map((slice) => ({ slice, family: familyOf({ slice, angles }) }))
		.sort(compareWider)
	const ordered = [
		...listed.map((slice) => ({ slice, family: familyOf({ slice, angles }) })),
		...others,
	]
	const pool: PoolSlice[] = []
	for (const { slice, family } of ordered) {
		const quality = params.qualityOf({ slice })
		if (quality === 'unreadable') continue
		pool.push({ ...slice, family, counted: params.countedOf({ slice }), quality })
	}
	return pool
}

/** The family of the slice's first angle; `question` for a slice no listed angle found. */
function familyOf(params: { slice: AskSlice; angles: AskAngle[] }): AngleFamily {
	const [first] = params.slice.angles
	return params.angles.find((angle) => angle.id === first)?.family ?? QUESTION_FAMILY
}

/** Family order, then score descending, then file id, first line and last line. */
function compareWider(
	first: { slice: AskSlice; family: AngleFamily },
	second: { slice: AskSlice; family: AngleFamily },
): number {
	const byFamily = ANGLE_FAMILIES.indexOf(first.family) - ANGLE_FAMILIES.indexOf(second.family)
	if (byFamily !== 0) return byFamily
	const left = first.slice
	const right = second.slice
	if (left.score !== right.score) return right.score - left.score
	if (left.file !== right.file) return left.file < right.file ? -1 : 1
	return left.from - right.from || left.to - right.to
}
