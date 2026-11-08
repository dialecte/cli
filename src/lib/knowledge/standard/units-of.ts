import { findCaptionAbove } from './find-caption-above.ts'
import { TABLE_TARGET_PREFIX } from './standard-index.constants.ts'

import type { StandardFileIndex } from './standard-index.types.ts'
import type { StandardUnit, StandardUnits, UnitsOfParams } from './standard-search.types.ts'

/**
 * The units find scores, over the files of a standard in order: per file, the lines before its first
 * kept heading (when any), each kept heading's own lines (from the heading to the line before the next
 * kept heading, so a clause with child clauses gives its intro lines), and each table with its caption.
 * A table and its caption belong to the table's unit only. Every logical line belongs to one unit.
 */
export function unitsOf(params: UnitsOfParams): StandardUnits {
	const units: StandardUnit[] = []
	const lineUnits: number[] = []
	let offset = 0
	for (const file of params.files) {
		addFileUnits({ file, offset, units, lineUnits })
		offset += file.logicalLines.length
	}
	return { units, lineUnits }
}

/** Adds the units of one file whose first logical line is the standard line `offset`. */
function addFileUnits(params: {
	file: StandardFileIndex
	offset: number
	units: StandardUnit[]
	lineUnits: number[]
}): void {
	const { file, offset, units, lineUnits } = params
	const tableUnitOfLine = addTableUnits({ file, offset, units })
	const headingUnits = new Map<number, number>()
	for (const [index, heading] of file.headings.entries()) {
		const next = file.headings[index + 1]
		headingUnits.set(heading.from, units.length)
		units.push({
			fileId: file.fileId,
			kind: 'clause',
			clause: heading.number,
			title: heading.title,
			target: heading.number,
			from: heading.from,
			to: next ? next.from - 1 : file.lineCount,
			firstLine: -1,
			lastLine: -1,
			titleLine: null,
		})
	}
	let frontUnit = -1
	let currentUnit = -1
	for (const [index, line] of file.logicalLines.entries()) {
		const standardLine = offset + index
		const headingUnit = line.kind === 'heading' ? headingUnits.get(line.from) : undefined
		if (headingUnit !== undefined) {
			currentUnit = headingUnit
			units[headingUnit].titleLine = standardLine
		}
		const tableUnit = tableUnitOfLine.get(index)
		if (tableUnit !== undefined) extendUnit({ unit: units[tableUnit], standardLine })
		else if (currentUnit === -1) {
			frontUnit = addFrontUnit({ file, line: line.from, units })
			currentUnit = frontUnit
		}
		if (currentUnit !== -1) extendUnit({ unit: units[currentUnit], standardLine })
		if (currentUnit !== -1 && currentUnit === frontUnit) units[frontUnit].to = line.to
		lineUnits.push(tableUnit ?? currentUnit)
	}
}

/** The table units of a file, added to `units`; returns the unit of each logical line they hold. */
function addTableUnits(params: {
	file: StandardFileIndex
	offset: number
	units: StandardUnit[]
}): Map<number, number> {
	const { file, units } = params
	const indexOfFrom = new Map(file.logicalLines.map((line, index) => [line.from, index]))
	const unitOfLine = new Map<number, number>()
	for (const table of file.tables) {
		const start = indexOfFrom.get(table.from)
		if (start === undefined) continue
		const caption = findCaptionAbove({ logicalLines: file.logicalLines, start })
		const unit = units.length
		units.push({
			fileId: file.fileId,
			kind: 'table',
			clause: table.clause,
			title: table.caption,
			target: table.number === null ? null : TABLE_TARGET_PREFIX + table.number,
			from: file.logicalLines[caption ?? start].from,
			to: table.to,
			firstLine: -1,
			lastLine: -1,
			titleLine: caption === null ? null : params.offset + caption,
		})
		if (caption !== null) unitOfLine.set(caption, unit)
		for (let index = start; index < file.logicalLines.length; index++) {
			if (file.logicalLines[index].from > table.to) break
			unitOfLine.set(index, unit)
		}
	}
	return unitOfLine
}

function addFrontUnit(params: {
	file: StandardFileIndex
	line: number
	units: StandardUnit[]
}): number {
	params.units.push({
		fileId: params.file.fileId,
		kind: 'front',
		clause: null,
		title: null,
		target: null,
		from: params.line,
		to: params.line,
		firstLine: -1,
		lastLine: -1,
		titleLine: null,
	})
	return params.units.length - 1
}

/**
 * Records a logical line within the unit's range: its first one when it has none yet, its last one so
 * far. A clause's range holds its tables too, so its last line may be a table's.
 */
function extendUnit(params: { unit: StandardUnit; standardLine: number }): void {
	const { unit, standardLine } = params
	if (unit.firstLine === -1) unit.firstLine = standardLine
	unit.lastLine = standardLine
}
