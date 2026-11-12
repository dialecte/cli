/**
 * The exported functions of one source file, read from its syntax tree alone (no type checker): a function
 * declaration (an overload set is one function), or a `const` whose value is an arrow or a function expression,
 * exported where it is declared or by a local `export { name }` list.
 */
import { SIGNATURE_PRINTER } from '../discover.constants.ts'
import { parseIntentText } from '../discover.ts'
import { firstSyntaxErrorOf } from '../first-syntax-error.ts'
import { firstSentence } from './short-summary.ts'
import { INTENT_TAG, NOT_PARSED_NOTE } from './source-functions.constants.ts'

import ts from 'typescript'

import type { ApiSourceFunction } from './api-json.types.ts'
import type {
	ExportedSourceFunction,
	ParsedSourceFile,
	PrintedToken,
	SourceFunctionNode,
	TopLevelFunction,
} from './source-functions.types.ts'

/** Reads the exported functions of one source file, as `ApiSourceFunction` entries; a syntax error gives a note. */
export function parseSourceFile(params: { file: string; text: string }): ParsedSourceFile {
	const { file, text } = params
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	const syntaxError = firstSyntaxErrorOf({ source })
	if (syntaxError !== undefined)
		return {
			entries: [],
			note: NOT_PARSED_NOTE.replace('{file}', file).replace('{why}', syntaxError.message),
		}
	return {
		entries: exportedFunctionsOf(source).map(function entryOfFunction(found) {
			return sourceEntry({ file, source, found })
		}),
	}
}

/** The functions `source` exports, in the order they are declared: each under every name it is exported by. */
function exportedFunctionsOf(source: ts.SourceFile): ExportedSourceFunction[] {
	const listed = locallyExportedNames(source)
	return topLevelFunctionsOf(source).flatMap(function exportsOfFunction(found) {
		const names = [...(found.exported ? [found.name] : []), ...(listed.get(found.name) ?? [])]
		return [...new Set(names)].map(function exportedAs(name) {
			return {
				name,
				node: found.node,
				declaration: found.declaration,
				documented: found.documented,
			}
		})
	})
}

/**
 * The names a local `export { y, y as z }` list (no `from`: a re-export is no function of this file) exports, by
 * the local name they export; type-only exports left out.
 */
function locallyExportedNames(source: ts.SourceFile): Map<string, string[]> {
	const names = new Map<string, string[]>()
	for (const statement of source.statements) {
		if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier !== undefined) continue
		if (statement.isTypeOnly || statement.exportClause === undefined) continue
		if (!ts.isNamedExports(statement.exportClause)) continue
		for (const element of statement.exportClause.elements) {
			if (element.isTypeOnly) continue
			const local = (element.propertyName ?? element.name).text
			names.set(local, [...(names.get(local) ?? []), element.name.text])
		}
	}
	return names
}

/**
 * The named top-level functions of `source`: a function declaration with a body (its overloads before it make
 * one function, declared at the first overload), or each declarator of a `const` whose value is a function.
 */
function topLevelFunctionsOf(source: ts.SourceFile): TopLevelFunction[] {
	const found: TopLevelFunction[] = []
	const overloads = new Map<string, ts.FunctionDeclaration[]>()
	for (const statement of source.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
			const name = statement.name.text
			const set = [...(overloads.get(name) ?? []), statement]
			if (statement.body === undefined) {
				overloads.set(name, set)
				continue
			}
			overloads.delete(name)
			found.push({
				name,
				node: statement,
				declaration: set[0],
				documented: set.find(hasJsDoc) ?? statement,
				exported: set.some(isExported),
			})
		} else if (
			ts.isVariableStatement(statement) &&
			statement.declarationList.flags & ts.NodeFlags.Const
		)
			found.push(...constFunctionsOf(statement))
	}
	return found
}

/** The declarators of a `const` statement whose value is an arrow or a function expression, each at its own line. */
function constFunctionsOf(statement: ts.VariableStatement): TopLevelFunction[] {
	const exported = isExported(statement)
	return statement.declarationList.declarations.flatMap(
		function functionOfDeclaration(declaration) {
			const { initializer, name } = declaration
			if (!ts.isIdentifier(name) || initializer === undefined) return []
			if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) return []
			return [{ name: name.text, node: initializer, declaration, documented: statement, exported }]
		},
	)
}

function hasJsDoc(node: ts.Node): boolean {
	return ts.getJSDocCommentsAndTags(node).some(ts.isJSDoc)
}

function isExported(statement: ts.Statement): boolean {
	return (
		ts.canHaveModifiers(statement) &&
		(ts.getModifiers(statement) ?? []).some(function isExportKeyword(modifier) {
			return modifier.kind === ts.SyntaxKind.ExportKeyword
		})
	)
}

function sourceEntry(params: {
	file: string
	source: ts.SourceFile
	found: ExportedSourceFunction
}): ApiSourceFunction {
	const { file, source, found } = params
	const jsDoc = ts.getJSDocCommentsAndTags(found.documented).filter(ts.isJSDoc).at(-1)
	const line = source.getLineAndCharacterOfPosition(found.declaration.getStart(source)).line + 1
	return {
		path: `${file}#${found.name}`,
		root: 'source',
		entry: undefined,
		otherRoutes: [],
		signature: signatureOf({ source, node: found.node }),
		summary: summaryOf(jsDoc),
		intents: intentsOf(jsDoc),
		declaredAt: `${file}:${line}`,
		example: undefined,
	}
}

/** The first sentence of the JSDoc text before its tags, on one line; undefined when there is none. */
function summaryOf(jsDoc: ts.JSDoc | undefined): string | undefined {
	const text = (ts.getTextOfJSDocComment(jsDoc?.comment) ?? '').replace(/\s+/g, ' ').trim()
	return text === '' ? undefined : firstSentence(text)
}

function intentsOf(jsDoc: ts.JSDoc | undefined): string[] {
	return (jsDoc?.tags ?? [])
		.filter(function isIntentTag(tag) {
			return tag.tagName.text === INTENT_TAG
		})
		.flatMap(function intentsOfTag(tag) {
			return parseIntentText(ts.getTextOfJSDocComment(tag.comment) ?? '')
		})
}

/**
 * The type parameters, parameter list and return annotation on one line: `(params: { root: string }): string`.
 * Each part printed from its syntax node, whitespace runs collapsed, no `;` before a closing `}`.
 */
function signatureOf(params: { source: ts.SourceFile; node: SourceFunctionNode }): string {
	const { source, node } = params
	function print(part: ts.Node): string {
		return oneLine(SIGNATURE_PRINTER.printNode(ts.EmitHint.Unspecified, part, source))
	}
	const typeParameters = node.typeParameters ? `<${node.typeParameters.map(print).join(', ')}>` : ''
	const returnType = node.type ? `: ${print(node.type)}` : ''
	return `${typeParameters}(${node.parameters.map(print).join(', ')})${returnType}`
}

/**
 * Printed code on one line: each whitespace run one space, a `;` just before a `}` dropped (`{ a: string }`).
 * Read token by token, so the text of a string or a template is never changed.
 */
function oneLine(printed: string): string {
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		ts.LanguageVariant.Standard,
		printed,
	)
	const tokens: PrintedToken[] = []
	// the open braces and template heads: a `}` closing a template's `${` goes on with the template's text
	const open: ts.SyntaxKind[] = []
	let spaced = false
	for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
		if (kind === ts.SyntaxKind.WhitespaceTrivia || kind === ts.SyntaxKind.NewLineTrivia) {
			spaced = tokens.length > 0
			continue
		}
		if (kind === ts.SyntaxKind.CloseBraceToken && open.at(-1) === ts.SyntaxKind.TemplateHead) {
			kind = scanner.reScanTemplateToken(false)
			if (kind === ts.SyntaxKind.TemplateTail) open.pop()
		} else if (kind === ts.SyntaxKind.OpenBraceToken || kind === ts.SyntaxKind.TemplateHead)
			open.push(kind)
		else if (kind === ts.SyntaxKind.CloseBraceToken) open.pop()
		tokens.push({ kind, text: scanner.getTokenText(), spaced })
		spaced = false
	}
	return tokens
		.filter(function keptToken(token, index) {
			return !(
				token.kind === ts.SyntaxKind.SemicolonToken &&
				tokens[index + 1]?.kind === ts.SyntaxKind.CloseBraceToken
			)
		})
		.map(function textOfToken(token) {
			return token.spaced ? ` ${token.text}` : token.text
		})
		.join('')
}
