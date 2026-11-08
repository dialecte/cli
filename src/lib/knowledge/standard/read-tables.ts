import { cellsOfRow } from './cells-of-row.ts'
import { findCaptionAbove } from './find-caption-above.ts'
import { holdingClause } from './holding-clause.ts'
import { parseCaption } from './parse-caption.ts'
import { TABLE_SEPARATOR_ROW_PATTERN } from './standard-index.constants.ts'

import type { StandardHeading, StandardLogicalLine, StandardTable } from './standard-index.types.ts'

/**
 * The tables of a file: runs of table lines on consecutive original lines, numbered in file order.
 * Columns are the cells of the first row that is not a separator row; the caption is the nearest table
 * caption within the lookback above the run, up to the table before it; the clause is the kept heading
 * holding it.
 */
export function readTables(params: {
	fileId: string
	logicalLines: StandardLogicalLine[]
	headings: StandardHeading[]
}): StandardTable[] {
	const { fileId, logicalLines, headings } = params
	const tables: StandardTable[] = []
	let start = -1
	for (const [index, line] of logicalLines.entries()) {
		if (line.kind !== 'table') continue
		if (start === -1) start = index
		const next = logicalLines[index + 1]
		if (next?.kind === 'table' && next.from === line.to + 1) continue
		tables.push(
			tableOf({
				fileId,
				logicalLines,
				headings,
				start,
				end: index,
				position: tables.length + 1,
			}),
		)
		start = -1
	}
	return tables
}

function tableOf(params: {
	fileId: string
	logicalLines: StandardLogicalLine[]
	headings: StandardHeading[]
	start: number
	end: number
	position: number
}): StandardTable {
	const { fileId, logicalLines, headings, start, end, position } = params
	const rows = logicalLines.slice(start, end + 1)
	const captionIndex = findCaptionAbove({ logicalLines, start })
	const caption = captionIndex === null ? null : logicalLines[captionIndex].text
	const header = rows.find((row) => !TABLE_SEPARATOR_ROW_PATTERN.test(row.text))
	return {
		id: `${fileId}#table-${position}`,
		caption,
		number: caption === null ? null : (parseCaption(caption)?.number ?? null),
		from: rows[0].from,
		to: rows[rows.length - 1].to,
		clause: holdingClause({ headings, line: rows[0].from }),
		columns: header ? cellsOfRow(header.text) : [],
	}
}
