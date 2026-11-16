/**
 * The length rules of a test-shaped Dialecte-change file: `inline-document-long` on the case documents it writes,
 * `test-file-long` on the file itself and `fixture-file-long` on the fixture files it reads.
 */
import {
	FIXTURE_FILE_LONG_MESSAGE,
	FIXTURE_FILE_MAX_LINES,
	INLINE_DOCUMENT_LONG_MESSAGE,
	INLINE_DOCUMENT_MAX_LINES,
	NOT_GROWN_SUFFIX,
	TEST_FILE_LONG_MESSAGE,
	TEST_FILE_MAX_LINES,
} from './check-length-rules.constants.ts'
import { positionOf } from './syntax-nodes.ts'

import type { RuleName } from './check-code-rules.types.ts'
import type { QualityFinding } from './check-quality-rules.types.ts'
import type { CaseDocument } from './xml-literals.types.ts'
import type ts from 'typescript'

/** The `test-file-long` finding of a test file over the limit, judged against its length at the base. */
export function checkTestFileLength(params: {
	file: string
	lineCount: number
	baseLineCount: number | undefined
}): QualityFinding | undefined {
	return fileLengthFindingOf({
		...params,
		rule: 'test-file-long',
		limit: TEST_FILE_MAX_LINES,
		message: TEST_FILE_LONG_MESSAGE,
	})
}

/** The `fixture-file-long` finding of a fixture file over the limit, judged against its length at the base. */
export function checkFixtureFileLength(params: {
	file: string
	lineCount: number
	baseLineCount: number | undefined
}): QualityFinding | undefined {
	return fileLengthFindingOf({
		...params,
		rule: 'fixture-file-long',
		limit: FIXTURE_FILE_MAX_LINES,
		message: FIXTURE_FILE_LONG_MESSAGE,
	})
}

/** How many lines a file's text holds: every line, the empty one after a final newline left out. */
export function lineCountOf(text: string): number {
	const lines = text.split('\n')
	return text.endsWith('\n') ? lines.length - 1 : lines.length
}

/**
 * One `inline-document-long` error per XML literal a case document is written as (inline, or the file-level const it
 * names) spanning more than the limit from its first to its last non-blank line: at the const, else at the literal.
 */
export function checkInlineDocumentLength(params: {
	documents: readonly CaseDocument[]
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { sourceFile } = params
	const seen = new Set<ts.Node>()
	const findings: QualityFinding[] = []
	for (const { literal, constant } of params.documents) {
		if (literal === undefined || seen.has(literal)) continue
		seen.add(literal)
		const count = documentLineCountOf({ literal, sourceFile })
		if (count <= INLINE_DOCUMENT_MAX_LINES) continue
		findings.push({
			...positionOf({ node: constant ?? literal, sourceFile }),
			rule: 'inline-document-long',
			severity: 'error',
			message: INLINE_DOCUMENT_LONG_MESSAGE.replace('{count}', String(count)),
		})
	}
	return findings
}

/**
 * Without a base, or a file the base does not hold or holds shorter: an error over the limit. A file over the limit
 * at the base and not grown: a warning that says so.
 */
function fileLengthFindingOf(params: {
	lineCount: number
	baseLineCount: number | undefined
	rule: RuleName
	limit: number
	message: string
}): QualityFinding | undefined {
	const { lineCount, baseLineCount } = params
	if (lineCount <= params.limit) return undefined
	const message = params.message.replace('{count}', String(lineCount))
	const notGrown =
		baseLineCount !== undefined && baseLineCount > params.limit && lineCount <= baseLineCount
	return {
		line: 1,
		column: 1,
		rule: params.rule,
		severity: notGrown ? 'warning' : 'error',
		message: notGrown ? `${message}${NOT_GROWN_SUFFIX}` : message,
	}
}

/** The lines of a literal's text between its quotes, from its first to its last non-blank line. */
function documentLineCountOf(params: {
	literal: ts.Expression
	sourceFile: ts.SourceFile
}): number {
	const lines = params.literal.getText(params.sourceFile).slice(1, -1).split('\n')
	const first = lines.findIndex(isWritten)
	if (first === -1) return 0
	const last = lines.length - 1 - [...lines].reverse().findIndex(isWritten)
	return last - first + 1
}

function isWritten(line: string): boolean {
	return line.trim() !== ''
}
