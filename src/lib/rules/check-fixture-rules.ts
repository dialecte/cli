/**
 * The fixture document rules of one test-shaped Dialecte-change file: `xml-splice`, `xml-replace`,
 * `fixtures-module`, `inline-document-long`, `expected-fixture` and `fixture-case-comment`.
 */
import { checkExpectedFixtures, checkFixtureCaseComments } from './check-expectation-rules.ts'
import { REPLACE_METHODS } from './check-fixture-rules.constants.ts'
import { checkInlineDocumentLength } from './check-length-rules.ts'
import { FIXTURES_MODULE_NAME_PATTERN } from './check-test-shape-rules.constants.ts'
import {
	isExportedFunction,
	isFixtureBuilder,
	isFixturesModule,
	returnedValuesOf,
} from './check-test-shape-rules.ts'
import { isExported, isFunctionNode, isWithin, positionOf, unwrapped } from './syntax-nodes.ts'
import { declarationOf } from './test-shape-tables.ts'
import {
	caseDocumentsOf,
	contentSubstitutionsOf,
	isXmlLiteral,
	rawXmlImportOf,
} from './xml-literals.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'
import type { TestShape } from './check-test-shape-rules.types.ts'
import type { CaseDocument } from './xml-literals.types.ts'

/**
 * Checks the fixture document rules of one test-shaped file; `xmlImports`, the names it imports that are XML literals
 * in their module (an import followed one level), are fixture documents too.
 */
export function checkFixtureRules(params: {
	file: string
	sourceFile: ts.SourceFile
	shape: TestShape
	xmlImports?: ReadonlySet<string>
}): QualityFinding[] {
	const { file, sourceFile, shape } = params
	const xmlImports = params.xmlImports ?? new Set<string>()
	const documents = caseDocumentsOf({ sourceFile, shape })
	const moduleExports = isFixturesModule(file) ? xmlExportsOf(sourceFile) : []
	const builders = [...buildersOf(sourceFile), ...moduleExports.flatMap(exportedFunctionsOf)]
	return [
		...xmlSplicesOf({ documents, builders, sourceFile }),
		...xmlReplacesOf({ documents, sourceFile, xmlImports }),
		...fixturesModuleFindingsOf({ file, moduleExports, sourceFile }),
		...checkInlineDocumentLength({ documents, sourceFile }),
		...checkExpectedFixtures(sourceFile),
		...checkFixtureCaseComments({ sourceFile, shape, documents }),
	]
}

// xml-splice

/** One finding per content substitution of a case document's XML literal, outside the file's fixture builders. */
function xmlSplicesOf(params: {
	documents: readonly CaseDocument[]
	builders: readonly ts.Node[]
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { builders, sourceFile } = params
	const spans = new Set<ts.TemplateSpan>()
	for (const document of params.documents)
		if (document.literal && ts.isTemplateExpression(document.literal))
			for (const span of contentSubstitutionsOf(document.literal))
				if (!builders.some((builder) => isWithin({ node: span, container: builder })))
					spans.add(span)
	return [...spans].map((span) => ({
		...positionOf({ node: span.expression, sourceFile }),
		rule: 'xml-splice' as const,
		severity: 'error' as const,
		message: `\`\${${span.expression.getText(sourceFile)}}\` splices XML into a case document: write the whole document (inline, or fixtures/<what-it-holds>.xml with ?raw)`,
	}))
}

/** The functions of the file that build fixture XML. */
function buildersOf(sourceFile: ts.SourceFile): ts.FunctionLikeDeclaration[] {
	const builders: ts.FunctionLikeDeclaration[] = []
	function visit(node: ts.Node): void {
		if (isFixtureBuilder(node)) builders.push(node)
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return builders
}

// xml-replace

/** One finding per `.replace(` / `.replaceAll(` on a fixture document whose result reaches a case document. */
function xmlReplacesOf(params: {
	documents: readonly CaseDocument[]
	sourceFile: ts.SourceFile
	xmlImports: ReadonlySet<string>
}): QualityFinding[] {
	const { xmlImports } = params
	const calls = new Set<ts.CallExpression>()
	for (const document of params.documents)
		for (const call of replaceCallsReaching({
			expression: document.node,
			visited: new Set(),
			xmlImports,
		}))
			calls.add(call)
	return [...calls].map((call) => ({
		...positionOf({ node: call, sourceFile: params.sourceFile }),
		rule: 'xml-replace' as const,
		severity: 'error' as const,
		message: '.replace() on a fixture document: give the variant its own document',
	}))
}

/** The replace calls on a fixture document that the value is made of, through the file's bindings and chains. */
function replaceCallsReaching(params: {
	expression: ts.Expression
	visited: ReadonlySet<ts.Node>
	xmlImports: ReadonlySet<string>
}): ts.CallExpression[] {
	const { visited, xmlImports } = params
	const value = unwrapped(params.expression)
	const receiver = replaceReceiverOf(value)
	if (receiver && ts.isCallExpression(value))
		return [
			...(isFixtureDocument({ expression: receiver, visited: new Set(), xmlImports })
				? [value]
				: []),
			...replaceCallsReaching({ expression: receiver, visited, xmlImports }),
		]
	const initializer = ts.isIdentifier(value) ? constInitializerOf(value) : undefined
	if (!initializer || visited.has(initializer)) return []
	return replaceCallsReaching({
		expression: initializer,
		visited: new Set([...visited, initializer]),
		xmlImports,
	})
}

/**
 * Is the value a fixture document: an XML literal, a `?raw` import, a name imported from a module where it is an XML
 * literal, or a binding or replace call of one?
 */
function isFixtureDocument(params: {
	expression: ts.Expression
	visited: ReadonlySet<ts.Node>
	xmlImports: ReadonlySet<string>
}): boolean {
	const { visited, xmlImports } = params
	const value = unwrapped(params.expression)
	if (isXmlLiteral(value)) return true
	const receiver = replaceReceiverOf(value)
	if (receiver) return isFixtureDocument({ expression: receiver, visited, xmlImports })
	if (!ts.isIdentifier(value)) return false
	if (rawXmlImportOf(value)) return true
	const initializer = constInitializerOf(value)
	if (!initializer) return xmlImports.has(value.text)
	if (visited.has(initializer)) return false
	return isFixtureDocument({
		expression: initializer,
		visited: new Set([...visited, initializer]),
		xmlImports,
	})
}

/** The receiver of a `.replace(` / `.replaceAll(` call; undefined for any other value. */
function replaceReceiverOf(value: ts.Expression): ts.Expression | undefined {
	return ts.isCallExpression(value) &&
		ts.isPropertyAccessExpression(value.expression) &&
		REPLACE_METHODS.includes(value.expression.name.text)
		? value.expression.expression
		: undefined
}

/** The initializer of the file's `const` the identifier names. */
function constInitializerOf(identifier: ts.Identifier): ts.Expression | undefined {
	const declaration = declarationOf({
		name: identifier.text,
		from: identifier,
	})
	return declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined
}

// fixtures-module

/** The exports of a fixtures module that hold XML: a `const` XML literal, or a function returning XML. */
function xmlExportsOf(sourceFile: ts.SourceFile): ts.Statement[] {
	return sourceFile.statements.filter((statement) => {
		if (ts.isFunctionDeclaration(statement))
			return isExportedFunction(statement) && returnsXml(statement)
		return (
			ts.isVariableStatement(statement) &&
			statement.declarationList.declarations.some(
				(declaration) => isExported(declaration) && holdsXml(declaration.initializer),
			)
		)
	})
}

/** The functions an export declares: the function itself, or the functions its `const`s hold. */
function exportedFunctionsOf(statement: ts.Statement): ts.FunctionLikeDeclaration[] {
	if (ts.isFunctionDeclaration(statement)) return [statement]
	if (!ts.isVariableStatement(statement)) return []
	return statement.declarationList.declarations.flatMap((declaration) => {
		const value = declaration.initializer && unwrapped(declaration.initializer)
		return value && isFunctionNode(value) ? [value] : []
	})
}

/** A const's value that is XML: an XML literal, or a function returning XML. */
function holdsXml(initializer: ts.Expression | undefined): boolean {
	const value = initializer && unwrapped(initializer)
	if (!value) return false
	return isFunctionNode(value) ? returnsXml(value) : isXmlLiteral(value)
}

function returnsXml(node: ts.FunctionLikeDeclaration): boolean {
	return (
		isFixtureBuilder(node) || returnedValuesOf(node).some((value) => isXmlLiteral(unwrapped(value)))
	)
}

/** One finding per XML export of a fixtures module, at the export. */
function fixturesModuleFindingsOf(params: {
	file: string
	moduleExports: readonly ts.Node[]
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const kind = FIXTURES_MODULE_NAME_PATTERN.exec(params.file)?.[1] ?? ''
	return params.moduleExports.map((exported) => ({
		...positionOf({ node: exported, sourceFile: params.sourceFile }),
		rule: 'fixtures-module' as const,
		severity: 'error' as const,
		message: `a \`*${kind}.ts\` module exports fixture XML: give each test its own document (inline, or fixtures/<what-it-holds>.xml with ?raw)`,
	}))
}
