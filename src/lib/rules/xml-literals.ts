/** XML literals and the case documents of a test file: what the fixture document rules judge. */

import { calleeName } from './callee-name.ts'
import { isFunctionNode, unwrapped } from './syntax-nodes.ts'
import { declarationOf } from './test-shape-tables.ts'
import {
	CASE_DOCUMENT_PROPERTIES,
	CONTENT_SECTIONS,
	CURRENT_FOLDER_PATTERN,
	PROJECT_CALL_PATTERN,
	RAW_QUERY_PATTERN,
	RAW_XML_IMPORT_PATTERN,
	XML_LITERAL_START_PATTERN,
} from './xml-literals.constants.ts'

import ts from 'typescript'

import type { TestShape } from './check-test-shape-rules.types.ts'
import type { CaseDocument, TemplateScanState } from './xml-literals.types.ts'

/** Is the node an XML literal: a text that starts an element or `?xml`, or a default import of `.xml?raw`? */
export function isXmlLiteral(node: ts.Node): boolean {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		return XML_LITERAL_START_PATTERN.test(node.text)
	if (ts.isTemplateExpression(node))
		return [node.head, ...node.templateSpans.map((span) => span.literal)].some((part) =>
			XML_LITERAL_START_PATTERN.test(part.text),
		)
	return ts.isImportDeclaration(node) && isRawXmlImport(node)
}

/** The `.xml?raw` default import that binds the identifier in the file, if it is one. */
export function rawXmlImportOf(identifier: ts.Identifier): ts.ImportDeclaration | undefined {
	return identifier
		.getSourceFile()
		.statements.find(
			(statement): statement is ts.ImportDeclaration =>
				ts.isImportDeclaration(statement) &&
				isRawXmlImport(statement) &&
				statement.importClause?.name?.text === identifier.text,
		)
}

/** The `.xml?raw` import an identifier names: directly, or through a file `const` aliasing it (one level). */
export function rawXmlImportBehind(identifier: ts.Identifier): ts.ImportDeclaration | undefined {
	const direct = rawXmlImportOf(identifier)
	if (direct) return direct
	const declaration = declarationOf({ name: identifier.text, from: identifier })
	if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer)
		return undefined
	const aliased = unwrapped(declaration.initializer)
	return ts.isIdentifier(aliased) ? rawXmlImportOf(aliased) : undefined
}

/** The path a `.xml?raw` import names, without its `./` and its `?raw` (`fixtures/one-widget.xml`). */
export function rawXmlPathOf(declaration: ts.ImportDeclaration): string {
	const specifier = ts.isStringLiteral(declaration.moduleSpecifier)
		? declaration.moduleSpecifier.text
		: ''
	return specifier.replace(RAW_QUERY_PATTERN, '').replace(CURRENT_FOLDER_PATTERN, '')
}

/** The case documents of a file: `sourceXml` / `targetXml` values of table cases and of test project objects. */
export function caseDocumentsOf(params: {
	sourceFile: ts.SourceFile
	shape: TestShape
}): CaseDocument[] {
	const holders = [
		...params.shape.tables.flatMap((table) => table.cases.map((testCase) => testCase.value)),
		...projectObjectsOf(params.sourceFile),
	]
	const seen = new Set<ts.Node>()
	const documents: CaseDocument[] = []
	for (const holder of holders)
		for (const node of documentValuesIn(holder))
			if (!seen.has(node)) {
				seen.add(node)
				documents.push({ ...boundDocumentOf(node), node, caseNode: holder })
			}
	return documents
}

/** The substitutions of an XML literal that sit in content position (where elements or text go). */
export function contentSubstitutionsOf(literal: ts.TemplateExpression): ts.TemplateSpan[] {
	let state: TemplateScanState = { kind: 'content' }
	const found: ts.TemplateSpan[] = []
	const texts = [literal.head.text, ...literal.templateSpans.map((span) => span.literal.text)]
	for (const [index, text] of texts.entries()) {
		state = scannedState({ state, text })
		const span = literal.templateSpans[index]
		if (span && (state.kind === 'content' || state.kind === 'section')) found.push(span)
	}
	return found
}

function isRawXmlImport(declaration: ts.ImportDeclaration): boolean {
	return (
		ts.isStringLiteral(declaration.moduleSpecifier) &&
		RAW_XML_IMPORT_PATTERN.test(declaration.moduleSpecifier.text) &&
		declaration.importClause?.name !== undefined
	)
}

/** The object arguments of the calls that build a test project or run a table. */
function projectObjectsOf(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression[] {
	const objects: ts.ObjectLiteralExpression[] = []
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node) && PROJECT_CALL_PATTERN.test(calleeName(node.expression)))
			for (const argument of node.arguments) {
				const object = unwrapped(argument)
				if (ts.isObjectLiteralExpression(object)) objects.push(object)
			}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return objects
}

/** The `sourceXml` / `targetXml` values written in a case or a project object, nested objects included. */
function documentValuesIn(holder: ts.Node): ts.Expression[] {
	const values: ts.Expression[] = []
	function visit(node: ts.Node): void {
		if (isFunctionNode(node)) return
		if (ts.isPropertyAssignment(node) && isDocumentProperty(node.name))
			values.push(node.initializer)
		if (ts.isShorthandPropertyAssignment(node) && isDocumentProperty(node.name))
			values.push(node.name)
		ts.forEachChild(node, visit)
	}
	visit(holder)
	return values
}

function isDocumentProperty(name: ts.PropertyName): boolean {
	return (
		(ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
		CASE_DOCUMENT_PROPERTIES.includes(name.text)
	)
}

/** What a document value is: an XML literal, or an identifier followed one level to a const or a `?raw` import. */
function boundDocumentOf(
	node: ts.Expression,
): Pick<CaseDocument, 'literal' | 'constant' | 'rawImport'> {
	const value = unwrapped(node)
	if (isXmlLiteral(value)) return { literal: value, constant: undefined, rawImport: undefined }
	if (!ts.isIdentifier(value))
		return { literal: undefined, constant: undefined, rawImport: undefined }
	const rawImport = rawXmlImportOf(value)
	if (rawImport) return { literal: undefined, constant: undefined, rawImport }
	const declaration = declarationOf({ name: value.text, from: value })
	const initializer =
		declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
			? unwrapped(declaration.initializer)
			: undefined
	return initializer &&
		declaration &&
		ts.isVariableDeclaration(declaration) &&
		isXmlLiteral(initializer)
		? { literal: initializer, constant: declaration, rawImport: undefined }
		: { literal: undefined, constant: undefined, rawImport: undefined }
}

/**
 * The scan state after one text part of a template: in content, in a tag (a `>` in a quoted value does not
 * close it), or in a comment or CDATA section, whose text is content.
 */
function scannedState(params: { state: TemplateScanState; text: string }): TemplateScanState {
	const { text } = params
	let state = params.state
	for (let index = 0; index < text.length; index++) {
		const character = text[index]
		if (state.kind === 'section') {
			if (text.startsWith(state.close, index)) {
				index += state.close.length - 1
				state = { kind: 'content' }
			}
		} else if (state.kind === 'quote') {
			if (character === state.quote) state = { kind: 'tag' }
		} else if (state.kind === 'tag') {
			if (character === '"' || character === "'") state = { kind: 'quote', quote: character }
			else if (character === '>') state = { kind: 'content' }
		} else if (character === '<') {
			const section = CONTENT_SECTIONS.find((candidate) => text.startsWith(candidate.open, index))
			state = section ? { kind: 'section', close: section.close } : { kind: 'tag' }
			if (section) index += section.open.length - 1
		}
	}
	return state
}
