/**
 * Test code compared by meaning, not by layout: the leaves of a source file's syntax tree (parsed by the
 * kind its extension says: a `.ts` file is no TSX) with the trivia dropped - whitespace and comments,
 * except the comments a tool reads (`@vitest-environment`, `@vite-ignore`) - string literals by their
 * value (quote style aside), template literals by their raw text, statement semicolons and trailing
 * commas after an element dropped, a marker at each statement's start (so a line break that ends a
 * statement still counts), and each run of import declarations with a clause sorted as whole
 * statements (a side-effect import is a barrier: it runs code). A formatter pass keeps the stream; any
 * other edit changes it.
 */
import {
	CLOSING_TOKENS,
	COMMENT_PATTERN,
	HOLE_TOKEN,
	OPENING_ELEMENT_TOKENS,
	TOOL_COMMENT_PATTERN,
} from './tdd.constants.ts'
import { scriptKindOf } from './test-source.ts'

import ts from 'typescript'

/** The text's tokens as one string: equal for two texts that differ only in formatting. */
export function testCodeTokens(params: { text: string; file: string }): string {
	const { text } = params
	const source = ts.createSourceFile(
		params.file,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKindOf(params.file),
	)
	const statements: string[] = []
	let importRun: string[] = []
	function flushImports(): void {
		statements.push(...importRun.sort())
		importRun = []
	}
	for (const statement of source.statements) {
		const tokens: string[] = []
		collectTokens({ node: statement, source, tokens })
		const line = withoutTrailingCommas(tokens).join(' ')
		if (ts.isImportDeclaration(statement) && statement.importClause) importRun.push(line)
		else {
			flushImports()
			statements.push(line)
		}
	}
	flushImports()
	return statements.join('\n')
}

function collectTokens(params: { node: ts.Node; source: ts.SourceFile; tokens: string[] }): void {
	const { node, source, tokens } = params
	if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
	if (isListedStatement(node)) tokens.push('§')
	const children = node.getChildren(source)
	if (children.length === 0) {
		tokens.push(...toolComments({ node, source }))
		const token = tokenOf({ node, source })
		if (token !== undefined) tokens.push(token)
		return
	}
	for (const child of children) collectTokens({ node: child, source, tokens })
}

/** The comments in the trivia before a leaf that a tool reads: they change what runs. */
function toolComments(params: { node: ts.Node; source: ts.SourceFile }): string[] {
	const { node, source } = params
	const trivia = source.getFullText().slice(node.pos, node.getStart(source))
	return [...trivia.matchAll(COMMENT_PATTERN)]
		.map((match) => match[0])
		.filter((comment) => TOOL_COMMENT_PATTERN.test(comment))
		.map((comment) => `C${JSON.stringify(comment)}`)
}

/** The leaf as compared; undefined for a statement's semicolon (formatting only). */
function tokenOf(params: { node: ts.Node; source: ts.SourceFile }): string | undefined {
	const { node, source } = params
	if (node.kind === ts.SyntaxKind.SemicolonToken && !isLoopHeaderPart(node)) return undefined
	if (ts.isStringLiteral(node)) return `S${JSON.stringify(node.text)}`
	if (
		ts.isNoSubstitutionTemplateLiteral(node) ||
		ts.isTemplateHead(node) ||
		ts.isTemplateMiddle(node) ||
		ts.isTemplateTail(node)
	)
		return `T${JSON.stringify(node.rawText ?? node.text)}`
	if (ts.isJsxText(node)) return `J${JSON.stringify(node.text.trim())}`
	// a hole of an array (`[,]`) has no text of its own, an empty list neither
	if (ts.isOmittedExpression(node)) return HOLE_TOKEN
	const text = node.getText(source)
	return text === '' ? undefined : text
}

/** A `;` of a `for (;;)` header: part of the syntax, not a statement end. */
function isLoopHeaderPart(node: ts.Node): boolean {
	return ts.isForStatement(node.parent)
}

/** A statement of a block, a module or a `case`: its start is marked. */
function isListedStatement(node: ts.Node): boolean {
	const parent = node.parent as (ts.Node & { statements?: ts.NodeArray<ts.Node> }) | undefined
	return parent?.statements?.includes(node) ?? false
}

/** A comma right before a closing bracket and after an element: `[1, 2,]` is `[1, 2]`, `[,]` is not `[]`. */
function withoutTrailingCommas(tokens: readonly string[]): string[] {
	return tokens.filter(
		(token, index) =>
			token !== ',' ||
			!CLOSING_TOKENS.includes(tokens[index + 1] ?? '') ||
			OPENING_ELEMENT_TOKENS.includes(tokens[index - 1] ?? ''),
	)
}
