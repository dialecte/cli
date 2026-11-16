/**
 * A test file's own code: every statement at its top level and in the bodies of its `describe` / `suite` calls,
 * except the imports (and `export ... from`), which the dependency check covers, and the test calls themselves, whose
 * bodies the case hash covers. A moved case carries its red only when its new file's own code is a subset of what its
 * earlier file held at that red: a split may drop statements, never add or change one.
 */
import { hashText } from './tdd-files.ts'
import { SUITE_FUNCTIONS, TEST_FUNCTIONS } from './tdd.constants.ts'
import { testCodeTokens } from './test-code-tokens.ts'
import { rootIdentifierOf, scriptKindOf } from './test-source.ts'

import ts from 'typescript'

import type { OwnCodeStatement } from './tdd.types.ts'

/** The file's own code statements, in order, each with its text and the hash of its tokens. */
export function listOwnCode(params: { text: string; file: string }): OwnCodeStatement[] {
	const source = ts.createSourceFile(
		'own.tsx',
		params.text,
		ts.ScriptTarget.Latest,
		true,
		scriptKindOf(params.file),
	)
	const statements: OwnCodeStatement[] = []
	/** The statements of a block, recursing into the bodies of its suite calls. */
	function collect(block: readonly ts.Statement[]): void {
		for (const statement of block) {
			if (isImportLike(statement)) continue
			const call = structureCallOf(statement)
			if (call === undefined) {
				const text = statement.getText(source)
				statements.push({ text, hash: hashText(testCodeTokens({ text, file: params.file })) })
				continue
			}
			if (!SUITE_FUNCTIONS.includes(rootOfCall(call) ?? '')) continue
			for (const argument of call.arguments)
				if (
					(ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) &&
					ts.isBlock(argument.body)
				)
					collect(argument.body.statements)
		}
	}
	collect(source.statements)
	return statements
}

/** An import, or a re-export from a module: what the file reads, not code it holds. */
function isImportLike(statement: ts.Statement): boolean {
	return (
		ts.isImportDeclaration(statement) ||
		ts.isImportEqualsDeclaration(statement) ||
		(ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)
	)
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
