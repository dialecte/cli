/**
 * The test-shape rules of one test-shaped file, on its syntax tree: a branch on a case field in an act
 * (`table-branch`), an act that reads exported XML without an export (`without-export-xml`), a case of an
 * exporting table without queries (`export-without-queries`), a fixture built by a function
 * (`fixture-builder`) and a plan tag in a title or a file name (`plan-tag`).
 */
import { calleeName } from './callee-name.ts'
import {
	COMMITTED_PLAN_TAG_LABEL,
	EXPORT_QUERY_FIELDS,
	PLAN_TAG_PATTERNS,
	RUNNER_WITH_EXPORT,
	RUNNER_WITHOUT_EXPORT,
	TEST_FOLDER,
	TEST_SUPPORT_NAME_PATTERN,
	TYPESCRIPT_NAME_PATTERN,
	XML_EXPORT_CALLS,
	XML_SNAPSHOT_CALL,
	XML_SNAPSHOT_FORMAT,
	XML_START_PATTERN,
	XML_SUBSTITUTED_START_PATTERN,
} from './check-test-shape-rules.constants.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'
import { fileKindOf } from './file-kind.ts'
import { isFunctionNode, positionOf, unwrapped } from './syntax-nodes.ts'
import { literalTextOf, pathTextOf, testCalleeOf, testShapeOf } from './test-shape-tables.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'
import type { CaseBinding, TableCase, TestShape } from './check-test-shape-rules.types.ts'

/** Is the file a test or test support file: a test, spec, cases or fixtures file, `__tests__/`, or the top-level `test/` folder? */
export function isTestShaped(file: string): boolean {
	const segments = file.replace(/^\.[\\/]/, '').split(/[\\/]/)
	const name = segments.at(-1) ?? ''
	return (
		fileKindOf(file) === 'test' ||
		TEST_SUPPORT_NAME_PATTERN.test(name) ||
		(segments.length > 1 && segments[0] === TEST_FOLDER && TYPESCRIPT_NAME_PATTERN.test(name))
	)
}

/** Checks the five test-shape rules of one test-shaped file. */
export function checkTestShapeRules(params: {
	file: string
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { file, sourceFile } = params
	const shape = testShapeOf(sourceFile)
	return [
		...tableBranchesOf({ shape, sourceFile }),
		...withoutExportXmlOf({ shape, sourceFile }),
		...exportsWithoutQueriesOf({ shape, sourceFile }),
		...fixtureBuildersOf(sourceFile),
		...planTagsOf({ file, shape, sourceFile }),
	]
}

// table-branch

/** One finding per branch of an act or per-case callback whose condition reads a case field. */
function tableBranchesOf(params: {
	shape: TestShape
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const findings = new Map<number, QualityFinding>()
	for (const { node, binding } of params.shape.perCase)
		for (const finding of branchesOnCaseIn({ node, binding, sourceFile: params.sourceFile }))
			findings.set(finding.start, finding.finding)
	return [...findings.values()]
}

/** The branches of one function whose condition reads a case field, keyed by where they start. */
function branchesOnCaseIn(params: {
	node: ts.FunctionLikeDeclaration
	binding: CaseBinding
	sourceFile: ts.SourceFile
}): { start: number; finding: QualityFinding }[] {
	const { binding, sourceFile } = params
	const found: { start: number; finding: QualityFinding }[] = []
	function visit(child: ts.Node): void {
		const condition = branchConditionOf(child)
		const field = condition && fieldReadIn({ node: condition, binding })
		if (field)
			found.push({
				start: child.getStart(sourceFile),
				finding: {
					...positionOf({ node: child, sourceFile }),
					rule: 'table-branch',
					severity: 'error',
					message: `\`${field}\` steers the act: one table per behaviour, no branch on a case field`,
				},
			})
		ts.forEachChild(child, visit)
	}
	if (params.node.body) visit(params.node.body)
	return found
}

/** The condition of an `if`, a `switch`, a conditional expression or an `a && b` / `a || b` statement. */
function branchConditionOf(node: ts.Node): ts.Expression | undefined {
	if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) return node.expression
	if (ts.isConditionalExpression(node)) return node.condition
	if (!ts.isExpressionStatement(node)) return undefined
	const expression = unwrapped(node.expression)
	if (
		ts.isBinaryExpression(expression) &&
		(expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
			expression.operatorToken.kind === ts.SyntaxKind.BarBarToken)
	)
		return expression.left
	return undefined
}

/** The first case field `node` reads (`testCase.naming`, a destructured `nested`), as written. */
function fieldReadIn(params: { node: ts.Node; binding: CaseBinding }): string | undefined {
	const { node, binding } = params
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		const owner = pathTextOf(node.expression)
		// a method read on the case itself (`row.startsWith(...)` of a string row) reads the case, not a field
		if (owner !== undefined && binding.roots.includes(owner))
			return isMethodRead(node) ? owner : node.getText()
		const inOwner = fieldReadIn({ node: node.expression, binding })
		if (inOwner || ts.isPropertyAccessExpression(node)) return inOwner
		return fieldReadIn({ node: node.argumentExpression, binding })
	}
	if (ts.isIdentifier(node)) return binding.fields.includes(node.text) ? node.text : undefined
	if (ts.isPropertyAssignment(node)) return fieldReadIn({ node: node.initializer, binding })
	return ts.forEachChild(node, (child) => fieldReadIn({ node: child, binding }))
}

/** `node` is the callee of a call: `row.startsWith` of `row.startsWith('a')`. */
function isMethodRead(node: ts.Node): boolean {
	return ts.isCallExpression(node.parent) && node.parent.expression === node
}

// without-export-xml

/** A `.withoutExport(` runner call whose act reads exported XML: one finding at the call. */
function withoutExportXmlOf(params: {
	shape: TestShape
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	return params.shape.runners.flatMap((runner) =>
		runner.mode === RUNNER_WITHOUT_EXPORT && runner.act?.body && readsExportedXml(runner.act.body)
			? [
					{
						...positionOf({ node: runner.node, sourceFile: params.sourceFile }),
						rule: 'without-export-xml' as const,
						severity: 'error' as const,
						message: 'the act reads exported XML: use withExport with expectedQueries',
					},
				]
			: [],
	)
}

/** Does `node` call an XML export, or ask a snapshot for XML (`getSnapshot({ as: 'xml' })`)? */
function readsExportedXml(node: ts.Node): boolean {
	if (ts.isCallExpression(node)) {
		const name = calleeName(unwrapped(node.expression))
		if (XML_EXPORT_CALLS.includes(name)) return true
		if (name === XML_SNAPSHOT_CALL && node.arguments.some(asksForXml)) return true
	}
	return ts.forEachChild(node, readsExportedXml) ?? false
}

function asksForXml(argument: ts.Expression): boolean {
	const options = unwrapped(argument)
	return (
		ts.isObjectLiteralExpression(options) &&
		options.properties.some(
			(property) =>
				ts.isPropertyAssignment(property) &&
				ts.isIdentifier(property.name) &&
				property.name.text === 'as' &&
				literalTextOf(property.initializer) === XML_SNAPSHOT_FORMAT,
		)
	)
}

// export-without-queries

/** Each case of a table run with an export that has no query to check: one finding at its key. */
function exportsWithoutQueriesOf(params: {
	shape: TestShape
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const findings = new Map<ts.Node, QualityFinding>()
	for (const runner of params.shape.runners) {
		if (runner.mode !== RUNNER_WITH_EXPORT || !runner.table) continue
		for (const testCase of runner.table.cases)
			if (!findings.has(testCase.key) && lacksQueries(testCase))
				findings.set(testCase.key, {
					...positionOf({ node: testCase.key, sourceFile: params.sourceFile }),
					rule: 'export-without-queries',
					severity: 'error',
					message: `case \`${testCase.title ?? testCase.key.getText()}\` runs with an export and checks no query: give it expectedQueries or unexpectedQueries`,
				})
	}
	return [...findings.values()]
}

/** A case written as an object literal with neither query list, or only empty ones; any other case is not judged. */
function lacksQueries(testCase: TableCase): boolean {
	const value = unwrapped(testCase.value)
	if (!ts.isObjectLiteralExpression(value) || value.properties.some(ts.isSpreadAssignment))
		return false
	return !value.properties.some((property) => {
		const name = property.name && ts.isIdentifier(property.name) ? property.name.text : undefined
		if (!name || !EXPORT_QUERY_FIELDS.includes(name)) return false
		if (!ts.isPropertyAssignment(property)) return true
		const list = unwrapped(property.initializer)
		return !ts.isArrayLiteralExpression(list) || list.elements.length > 0
	})
}

// fixture-builder

/** Every function of the file whose returned value builds XML around a substitution. */
function fixtureBuildersOf(sourceFile: ts.SourceFile): QualityFinding[] {
	const findings: QualityFinding[] = []
	function visit(node: ts.Node): void {
		if (isFunctionNode(node) && returnedValuesOf(node).some(buildsXml)) {
			const name = functionNameOf(node)
			findings.push({
				...positionOf({ node: functionStartOf(node), sourceFile }),
				rule: 'fixture-builder',
				severity: 'warning',
				message: `${name ? `\`${name}\`` : 'a function'} builds fixture XML: write each fixture as inline XML`,
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return findings
}

/** The values a function returns: its expression body, or its `return` values outside nested functions. */
function returnedValuesOf(node: ts.FunctionLikeDeclaration): ts.Expression[] {
	if (!node.body) return []
	if (!ts.isBlock(node.body)) return [node.body]
	const values: ts.Expression[] = []
	function visit(child: ts.Node): void {
		if (isFunctionNode(child)) return
		if (ts.isReturnStatement(child) && child.expression) values.push(child.expression)
		ts.forEachChild(child, visit)
	}
	visit(node.body)
	return values
}

/** A template with a substitution, a `+` concatenation or a `.join` of strings, holding XML and a value. */
function buildsXml(value: ts.Expression): boolean {
	const built = unwrapped(value)
	if (ts.isTemplateExpression(built))
		return holdsXml(templateTextOf(built)) || substitutesElementName(built)
	if (ts.isBinaryExpression(built) && built.operatorToken.kind === ts.SyntaxKind.PlusToken)
		return partsBuildXml(concatenatedPartsOf(built))
	if (
		ts.isCallExpression(built) &&
		ts.isPropertyAccessExpression(built.expression) &&
		built.expression.name.text === 'join'
	) {
		const joined = unwrapped(built.expression.expression)
		return ts.isArrayLiteralExpression(joined) && partsBuildXml([...joined.elements])
	}
	return false
}

/** Parts that hold XML in a literal and at least one value that is not a literal. */
function partsBuildXml(parts: readonly ts.Expression[]): boolean {
	const texts = parts.map(stringTextOf)
	const substituted = texts.some(
		(text, index) => text === undefined || ts.isTemplateExpression(unwrapped(parts[index])),
	)
	const namedBySubstitution = texts.some(
		(text, index) =>
			text !== undefined &&
			XML_SUBSTITUTED_START_PATTERN.test(text) &&
			index + 1 < texts.length &&
			texts[index + 1] === undefined,
	)
	return (
		namedBySubstitution ||
		(substituted && texts.some((text) => text !== undefined && holdsXml(text)))
	)
}

/** A template whose XML starts with a substituted element name: a literal part ending in `<` before a substitution. */
function substitutesElementName(template: ts.TemplateExpression): boolean {
	const beforeSubstitutions = [
		template.head.text,
		...template.templateSpans.slice(0, -1).map((span) => span.literal.text),
	]
	return beforeSubstitutions.some((text) => XML_SUBSTITUTED_START_PATTERN.test(text))
}

function concatenatedPartsOf(expression: ts.Expression): ts.Expression[] {
	const part = unwrapped(expression)
	if (ts.isBinaryExpression(part) && part.operatorToken.kind === ts.SyntaxKind.PlusToken)
		return [...concatenatedPartsOf(part.left), ...concatenatedPartsOf(part.right)]
	return [part]
}

/** The literal text of a string, a template (its literal parts) or a number; undefined for a value. */
function stringTextOf(expression: ts.Expression): string | undefined {
	const literal = unwrapped(expression)
	if (
		ts.isStringLiteral(literal) ||
		ts.isNoSubstitutionTemplateLiteral(literal) ||
		ts.isNumericLiteral(literal)
	)
		return literal.text
	if (ts.isTemplateExpression(literal)) return templateTextOf(literal)
	return undefined
}

function templateTextOf(template: ts.TemplateExpression): string {
	return [template.head.text, ...template.templateSpans.map((span) => span.literal.text)].join('')
}

function holdsXml(text: string): boolean {
	return XML_START_PATTERN.test(text)
}

function functionNameOf(node: ts.FunctionLikeDeclaration): string | undefined {
	if (node.name && ts.isIdentifier(node.name)) return node.name.text
	const parent = node.parent
	if (
		(ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
		ts.isIdentifier(parent.name)
	)
		return parent.name.text
	return undefined
}

/** Where a function starts as a reader sees it: a `const` function at its `const`. */
function functionStartOf(node: ts.FunctionLikeDeclaration): ts.Node {
	const declaration = node.parent
	if (!ts.isVariableDeclaration(declaration)) return node
	const statement = declaration.parent.parent
	return ts.isVariableStatement(statement) ? statement : declaration
}

// plan-tag

/** A plan tag in the file's name, in a test title or in a key of a table. */
function planTagsOf(params: {
	file: string
	shape: TestShape
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { file, sourceFile } = params
	const patterns = planTagPatterns()
	const name = file.split(/[\\/]/).at(-1) ?? ''
	const nameFindings: QualityFinding[] = carriesPlanTag({ text: name, patterns })
		? [
				{
					line: 1,
					column: 1,
					rule: 'plan-tag',
					severity: 'error',
					message: `file name \`${name}\` carries a plan tag: name it after what it checks`,
				},
			]
		: []
	const titled = new Map<ts.Node, string>()
	for (const title of testTitlesOf(sourceFile)) titled.set(title.node, title.text)
	for (const table of params.shape.tables)
		for (const testCase of table.cases)
			if (testCase.title !== undefined) titled.set(testCase.key, testCase.title)
	const titleFindings = [...titled]
		.filter(([, text]) => carriesPlanTag({ text, patterns }))
		.map(([node]) => ({
			...positionOf({ node, sourceFile }),
			rule: 'plan-tag' as const,
			severity: 'error' as const,
			message: `title \`${shownTitleOf(node)}\` carries a plan tag: say what the case checks`,
		}))
	return [...nameFindings, ...titleFindings]
}

/** The plan tags of this rule, then the plan tags committed text may not hold. */
function planTagPatterns(): RegExp[] {
	return [
		...PLAN_TAG_PATTERNS,
		...GENERIC_REFERENCE_PATTERNS.filter(
			(pattern) => pattern.label === COMMITTED_PLAN_TAG_LABEL,
		).map((pattern) => new RegExp(pattern.source, pattern.ignoreCase ? 'i' : '')),
	]
}

function carriesPlanTag(params: { text: string; patterns: readonly RegExp[] }): boolean {
	return params.patterns.some((pattern) => pattern.test(params.text))
}

/** The first argument of every `describe` / `it` / `test` call (and their forms) written as a literal. */
function testTitlesOf(sourceFile: ts.SourceFile): { node: ts.Expression; text: string }[] {
	const titles: { node: ts.Expression; text: string }[] = []
	function visit(node: ts.Node): void {
		const [title] = ts.isCallExpression(node) && testCalleeOf(node.expression) ? node.arguments : []
		const text = title && literalTextOf(title)
		if (title && text !== undefined) titles.push({ node: title, text })
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return titles
}

/** A title as the message shows it: the text of a string, a template without its backticks. */
function shownTitleOf(node: ts.Node): string {
	const title = ts.isExpression(node) ? unwrapped(node) : node
	if (
		ts.isStringLiteral(title) ||
		ts.isNoSubstitutionTemplateLiteral(title) ||
		ts.isIdentifier(title)
	)
		return title.text
	if (ts.isComputedPropertyName(title)) return shownTitleOf(title.expression)
	return ts.isTemplateExpression(title) ? title.getText().slice(1, -1) : title.getText()
}
