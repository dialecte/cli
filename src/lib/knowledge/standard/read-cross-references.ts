import { holdingClause } from './holding-clause.ts'
import { normaliseText } from './normalise-text.ts'
import { CROSS_REFERENCE_PATTERN, TABLE_TARGET_PREFIX } from './standard-index.constants.ts'

import type {
	StandardClassifiedLine,
	StandardCrossReference,
	StandardHeading,
	StandardTable,
} from './standard-index.types.ts'

/**
 * The cross-references within one file, read line by line from prose, definition and table lines so
 * each keeps its original line: the clause or subclause word and a number, `see` and a dotted number, a
 * bare number of three parts or more in parentheses, the table word and a caption number, the annex word
 * and a letter. A reference is resolved when its target is a kept heading of the file, or a table whose
 * caption carries that number.
 */
export function readCrossReferences(params: {
	lines: StandardClassifiedLine[]
	noise: boolean[]
	headings: StandardHeading[]
	tables: StandardTable[]
}): StandardCrossReference[] {
	const { lines, noise, headings, tables } = params
	const headingNumbers = new Set(headings.map((heading) => heading.number))
	const tableTargets = new Set(
		tables.flatMap((table) => (table.number === null ? [] : [TABLE_TARGET_PREFIX + table.number])),
	)
	const references: StandardCrossReference[] = []
	for (const [index, line] of lines.entries()) {
		if (noise[index] || !isScanned(line)) continue
		for (const target of targetsOf(normaliseText(line.content)))
			references.push({
				from: line.line,
				inClause: holdingClause({ headings, line: line.line }),
				target,
				resolved: headingNumbers.has(target) || tableTargets.has(target),
			})
	}
	return references
}

function isScanned(line: StandardClassifiedLine): boolean {
	return line.kind === 'prose' || line.kind === 'definition' || line.kind === 'table'
}

function targetsOf(text: string): string[] {
	const targets: string[] = []
	for (const match of text.matchAll(CROSS_REFERENCE_PATTERN)) {
		const { clause, see, parenthesised, table, annex } = match.groups ?? {}
		if (table !== undefined) targets.push(TABLE_TARGET_PREFIX + table)
		else {
			const target = clause ?? see ?? parenthesised ?? annex
			if (target !== undefined) targets.push(target)
		}
	}
	return targets
}
