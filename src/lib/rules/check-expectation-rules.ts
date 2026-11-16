/**
 * The expectation rules of a test-shaped Dialecte-change file: `expected-fixture` (a fixture document compared with
 * a result) and `fixture-case-comment` (a case reading a `?raw` fixture says what matters in it).
 */
import { posix } from 'node:path'

import { commentRangesOf } from './allow-comments.ts'
import {
	EXPECTED_FIXTURE_MATCHERS,
	EXPECTED_FIXTURE_MESSAGE,
	FIXTURE_CASE_COMMENT_MESSAGE,
	XML_LITERAL_NAME,
} from './check-expectation-rules.constants.ts'
import { isXmlExportCall } from './check-test-shape-rules.ts'
import { expectCallOfMatcher, matcherCallsIn } from './expect-chains.ts'
import { awaitedOf, positionOf, unwrapped } from './syntax-nodes.ts'
import { declarationOf } from './test-shape-tables.ts'
import { isXmlLiteral, rawXmlImportBehind, rawXmlPathOf } from './xml-literals.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'
import type { TableCase, TestShape } from './check-test-shape-rules.types.ts'
import type { CaseDocument } from './xml-literals.types.ts'

/**
 * One `expected-fixture` error per comparison of the judged matchers with a fixture document on either side: a `?raw`
 * import (directly or through a const alias) whatever the other side, or an XML literal (directly or through a const)
 * compared with an export's result. At the fixture.
 */
export function checkExpectedFixtures(sourceFile: ts.SourceFile): QualityFinding[] {
	return matcherCallsIn({ node: sourceFile, matchers: EXPECTED_FIXTURE_MATCHERS }).flatMap((call) =>
		expectedFixtureFindingsOf({ call, sourceFile }),
	)
}

/**
 * One `fixture-case-comment` warning per table case whose document reads a `?raw` fixture (directly or through a
 * const alias) with no comment inside the case object nor on the line before its key: at the key.
 */
export function checkFixtureCaseComments(params: {
	sourceFile: ts.SourceFile
	shape: TestShape
	documents: readonly CaseDocument[]
}): QualityFinding[] {
	const { sourceFile } = params
	const cases = params.shape.tables.flatMap((table) => table.cases)
	const read = cases.flatMap((testCase) => {
		const fixture = fixtureReadBy({ testCase, documents: params.documents })
		return fixture === undefined ? [] : [{ testCase, fixture }]
	})
	if (read.length === 0) return []
	const comments = commentRangesOf({ sourceFile })
	return read
		.filter(({ testCase }) => !isCommented({ testCase, comments, sourceFile }))
		.map(({ testCase, fixture }) => ({
			...positionOf({ node: testCase.key, sourceFile }),
			rule: 'fixture-case-comment' as const,
			severity: 'warning' as const,
			message: FIXTURE_CASE_COMMENT_MESSAGE.replace('{path}', rawXmlPathOf(fixture)),
		}))
}

/**
 * The finding of one comparison: at the first side that is a fixture document (its expected side first). A `?raw`
 * import is one whatever the other side; an XML literal only when the other side is an export's result.
 */
function expectedFixtureFindingsOf(params: {
	call: ts.CallExpression
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { call, sourceFile } = params
	const actual = expectCallOfMatcher({ call, matchers: EXPECTED_FIXTURE_MATCHERS })
	const sides = [call.arguments.at(0), actual?.arguments.at(0)]
	for (const [index, side] of sides.entries()) {
		const fixture =
			side === undefined ? undefined : fixtureNameOf({ side, other: sides.at(1 - index) })
		if (side === undefined || fixture === undefined) continue
		return [
			{
				...positionOf({ node: side, sourceFile }),
				rule: 'expected-fixture',
				severity: 'error',
				message: EXPECTED_FIXTURE_MESSAGE.replace('{fixture}', fixture),
			},
		]
	}
	return []
}

/**
 * The name a comparison side gives as a fixture document: the `?raw` file's base name (directly or through a const
 * alias), or the XML literal's (directly or through a const) when the `other` side is an export's result.
 */
function fixtureNameOf(params: {
	side: ts.Expression
	other: ts.Expression | undefined
}): string | undefined {
	const { other } = params
	const value = unwrapped(params.side)
	if (ts.isIdentifier(value)) {
		const rawImport = rawXmlImportBehind(value)
		if (rawImport) return posix.basename(rawXmlPathOf(rawImport))
	}
	if (other === undefined || !isExportResult(other)) return undefined
	return isXmlLiteral(initializerBehind(value)) ? XML_LITERAL_NAME : undefined
}

/** Is the expression an export's result: an XML export call, or a binding assigned from one (`await` allowed)? */
function isExportResult(expression: ts.Expression): boolean {
	return isXmlExportCall(awaitedOf(initializerBehind(awaitedOf(expression))))
}

/** The value a name stands for when a const declares it with an initializer; any other expression as it is. */
function initializerBehind(expression: ts.Expression): ts.Expression {
	if (!ts.isIdentifier(expression)) return expression
	const declaration = declarationOf({ name: expression.text, from: expression })
	const initializer =
		declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined
	return initializer === undefined ? expression : unwrapped(initializer)
}

/** The `?raw` import the first document of the case reads, if one does. */
function fixtureReadBy(params: {
	testCase: TableCase
	documents: readonly CaseDocument[]
}): ts.ImportDeclaration | undefined {
	for (const document of params.documents) {
		if (document.caseNode !== params.testCase.value) continue
		const value = unwrapped(document.node)
		const fixture = ts.isIdentifier(value) ? rawXmlImportBehind(value) : undefined
		if (fixture) return fixture
	}
	return undefined
}

/**
 * Whether a comment covers the case: inside its value, trailing the line its value ends on, or leading it (ending on
 * the line before its key, or on the key's line before it). A comment trailing code on its line belongs to that code,
 * never to the case below it.
 */
function isCommented(params: {
	testCase: TableCase
	comments: readonly ts.CommentRange[]
	sourceFile: ts.SourceFile
}): boolean {
	const { testCase, sourceFile } = params
	const keyStart = testCase.key.getStart(sourceFile)
	const keyLine = lineOf({ position: keyStart, sourceFile })
	const valueStart = testCase.value.getStart(sourceFile)
	const valueEndLine = lineOf({ position: testCase.value.end, sourceFile })
	return params.comments.some((comment) => {
		if (comment.pos >= valueStart && comment.end <= testCase.value.end) return true
		if (comment.pos >= testCase.value.end)
			return lineOf({ position: comment.pos, sourceFile }) === valueEndLine
		const endLine = lineOf({ position: comment.end, sourceFile })
		return comment.end <= keyStart && endLine >= keyLine - 1 && !isTrailing({ comment, sourceFile })
	})
}

/** The zero-based line of a position. */
function lineOf(params: { position: number; sourceFile: ts.SourceFile }): number {
	return params.sourceFile.getLineAndCharacterOfPosition(params.position).line
}

/** Whether code precedes the comment on its first line. */
function isTrailing(params: { comment: ts.CommentRange; sourceFile: ts.SourceFile }): boolean {
	const { comment, sourceFile } = params
	const lineStart = sourceFile.getPositionOfLineAndCharacter(
		lineOf({ position: comment.pos, sourceFile }),
		0,
	)
	return sourceFile.text.slice(lineStart, comment.pos).trim() !== ''
}
