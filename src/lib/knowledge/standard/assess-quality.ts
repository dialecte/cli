import {
	GOOD_NOISE_RATIO_LIMIT,
	POOR_NOISE_RATIO_LIMIT,
	QUALITY_BLOCK_LINES,
} from './standard-index.constants.ts'

import type {
	StandardBlockVerdict,
	StandardClassifiedLine,
	StandardFileVerdict,
	StandardQuality,
	StandardQualityBlock,
	StandardRepeatedLine,
} from './standard-index.types.ts'

/**
 * The quality of a file: per block of original lines, the share of lines dropped as noise and its
 * verdict; the file is good when every block is, unreadable when every block is, else partial. Counts
 * the readable lines (neither blank nor dropped), the dropped ones and the heading candidates.
 */
export function assessQuality(params: {
	lines: StandardClassifiedLine[]
	noise: boolean[]
	candidates: number
	kept: number
	repeatedLines: StandardRepeatedLine[]
}): StandardQuality {
	const { lines, noise, candidates, kept, repeatedLines } = params
	const blocks: StandardQualityBlock[] = []
	for (let start = 0; start < lines.length; start += QUALITY_BLOCK_LINES)
		blocks.push(blockOf({ noise, start, end: Math.min(start + QUALITY_BLOCK_LINES, lines.length) }))
	const droppedLines = noise.filter(Boolean).length
	const blankLines = lines.filter((line) => line.kind === 'blank').length
	return {
		blocks,
		verdict: fileVerdictOf(blocks),
		readableLines: lines.length - blankLines - droppedLines,
		droppedLines,
		headingCandidatesKept: kept,
		headingCandidatesTurnedProse: candidates - kept,
		repeatedLines,
	}
}

function blockOf(params: { noise: boolean[]; start: number; end: number }): StandardQualityBlock {
	const { noise, start, end } = params
	const lines = end - start
	const dropped = noise.slice(start, end).filter(Boolean).length
	const noiseRatio = dropped / lines
	return {
		from: start + 1,
		to: end,
		lines,
		dropped,
		noiseRatio,
		verdict: blockVerdictOf(noiseRatio),
	}
}

function blockVerdictOf(noiseRatio: number): StandardBlockVerdict {
	if (noiseRatio < GOOD_NOISE_RATIO_LIMIT) return 'good'
	if (noiseRatio < POOR_NOISE_RATIO_LIMIT) return 'poor'
	return 'unreadable'
}

function fileVerdictOf(blocks: StandardQualityBlock[]): StandardFileVerdict {
	if (blocks.every((block) => block.verdict === 'good')) return 'good'
	if (blocks.every((block) => block.verdict === 'unreadable')) return 'unreadable'
	return 'partial'
}
