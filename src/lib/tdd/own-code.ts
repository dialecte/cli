/**
 * A test file's own code: every statement at its top level and in the bodies of its `describe` / `suite` calls, each in
 * its scope (the titles of the suites holding it), the imports by what they resolve to and bind, and never the test
 * calls themselves, whose bodies the case hash covers. A moved case carries its red only when its new file's own code is a subset of what its
 * earlier file held at that red: a split may drop statements, never add or change one.
 */
import { posix, sep } from 'node:path'

import { hashText } from './tdd-files.ts'
import {
	OWN_CODE_SEPARATOR,
	SUITE_FUNCTIONS,
	TEST_FUNCTIONS,
	UNRESOLVED_TARGET_PREFIX,
} from './tdd.constants.ts'
import { testCodeTokens } from './test-code-tokens.ts'
import { rootIdentifierOf, scriptKindOf } from './test-source.ts'

import ts from 'typescript'

import type { ModuleResolver, OwnCodeStatement } from './tdd.types.ts'

/**
 * The file's own code statements, in order, each with its text and a hash of its scope (the titles of the suites
 * holding it) and its tokens; an import counts once per binding, by the file or package it resolves to
 * (`resolveTarget`) and its imported and local names, so a move may change a relative path, never what is imported.
 */
export function listOwnCode(params: {
	text: string
	file: string
	/** The file a specifier of this file resolves to (relative to the package root), or the package it names. */
	resolveTarget: (specifier: string) => string
}): OwnCodeStatement[] {
	const source = ts.createSourceFile(
		'own.tsx',
		params.text,
		ts.ScriptTarget.Latest,
		true,
		scriptKindOf(params.file),
	)
	const statements: OwnCodeStatement[] = []
	/** One statement or binding of the scope, hashed with it. */
	function add(statement: { scope: readonly string[]; text: string; identity: string }): void {
		statements.push({
			text: statement.text,
			hash: hashText([...statement.scope, statement.identity].join(OWN_CODE_SEPARATOR)),
		})
	}
	/** The statements of a block, recursing into the bodies of its suite calls. */
	function collect(level: { block: readonly ts.Statement[]; scope: readonly string[] }): void {
		const { block, scope } = level
		for (const statement of block) {
			const text = statement.getText(source)
			const imported = importIdentitiesOf({ statement, resolveTarget: params.resolveTarget })
			if (imported !== undefined) {
				for (const identity of imported) add({ scope, text, identity })
				continue
			}
			const call = structureCallOf(statement)
			if (call === undefined) {
				add({ scope, text, identity: testCodeTokens({ text, file: params.file }) })
				continue
			}
			if (!SUITE_FUNCTIONS.includes(rootOfCall(call) ?? '')) continue
			const [title] = call.arguments
			const inner = [
				...scope,
				title && ts.isStringLiteralLike(title) ? title.text : (title?.getText(source) ?? ''),
			]
			for (const argument of call.arguments)
				if (
					(ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) &&
					ts.isBlock(argument.body)
				)
					collect({ block: argument.body.statements, scope: inner })
		}
	}
	collect({ block: source.statements, scope: [] })
	return statements
}

/**
 * What an import (or a re-export from a module) reads, one identity per binding: its resolved target, its imported
 * name and its local name; a bare `import 'x'` its target alone. Undefined for any other statement.
 */
function importIdentitiesOf(params: {
	statement: ts.Statement
	resolveTarget: (specifier: string) => string
}): string[] | undefined {
	const { statement } = params
	/** The resolved target of a module specifier expression. */
	function targetOf(specifier: ts.Expression): string {
		return params.resolveTarget(
			ts.isStringLiteralLike(specifier) ? specifier.text : specifier.getText(),
		)
	}
	if (ts.isImportDeclaration(statement)) {
		const target = targetOf(statement.moduleSpecifier)
		const clause = statement.importClause
		if (clause === undefined) return [identity(['import', target])]
		const bindings = clause.namedBindings
		return [
			...(clause.name ? [identity(['import', target, 'default', clause.name.text])] : []),
			...(bindings && ts.isNamespaceImport(bindings)
				? [identity(['import', target, '*', bindings.name.text])]
				: []),
			...(bindings && ts.isNamedImports(bindings)
				? bindings.elements.map((element) =>
						identity([
							'import',
							target,
							(element.propertyName ?? element.name).text,
							element.name.text,
						]),
					)
				: []),
		]
	}
	if (ts.isImportEqualsDeclaration(statement)) {
		const reference = statement.moduleReference
		const target = ts.isExternalModuleReference(reference)
			? targetOf(reference.expression)
			: reference.getText()
		return [identity(['import', target, '=', statement.name.text])]
	}
	if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
		const target = targetOf(statement.moduleSpecifier)
		const clause = statement.exportClause
		if (clause === undefined) return [identity(['export', target, '*'])]
		if (ts.isNamespaceExport(clause)) return [identity(['export', target, '*', clause.name.text])]
		return clause.elements.map((element) =>
			identity(['export', target, (element.propertyName ?? element.name).text, element.name.text]),
		)
	}
	return undefined
}

/**
 * How the file at `from` names an import's target for its own code: the package file it resolves to (relative to the
 * root, posix), else the package it names, else the specifier as written, marked unresolved.
 */
export function targetResolverOf(params: {
	resolveModule: ModuleResolver
	from: string
}): (specifier: string) => string {
	return function resolveTarget(specifier) {
		const resolution = params.resolveModule({ specifier, from: params.from })
		if (resolution.kind === 'local') return resolution.file.split(sep).join(posix.sep)
		return resolution.kind === 'package' ? specifier : `${UNRESOLVED_TARGET_PREFIX}${specifier}`
	}
}

/** The parts of an identity in one string. */
function identity(parts: readonly string[]): string {
	return parts.join(OWN_CODE_SEPARATOR)
}

/** The test or suite call the statement is (`it(...)`, `describe.each(table)(...)`), else undefined. */
function structureCallOf(statement: ts.Statement): ts.CallExpression | undefined {
	if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
		return undefined
	const call = statement.expression
	return TEST_FUNCTIONS.includes(rootOfCall(call) ?? '') ? call : undefined
}

/** The identifier a call's callee starts from, through modifier calls (`describe.each(table)`). */
function rootOfCall(call: ts.CallExpression): string | undefined {
	let callee: ts.Expression = call.expression
	while (ts.isCallExpression(callee)) callee = callee.expression
	return rootIdentifierOf(callee)
}
