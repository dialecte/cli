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
		const fileUnits = fileUnitsOf({ file, offset })
		const base = units.length
		for (const unit of fileUnits.units) units.push(unit)
		for (const unit of fileUnits.lineUnits) lineUnits.push(unit === -1 ? -1 : base + unit)
		offset += file.logicalLines.length
	}
	return { units, lineUnits }
}

/**
 * The units of one file whose first logical line is the standard line `offset`, and the unit of each of
 * its logical lines, as indexes into the file's own units: its tables, its headings, then its front unit.
 */
function fileUnitsOf(params: { file: StandardFileIndex; offset: number }): StandardUnits {
	const { file, offset } = params
	const tables = tableUnitsOf({ file, offset })
	const units = [...tables.units, ...headingUnitsOf(file)]
	const headingUnits = new Map(
		file.headings.map((heading, index) => [heading.from, tables.units.length + index]),
	)
	const lineUnits: number[] = []
	let frontUnit = -1
	let currentUnit = -1
	for (const [index, line] of file.logicalLines.entries()) {
		const standardLine = offset + index
		const headingUnit = line.kind === 'heading' ? headingUnits.get(line.from) : undefined
		if (headingUnit !== undefined) {
			currentUnit = headingUnit
			units[headingUnit].titleLine = standardLine
		}
		const tableUnit = tables.unitOfLine.get(index)
		if (tableUnit !== undefined)
			units[tableUnit] = extendUnit({ unit: units[tableUnit], standardLine })
		else if (currentUnit === -1) {
			units.push(frontUnitOf({ file, line: line.from }))
			frontUnit = units.length - 1
			currentUnit = frontUnit
		}
		if (currentUnit !== -1)
			units[currentUnit] = extendUnit({ unit: units[currentUnit], standardLine })
		if (currentUnit !== -1 && currentUnit === frontUnit) units[frontUnit].to = line.to
		lineUnits.push(tableUnit ?? currentUnit)
	}
	return { units, lineUnits }
}

/** The clause unit of each heading of a file, in heading order, its lines not recorded yet. */
function headingUnitsOf(file: StandardFileIndex): StandardUnit[] {
	return file.headings.map((heading, index) => {
		const next = file.headings[index + 1]
		return {
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
		}
	})
}

/** The table units of a file, and the unit (an index into them) of each logical line they hold. */
function tableUnitsOf(params: { file: StandardFileIndex; offset: number }): {
	units: StandardUnit[]
	unitOfLine: Map<number, number>
} {
	const { file } = params
	const indexOfFrom = new Map(file.logicalLines.map((line, index) => [line.from, index]))
	const units: StandardUnit[] = []
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
	return { units, unitOfLine }
}

function frontUnitOf(params: { file: StandardFileIndex; line: number }): StandardUnit {
	return {
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
	}
}

/**
 * The unit with a logical line recorded within its range: its first one when it has none yet, its last
 * one so far. A clause's range holds its tables too, so its last line may be a table's.
 */
function extendUnit(params: { unit: StandardUnit; standardLine: number }): StandardUnit {
	const { unit, standardLine } = params
	return {
		...unit,
		firstLine: unit.firstLine === -1 ? standardLine : unit.firstLine,
		lastLine: standardLine,
	}
}
