/**
 * The data-only error classes of a file: an error class (it extends `Error`, a base named `*Error`, or another
 * data-only error of the file) whose body holds only fields, index signatures and a constructor that builds them. A
 * field or a constructor assignment holds data only: no function, method, class, call or `new` anywhere in its value,
 * and every name in it told data here, a parameter by its declared type, a local by what it holds, a module name by
 * its declaration. A name the file cannot tell (an import, a global) is not data.
 */
import { ERROR_BASE_PATTERN } from './check-class-rules.constants.ts'
import { classNameOf } from './class-name.ts'
import { ALWAYS_DATA_NAMES, FUNCTION_TYPE_NAMES } from './data-only-errors.constants.ts'
import { bindingNamesOf, childNodesOf, isFunctionNode } from './syntax-nodes.ts'

import ts from 'typescript'

import type { ValueContext } from './data-only-errors.types.ts'

/** The data-only error classes among a file's classes. */
export function dataOnlyErrorClassesOf(
	classes: readonly ts.ClassLikeDeclaration[],
): ReadonlySet<ts.ClassLikeDeclaration> {
	const dataOnly = classes.filter(isDataOnly)
	const errorNames = new Set<string>()
	const errors = new Set<ts.ClassLikeDeclaration>()
	// a base declared later in the file is known once its own base is: repeat until nothing is added
	for (let added = true; added;) {
		added = false
		for (const node of dataOnly) {
			const base = baseNameOf(node)
			if (errors.has(node) || base === undefined) continue
			if (!ERROR_BASE_PATTERN.test(base) && !errorNames.has(base)) continue
			errors.add(node)
			errorNames.add(classNameOf(node))
			added = true
		}
	}
	return errors
}

/** The name the class extends (`Error`, `errors.Refusal` → `Refusal`); undefined when it extends nothing named. */
function baseNameOf(node: ts.ClassLikeDeclaration): string | undefined {
	const clause = (node.heritageClauses ?? []).find(
		(candidate) => candidate.token === ts.SyntaxKind.ExtendsKeyword,
	)
	const base = clause?.types[0]?.expression
	if (base === undefined) return undefined
	if (ts.isIdentifier(base)) return base.text
	return ts.isPropertyAccessExpression(base) ? base.name.text : undefined
}

/** Only fields holding data, index signatures, and a constructor made of `super(…)`, data locals and data fields. */
function isDataOnly(node: ts.ClassLikeDeclaration): boolean {
	const sourceFile = node.getSourceFile()
	const moduleContext: ValueContext = {
		sourceFile,
		parameters: new Map(),
		locals: new Map(),
		judging: new Set(),
	}
	return node.members.every((member) => {
		if (ts.isPropertyDeclaration(member))
			return (
				member.initializer === undefined ||
				isDataValue({ expression: member.initializer, context: moduleContext })
			)
		if (ts.isConstructorDeclaration(member)) {
			const context = constructorContextOf({ member, sourceFile })
			return (member.body?.statements ?? []).every((statement) =>
				isBuildingStatement({ statement, context }),
			)
		}
		return ts.isIndexSignatureDeclaration(member) || ts.isSemicolonClassElement(member)
	})
}

function constructorContextOf(params: {
	member: ts.ConstructorDeclaration
	sourceFile: ts.SourceFile
}): ValueContext {
	const { member, sourceFile } = params
	const parameters = new Map<string, ts.TypeNode | undefined>()
	for (const parameter of member.parameters)
		for (const name of bindingNamesOf(parameter.name)) parameters.set(name, parameter.type)
	const locals = new Map<string, ts.Expression>()
	for (const statement of member.body?.statements ?? [])
		if (ts.isVariableStatement(statement))
			for (const declaration of statement.declarationList.declarations)
				if (declaration.initializer)
					for (const name of bindingNamesOf(declaration.name))
						locals.set(name, declaration.initializer)
	return { sourceFile, parameters, locals, judging: new Set() }
}

/** `super(…)`, a local holding data, or `this.<field> = <data>`. */
function isBuildingStatement(params: { statement: ts.Statement; context: ValueContext }): boolean {
	const { statement, context } = params
	if (ts.isVariableStatement(statement))
		return statement.declarationList.declarations.every(
			(declaration) =>
				declaration.initializer === undefined ||
				isDataValue({ expression: declaration.initializer, context }),
		)
	if (!ts.isExpressionStatement(statement)) return false
	const expression = statement.expression
	if (ts.isCallExpression(expression))
		return expression.expression.kind === ts.SyntaxKind.SuperKeyword
	return (
		ts.isBinaryExpression(expression) &&
		expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		ts.isPropertyAccessExpression(expression.left) &&
		expression.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
		isDataValue({ expression: expression.right, context })
	)
}

/** No function, method, class, call or `new` in the value, and each name in it told data. */
function isDataValue(params: { expression: ts.Node; context: ValueContext }): boolean {
	const { expression: node, context } = params
	if (
		isFunctionNode(node) ||
		ts.isClassExpression(node) ||
		ts.isCallExpression(node) ||
		ts.isNewExpression(node) ||
		ts.isTaggedTemplateExpression(node)
	)
		return false
	if (ts.isIdentifier(node)) return isDataName({ name: node.text, context })
	if (ts.isShorthandPropertyAssignment(node)) return isDataName({ name: node.name.text, context })
	// a property's name or key is no value: only what it is read from, or what it holds
	if (ts.isPropertyAccessExpression(node))
		return isDataValue({ expression: node.expression, context })
	if (ts.isPropertyAssignment(node)) return isDataValue({ expression: node.initializer, context })
	return childNodesOf(node)
		.filter((child) => !ts.isTypeNode(child))
		.every((child) => isDataValue({ expression: child, context }))
}

/** A parameter by its declared type, a local or module const by what it holds, an enum; else not told data. */
function isDataName(params: { name: string; context: ValueContext }): boolean {
	const { name, context } = params
	if (ALWAYS_DATA_NAMES.includes(name)) return true
	if (context.judging.has(name)) return false
	const judging = new Set([...context.judging, name])
	if (context.parameters.has(name)) {
		const type = context.parameters.get(name)
		return type !== undefined && isDataType({ type, sourceFile: context.sourceFile })
	}
	const local = context.locals.get(name)
	if (local !== undefined)
		return isDataValue({ expression: local, context: { ...context, judging } })
	const declared = moduleValueOf({ sourceFile: context.sourceFile, name })
	if (declared === 'enum') return true
	return (
		declared !== undefined &&
		isDataValue({
			expression: declared,
			context: {
				sourceFile: context.sourceFile,
				parameters: new Map(),
				locals: new Map(),
				judging,
			},
		})
	)
}

/** What a module-level name holds: a const's initializer, `enum` for an enum; undefined for anything else. */
function moduleValueOf(params: {
	sourceFile: ts.SourceFile
	name: string
}): ts.Expression | 'enum' | undefined {
	for (const statement of params.sourceFile.statements) {
		if (ts.isEnumDeclaration(statement) && statement.name.text === params.name) return 'enum'
		if (!ts.isVariableStatement(statement)) continue
		if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue
		for (const declaration of statement.declarationList.declarations)
			if (ts.isIdentifier(declaration.name) && declaration.name.text === params.name)
				return declaration.initializer
	}
	return undefined
}

/**
 * A declared type holds no function: no function or constructor type, no call or method signature, no type named a
 * function; an alias of the module is followed, a type named from elsewhere is taken as data (its declaration is not
 * in this file).
 */
function isDataType(params: {
	type: ts.TypeNode
	sourceFile: ts.SourceFile
	seen?: ReadonlySet<string>
}): boolean {
	const { type } = params
	if (ts.isFunctionTypeNode(type) || ts.isConstructorTypeNode(type)) return false
	if (ts.isTypeLiteralNode(type))
		return type.members.every(
			(member) =>
				(ts.isPropertySignature(member) || ts.isIndexSignatureDeclaration(member)) &&
				(member.type === undefined || isDataType({ ...params, type: member.type })),
		)
	if (ts.isTypeReferenceNode(type)) return isDataReference({ ...params, type })
	return childNodesOf(type)
		.filter((child): child is ts.TypeNode => ts.isTypeNode(child))
		.every((child) => isDataType({ ...params, type: child }))
}

function isDataReference(params: {
	type: ts.TypeReferenceNode
	sourceFile: ts.SourceFile
	seen?: ReadonlySet<string>
}): boolean {
	const { type, sourceFile } = params
	const name = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.right.text
	if (FUNCTION_TYPE_NAMES.includes(name)) return false
	const argumentsData = (type.typeArguments ?? []).every((argument) =>
		isDataType({ ...params, type: argument }),
	)
	if (!argumentsData || params.seen?.has(name)) return argumentsData
	const alias = sourceFile.statements.find(
		(statement): statement is ts.TypeAliasDeclaration =>
			ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
	)
	if (alias === undefined) return true
	return isDataType({ type: alias.type, sourceFile, seen: new Set([...(params.seen ?? []), name]) })
}
