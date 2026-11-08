import type { StandardHeading, StandardKeptCandidate } from './standard-index.types.ts'

/**
 * The heading records of the kept candidates, in file order. A heading runs to the line before the
 * next kept heading of the same depth or lower (any pass), else to the file's last line; its parent is
 * the nearest kept heading before it one level up in the same pass. Ids carry `~<pass>` from pass 2.
 */
export function readHeadings(params: {
	fileId: string
	kept: StandardKeptCandidate[]
	lineCount: number
}): StandardHeading[] {
	const { fileId, kept, lineCount } = params
	const ids = kept.map((candidate) => idOf({ fileId, candidate }))
	const lastIdAtDepth = new Map<string, string>()
	return kept.map((candidate, index) => {
		const parent = lastIdAtDepth.get(`${candidate.pass}:${candidate.depth - 1}`) ?? null
		lastIdAtDepth.set(`${candidate.pass}:${candidate.depth}`, ids[index])
		return {
			id: ids[index],
			number: candidate.number,
			title: candidate.title,
			from: candidate.line,
			to: endOf({ kept, index, lineCount }),
			depth: candidate.depth,
			parent,
			pass: candidate.pass,
		}
	})
}

function idOf(params: { fileId: string; candidate: StandardKeptCandidate }): string {
	const { fileId, candidate } = params
	const suffix = candidate.pass === 1 ? '' : `~${candidate.pass}`
	return `${fileId}#${candidate.number}${suffix}`
}

function endOf(params: {
	kept: StandardKeptCandidate[]
	index: number
	lineCount: number
}): number {
	const { kept, index, lineCount } = params
	const depth = kept[index].depth
	for (let next = index + 1; next < kept.length; next++)
		if (kept[next].depth <= depth) return kept[next].line - 1
	return lineCount
}
