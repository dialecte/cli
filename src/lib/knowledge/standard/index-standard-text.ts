import { assessQuality } from './assess-quality.ts'
import { classifyStandardLines } from './classify-standard-lines.ts'
import { findRepeatedLines } from './find-repeated-lines.ts'
import { joinLogicalLines } from './join-logical-lines.ts'
import { markNoiseLines } from './mark-noise-lines.ts'
import { readCrossReferences } from './read-cross-references.ts'
import { readDefinitions } from './read-definitions.ts'
import { readHeadings } from './read-headings.ts'
import { readTables } from './read-tables.ts'
import { selectHeadings } from './select-headings.ts'
import { LINE_BREAK_PATTERN } from './standard-index.constants.ts'

import type { StandardClassifiedLine, StandardFileIndex } from './standard-index.types.ts'

/**
 * Indexes the text of one standard file, pure: classify each original line, drop the one kind of
 * noise, keep the longest tree-consistent sequence of heading candidates (the others become prose),
 * join prose lines into logical lines, then read the headings, definitions, tables, cross-references
 * and the quality out of them. Every entry keeps its original line range.
 */
export function indexStandardText(params: { fileId: string; text: string }): StandardFileIndex {
	const { fileId } = params
	const originalLines = linesOf(params.text)
	const classified = classifyStandardLines({ lines: originalLines })
	const { dropped: noise, ranges: noiseRanges } = markNoiseLines({ lines: classified })
	const candidates = classified.flatMap((line) =>
		line.kind === 'heading' && line.candidate ? [line.candidate] : [],
	)
	const kept = selectHeadings({ candidates })
	const lines = settleLeftOutCandidates({
		lines: classified,
		keptLines: new Set(kept.map((candidate) => candidate.line)),
	})
	const logicalLines = joinLogicalLines({ lines, noise })
	const headings = readHeadings({ fileId, kept, lineCount: lines.length })
	const tables = readTables({ fileId, logicalLines, headings })
	return {
		fileId,
		lineCount: lines.length,
		logicalLines,
		noiseRanges,
		headings,
		definitions: readDefinitions({ lines, noise }),
		tables,
		crossReferences: readCrossReferences({ lines, noise, headings, tables }),
		quality: assessQuality({
			lines,
			noise,
			// the list items a heading style turned prose are counted as candidates turned prose
			candidates: candidates.length + classified.filter((line) => line.listItem).length,
			kept: kept.length,
			repeatedLines: findRepeatedLines({ lines: originalLines }),
		}),
	}
}

/** The original lines; a final line break adds no line, and an empty text has none. */
function linesOf(text: string): string[] {
	if (text.length === 0) return []
	const lines = text.split(LINE_BREAK_PATTERN)
	return lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines
}

/** A heading candidate the sequence leaves out is prose in every respect; it keeps its candidate. */
function settleLeftOutCandidates(params: {
	lines: StandardClassifiedLine[]
	keptLines: Set<number>
}): StandardClassifiedLine[] {
	return params.lines.map((line) =>
		line.kind === 'heading' && !params.keptLines.has(line.line) ? { ...line, kind: 'prose' } : line,
	)
}
