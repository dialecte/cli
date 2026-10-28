/**
 * The code rules of the Dialecte repositories, checked on the syntax tree of one file (not with
 * greps): types in `*.types.ts`, module constants in `*.constants.ts`, named function declarations,
 * no `await` inside an argument, object parameters, full words, and no plan tag or standard citation
 * in committed text.
 */
import {
	ABBREVIATIONS,
	CONSTANT_NAME_PATTERN,
	CODE_VISITED_KINDS,
	LEADING_POSITIONAL_PARAMETERS,
	RULE_NAMES,
} from './check-code-rules.constants.ts'
import { findReferences, isReferenceChecked } from './committed-text.ts'

import ts from 'typescript'

import type { CheckCodeRulesParams, FileKind, RuleFinding } from './check-code-rules.types.ts'

export function checkCodeRules(params: CheckCodeRulesParams): RuleFinding[] {
	const { file, text } = params
	const kind = fileKindOf(file)
	const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
	const findings: RuleFinding[] = []

	function report(
		finding: Omit<RuleFinding, 'file' | 'line' | 'column'> & { node: ts.Node },
	): void {
		const { node, ...rest } = finding
		const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
		findings.push({ file, line: position.line + 1, column: position.character + 1, ...rest })
	}

	// types and module constants live in their own files next to an implementation file
	if (kind === 'implementation' || kind === 'config')
		for (const statement of sourceFile.statements) {
			if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
				report({
					node: statement.name,
					rule: 'type-outside-types-file',
					severity: isExported(statement) ? 'error' : 'warning',
					message: `type \`${statement.name.text}\` belongs in a \`*.types.ts\` file next to this one`,
				})
			if (kind === 'implementation' && ts.isVariableStatement(statement))
				for (const declaration of statement.declarationList.declarations)
					if (
						ts.isIdentifier(declaration.name) &&
						CONSTANT_NAME_PATTERN.test(declaration.name.text) &&
						!isModuleRegistry(declaration.initializer)
					)
						report({
							node: declaration.name,
							rule: 'constant-outside-constants-file',
							severity: 'error',
							message: `module constant \`${declaration.name.text}\` belongs in a \`*.constants.ts\` file next to this one`,
						})
		}

	function visit(node: ts.Node): void {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
			!isReassignedLet({ declaration: node, sourceFile })
		)
			report({
				node: node.name,
				rule: 'function-as-const',
				severity: 'error',
				message: `\`${node.name.text}\` is a function: declare it with \`function ${node.name.text}\``,
			})
		if (
			(ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
			node.name &&
			positionalParameterCount(node.parameters) > 1
		)
			report({
				node: node.name,
				rule: 'positional-parameters',
				severity: 'warning',
				message: `\`${node.name.getText(sourceFile)}\` takes positional parameters: take one params object (a leading query or tx may stay)`,
			})
		const declaredName = declaredNameOf(node)
		const abbreviation = declaredName && abbreviationIn(declaredName.text)
		if (declaredName && abbreviation)
			report({
				node: declaredName,
				rule: 'abbreviation',
				severity: 'warning',
				message: `\`${declaredName.text}\`: write ${abbreviation}`,
			})
		if (ts.isAwaitExpression(node) && isInsideAnArgument(node))
			report({
				node,
				rule: 'await-in-argument',
				severity: 'error',
				message: 'an `await` inside an argument: await into a named const first, then pass it',
			})
		ts.forEachChild(node, visit)
	}
	if (CODE_VISITED_KINDS.includes(kind)) visit(sourceFile)

	if (kind !== 'generated' && isReferenceChecked(file))
		for (const reference of findReferences({ text, patterns: params.referencePatterns }))
			findings.push({
				file,
				line: reference.line,
				column: reference.column,
				rule: 'committed-text-reference',
				severity: 'error',
				message: `${reference.label} \`${reference.text}\`: say the behaviour, keep tags and citations in the plan`,
			})

	return findings.sort(compareFindings)
}

/**
 * What a file is for, from its name and folder, as the house layout places them: `<name>.types.ts`,
 * `types.ts`, `types.<topic>.ts` or a `types/` folder hold types; `<name>.constants.ts`, `constants.ts`,
 * `constant.ts`, `constants.<topic>.ts` or a `constants/` folder hold module constants; a `*.config.ts`
 * file holds a configuration object (module constants allowed, types still in their own file). Files
 * under `__tests__/` and `*.cases.ts` / `*.fixtures.ts` are test support; files in the `evals` folder of a skill
 * are eval fixtures, often wrong on purpose: only their references are checked.
 */
export function fileKindOf(file: string): FileKind {
	const segments = file.split(/[\\/]/)
	const name = segments.at(-1) ?? ''
	const folders = segments.slice(0, -1)
	if (/\.generated\.[cm]?tsx?$/.test(name)) return 'generated'
	if (/\.d\.[cm]?ts$/.test(name)) return 'declaration'
	if (folders.some((folder, index) => folder === 'skills' && folders[index + 2] === 'evals'))
		return 'eval-fixture'
	if (/\.(test|spec|cases|fixtures)\.[cm]?tsx?$/.test(name) || folders.includes('__tests__'))
		return 'test'
	if (!/\.[cm]?tsx?$/.test(name)) return 'text'
	if (/(^|\.)types?\./.test(name) || folders.includes('types')) return 'types'
	if (/(^|\.)constants?\./.test(name) || folders.includes('constants')) return 'constants'
	if (/\.config\.[cm]?tsx?$/.test(name)) return 'config'
	return 'implementation'
}

/** A `let` given a function first and another one later: a variable, not a function declaration. */
function isReassignedLet(params: {
	declaration: ts.VariableDeclaration
	sourceFile: ts.SourceFile
}): boolean {
	const { declaration, sourceFile } = params
	const list = declaration.parent
	if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Let)) return false
	const name = declaration.name.getText(sourceFile)
	function assigns(node: ts.Node): boolean {
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(node.left) &&
			node.left.text === name
		)
			return true
		return ts.forEachChild(node, assigns) ?? false
	}
	return assigns(sourceFile)
}

function compareFindings(left: RuleFinding, right: RuleFinding): number {
	return (
		left.line - right.line ||
		left.column - right.column ||
		RULE_NAMES.indexOf(left.rule) - RULE_NAMES.indexOf(right.rule)
	)
}

/** The name a declaration introduces in this file: a variable, a parameter, a function. */
function declaredNameOf(node: ts.Node): ts.Identifier | undefined {
	if (
		(ts.isVariableDeclaration(node) ||
			ts.isParameter(node) ||
			ts.isBindingElement(node) ||
			ts.isFunctionDeclaration(node)) &&
		node.name &&
		ts.isIdentifier(node.name)
	)
		return node.name
	return undefined
}

/** The full word to write instead, or undefined when the name is made of full words. */
function abbreviationIn(name: string): string | undefined {
	if (name.startsWith('_')) return undefined
	if (name.length === 1) return 'a word that says what it holds'
	for (const word of name.split(/_|(?=[A-Z])/)) {
		const fullWord = Object.hasOwn(ABBREVIATIONS, word.toLowerCase())
			? ABBREVIATIONS[word.toLowerCase()]
			: undefined
		if (fullWord) return `\`${fullWord}\` for \`${word}\``
	}
	return undefined
}

/**
 * Parameters a caller passes by position, the leading query or transaction left out; none for a
 * symmetric pair.
 */
function positionalParameterCount(parameters: ts.NodeArray<ts.ParameterDeclaration>): number {
	const [first, second] = parameters
	const leading =
		first && ts.isIdentifier(first.name) && LEADING_POSITIONAL_PARAMETERS.includes(first.name.text)
	// a symmetric pair of the same type (`compare(left, right)`) reads the same either way
	const symmetric =
		parameters.length === 2 &&
		first.type !== undefined &&
		first.type.getText() === second.type?.getText()
	return symmetric ? 0 : parameters.length - (leading ? 1 : 0)
}

/** Up to the enclosing statement or function: is the node part of a call's arguments? */
function isInsideAnArgument(node: ts.Node): boolean {
	let child = node
	let parent = node.parent
	while (parent && !ts.isStatement(parent) && !ts.isFunctionLike(parent)) {
		if (
			(ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
			parent.arguments?.some((argument) => argument === child)
		)
			return true
		child = parent
		parent = parent.parent
	}
	return false
}

/**
 * An object made only of references to other bindings (`{ cleanUp, info: infoModule }`), like a
 * dialecte's registry of extension modules: it assembles what is declared elsewhere, it holds no value.
 */
function isModuleRegistry(initializer: ts.Expression | undefined): boolean {
	return (
		initializer !== undefined &&
		ts.isObjectLiteralExpression(initializer) &&
		initializer.properties.length > 0 &&
		initializer.properties.every(
			(property) =>
				ts.isShorthandPropertyAssignment(property) ||
				(ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)),
		)
	)
}

function isExported(declaration: ts.TypeAliasDeclaration | ts.InterfaceDeclaration): boolean {
	return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0
}
