/**
 * SQL in the strings of code: a word that is an SQL keyword inside an SQL string is the keyword, not a name, so the
 * committed-text checks (a consumer name, a forbidden word) do not report it there. Read on the syntax tree.
 */
import { SCRIPT_NAME_PATTERN } from './file-kind.constants.ts'
import {
	FIRST_WORD_PATTERN,
	SQL_KEYWORDS,
	SQL_STATEMENT_KEYWORDS,
	WORD_AT_PATTERN,
} from './sql-literals.constants.ts'

import ts from 'typescript'

/**
 * Whether the 1-based `line` and `column` of the file start an uppercase SQL keyword inside an SQL string of code: a string, a
 * template literal (its text parts, never its substitutions) or a `+` chain of them, whose text starts with an uppercase SQL
 * statement keyword. Never in a file that is not a script (a doc's SQL is prose). The file is parsed once, on the first
 * position that is a keyword, unless its syntax tree is given.
 * @intent tell an SQL keyword in code from a name in committed text
 */
export function sqlKeywordReaderOf(params: {
	file: string
	text: string
	sourceFile?: ts.SourceFile
}): (position: { line: number; column: number }) => boolean {
	const { file, text } = params
	if (!SCRIPT_NAME_PATTERN.test(file))
		return function notScript() {
			return false
		}
	let sourceFile = params.sourceFile
	let spans: ReadonlyArray<readonly [number, number]> | undefined
	return function isSqlKeywordAt(position) {
		sourceFile ??= ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
		const offset = offsetOf({ sourceFile, ...position })
		if (offset === undefined) return false
		const word = WORD_AT_PATTERN.exec(sourceFile.text.slice(offset))?.[0]
		if (word === undefined || !SQL_KEYWORDS.has(word)) return false
		spans ??= sqlTextSpansOf({ sourceFile })
		return spans.some(([start, end]) => offset >= start && offset < end)
	}
}

/** The offset of a 1-based line and column; undefined past the file's lines. */
function offsetOf(params: {
	sourceFile: ts.SourceFile
	line: number
	column: number
}): number | undefined {
	const starts = params.sourceFile.getLineStarts()
	const start = starts[params.line - 1]
	return start === undefined ? undefined : start + params.column - 1
}

/** The spans `[start, end)` of the text parts of every SQL string of the file. */
function sqlTextSpansOf(params: { sourceFile: ts.SourceFile }): Array<readonly [number, number]> {
	const { sourceFile } = params
	const spans: Array<readonly [number, number]> = []
	function visit(node: ts.Node): void {
		if (
			isTextPart(node) &&
			isSql({ node: leftmostOf({ node: chainRootOf({ node: stringOf({ node }) }) }) })
		)
			spans.push([node.getStart(sourceFile), node.getEnd()])
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return spans
}

/** A piece of string text: a string, a template literal without substitution, or a text part of a template. */
function isTextPart(node: ts.Node): boolean {
	return (
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		ts.isTemplateHead(node) ||
		ts.isTemplateMiddle(node) ||
		ts.isTemplateTail(node)
	)
}

/** The string a text part belongs to: its template expression for a template part, else itself. */
function stringOf(params: { node: ts.Node }): ts.Node {
	const { node } = params
	if (ts.isTemplateHead(node)) return node.parent
	if (ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.parent.parent
	return node
}

/** The outermost `+` chain holding the string, walked up one parent at a time (parentheses passed). */
function chainRootOf(params: { node: ts.Node }): ts.Node {
	let root = params.node
	let parent = root.parent
	while (
		(ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
		ts.isParenthesizedExpression(parent)
	) {
		root = parent
		parent = parent.parent
	}
	return root
}

/** The first operand of a `+` chain (parentheses passed). */
function leftmostOf(params: { node: ts.Node }): ts.Node {
	let node = params.node
	while (
		(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
		ts.isParenthesizedExpression(node)
	)
		node = ts.isBinaryExpression(node) ? node.left : node.expression
	return node
}

/** Whether the string's text starts with an SQL statement keyword. */
function isSql(params: { node: ts.Node }): boolean {
	const { node } = params
	const text =
		ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
			? node.text
			: ts.isTemplateExpression(node)
				? node.head.text
				: undefined
	const first = text === undefined ? undefined : FIRST_WORD_PATTERN.exec(text)?.[1]
	return first !== undefined && SQL_STATEMENT_KEYWORDS.has(first)
}
