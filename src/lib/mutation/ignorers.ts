import {
	ASSERT_NEVER_NAME,
	ERROR_CLASS_NAME,
	ERROR_TEXT_REASON,
	ERROR_WORDING_PROPERTIES,
	EXHAUSTIVE_DEFAULT_REASON,
	IGNORER_ERROR_TEXT,
	IGNORER_EXHAUSTIVE_DEFAULT,
	STRYKER_VALIDATION_SCHEMA,
} from './mutation.constants.ts'

import type {
	IgnorerFactory,
	IgnorerOptions,
	IgnorerReasonOf,
	StrykerIgnorerPlugin,
} from './mutation.types.ts'
import type { NodePath } from '@babel/traverse'

/**
 * Why Stryker should skip a path, or `undefined` to keep it mutable: error wording (a string or template thrown bare,
 * a direct string or template argument of `new <Name>Error(...)`, and any string or template under a `detail`,
 * `message` or `reason` property of a throw, a `new <Name>Error(...)` or a call to one of `errorFactories`) and the
 * body of an exhaustive `default:` arm. Keys, codes and meta strings stay mutable. Reach for it to test the ignore
 * rules directly; Stryker itself loads them through `strykerPlugins`.
 */
export function ignoreReason(params: {
	path: NodePath
	errorFactories: readonly string[]
}): string | undefined {
	return errorTextReason(params) ?? exhaustiveDefaultReason({ path: params.path })
}

function errorTextReason(params: {
	path: NodePath
	errorFactories: readonly string[]
}): string | undefined {
	const { path, errorFactories } = params
	if (!path.isStringLiteral() && !path.isTemplateLiteral()) return undefined
	const isWording =
		isThrownBare({ path }) ||
		isErrorClassArgument({ path }) ||
		isUnderWordingProperty({ path, errorFactories })
	return isWording ? ERROR_TEXT_REASON : undefined
}

function isThrownBare(params: { path: NodePath }): boolean {
	return params.path.parent.type === 'ThrowStatement'
}

function isErrorClassArgument(params: { path: NodePath }): boolean {
	const { path } = params
	return path.listKey === 'arguments' && isErrorClassConstruction({ node: path.parent })
}

function isErrorClassConstruction(params: { node: NodePath['node'] }): boolean {
	const { node } = params
	return (
		node.type === 'NewExpression' &&
		node.callee.type === 'Identifier' &&
		ERROR_CLASS_NAME.test(node.callee.name)
	)
}

/** A string or template under a `detail` / `message` / `reason` property that sits in an error construction. */
function isUnderWordingProperty(params: {
	path: NodePath
	errorFactories: readonly string[]
}): boolean {
	const { path, errorFactories } = params
	const property = path.findParent(
		(ancestor) =>
			ancestor.isObjectProperty() && ERROR_WORDING_PROPERTIES.has(propertyName(ancestor)),
	)
	return property !== null && isInsideErrorConstruction({ path: property, errorFactories })
}

function propertyName(path: NodePath): string {
	const { node } = path
	if (node.type !== 'ObjectProperty' || node.computed) return ''
	if (node.key.type === 'Identifier') return node.key.name
	return node.key.type === 'StringLiteral' ? node.key.value : ''
}

function isInsideErrorConstruction(params: {
	path: NodePath
	errorFactories: readonly string[]
}): boolean {
	const { path, errorFactories } = params
	return (
		path.findParent((ancestor) => {
			const { node } = ancestor
			if (node.type === 'ThrowStatement') return true
			if (isErrorClassConstruction({ node })) return true
			return (
				node.type === 'CallExpression' &&
				node.callee.type === 'Identifier' &&
				errorFactories.includes(node.callee.name)
			)
		}) !== null
	)
}

/** The arm's own statements only: a nested function or switch holds another arm's evidence, not this one's. */
function exhaustiveDefaultReason(params: { path: NodePath }): string | undefined {
	const { path } = params
	if (!path.isSwitchCase() || path.node.test !== null) return undefined
	let exhaustive = false
	path.traverse({
		Function(inner) {
			inner.skip()
		},
		SwitchStatement(inner) {
			inner.skip()
		},
		TSSatisfiesExpression(inner) {
			if (inner.node.typeAnnotation.type === 'TSNeverKeyword') {
				exhaustive = true
				inner.stop()
			}
		},
		CallExpression(inner) {
			const { callee } = inner.node
			if (callee.type === 'Identifier' && callee.name === ASSERT_NEVER_NAME) {
				exhaustive = true
				inner.stop()
			}
		},
	})
	return exhaustive ? EXHAUSTIVE_DEFAULT_REASON : undefined
}

function ignorerPlugin(params: { name: string; reasonOf: IgnorerReasonOf }): StrykerIgnorerPlugin {
	const { name, reasonOf } = params
	const factory: IgnorerFactory = Object.assign(
		function createIgnorer(options: IgnorerOptions) {
			const errorFactories = options.dialecteMutation?.errorFactories ?? []
			return {
				shouldIgnore: (path: never): string | undefined =>
					reasonOf({ path: path as NodePath, errorFactories }),
			}
		},
		{ inject: ['options'] as const },
	)
	return { kind: 'Ignore', name, factory }
}

/** The plugins Stryker loads from this module: the two Ignore rules, error text and exhaustive default. */
export const strykerPlugins: readonly StrykerIgnorerPlugin[] = [
	ignorerPlugin({ name: IGNORER_ERROR_TEXT, reasonOf: errorTextReason }),
	ignorerPlugin({ name: IGNORER_EXHAUSTIVE_DEFAULT, reasonOf: exhaustiveDefaultReason }),
]

/** The schema of the `dialecteMutation` option, which Stryker merges into its own so the option is not reported unknown. */
export const strykerValidationSchema = STRYKER_VALIDATION_SCHEMA
