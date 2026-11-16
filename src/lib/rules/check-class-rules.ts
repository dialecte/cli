/**
 * Functional first: a class passes only as a typed public facade a package entry exports, as a store implementing an
 * interface, or as a data-only error (`class`); in any other class, a write through `this` (or an alias of it) that
 * runs after construction changes state a function would hand back (`argument-mutation`). Read on the syntax tree;
 * which classes an entry exports is given.
 */
import { CLASS_KEYWORD_PATTERN, CLASS_MESSAGE } from './check-class-rules.constants.ts'
import { classNameOf } from './class-name.ts'
import { dataOnlyErrorClassesOf } from './data-only-errors.ts'
import { childNodesOf, positionOf } from './syntax-nodes.ts'
import { thisWritesOf } from './this-writes.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'

/** The `class` findings of a file and the writes through `this` of the classes it refuses. */
export function checkClassRules(params: {
	sourceFile: ts.SourceFile
	/** The names of the file's module-level classes a package entry exports. */
	entryClasses: ReadonlySet<string>
}): QualityFinding[] {
	const { sourceFile, entryClasses } = params
	if (!CLASS_KEYWORD_PATTERN.test(sourceFile.text)) return []
	const classes = classesIn(sourceFile)
	const errorClasses = dataOnlyErrorClassesOf(classes)
	return classes.flatMap((node) => {
		const name = classNameOf(node)
		if (
			(isModuleLevel(node) && entryClasses.has(name)) ||
			implementsInterface(node) ||
			errorClasses.has(node)
		)
			return []
		return [
			{
				...positionOf({ node: node.name ?? classKeywordOf({ node, sourceFile }), sourceFile }),
				rule: 'class',
				severity: 'error',
				message: CLASS_MESSAGE.replace('{name}', name),
				functionLine: positionOf({ node: firstTokenOf(node), sourceFile }).line,
			},
			...thisWritesOf({ node, name, sourceFile }),
		]
	})
}

function classesIn(node: ts.Node): ts.ClassLikeDeclaration[] {
	const nested = childNodesOf(node).flatMap((child) => classesIn(child))
	return ts.isClassDeclaration(node) || ts.isClassExpression(node) ? [node, ...nested] : nested
}

/**
 * A statement of the module, or the class expression a module-level variable holds: the only classes an entry can
 * export, so the only ones its exported names admit (a local class of the same name is another class).
 */
function isModuleLevel(node: ts.ClassLikeDeclaration): boolean {
	if (ts.isClassDeclaration(node)) return ts.isSourceFile(node.parent)
	const holder = node.parent
	return (
		ts.isVariableDeclaration(holder) &&
		ts.isVariableDeclarationList(holder.parent) &&
		ts.isVariableStatement(holder.parent.parent) &&
		ts.isSourceFile(holder.parent.parent.parent)
	)
}

function implementsInterface(node: ts.ClassLikeDeclaration): boolean {
	return (node.heritageClauses ?? []).some(
		(clause) => clause.token === ts.SyntaxKind.ImplementsKeyword,
	)
}

/**
 * Where an opt-out on the line before applies: the declaration's first token (its `export`, after any doc comment),
 * the `const` of the variable holding a class expression.
 */
function firstTokenOf(node: ts.ClassLikeDeclaration): ts.Node {
	const holder = node.parent
	if (ts.isVariableDeclaration(holder) && ts.isVariableDeclarationList(holder.parent))
		return holder.parent
	return node
}

function classKeywordOf(params: {
	node: ts.ClassLikeDeclaration
	sourceFile: ts.SourceFile
}): ts.Node {
	const { node, sourceFile } = params
	return (
		node.getChildren(sourceFile).find((child) => child.kind === ts.SyntaxKind.ClassKeyword) ?? node
	)
}
