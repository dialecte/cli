import {
	MUTATION_DECLARATION_KEYS,
	MUTATION_FAST_KEYS,
	MUTATION_FULL_KEYS,
	UNSUPPORTED_GLOB_SYNTAX,
} from './mutation.constants.ts'

import type { MutationDeclaration, MutationDeclarationResult } from './mutation.types.ts'

/**
 * A package's `dialecte.mutation` declaration, read and checked: `none` when the package declares nothing,
 * `declared` with `exclude` and `errorFactories` defaulted, or `invalid` with a reason naming the field at fault.
 * Reach for it before building anything from a package's mutation scope.
 */
export function readMutationDeclaration(params: {
	packageJson: Readonly<Record<string, unknown>>
}): MutationDeclarationResult {
	const dialecte = params.packageJson['dialecte']
	const raw = isRecord(dialecte) ? dialecte['mutation'] : undefined
	if (raw === undefined) return { kind: 'none' }
	if (!isRecord(raw)) return invalid('dialecte.mutation must be an object')

	const unknown = unknownKey({ value: raw, known: MUTATION_DECLARATION_KEYS })
	if (unknown !== undefined)
		return invalid(unknownKeyReason({ path: '', key: unknown, known: MUTATION_DECLARATION_KEYS }))

	const { scope, exclude, errorFactories, fast, full } = raw
	if (!isStringList(scope) || scope.length === 0)
		return invalid('dialecte.mutation.scope must be a non-empty array of strings')
	if (exclude !== undefined && !isStringList(exclude))
		return invalid('dialecte.mutation.exclude must be an array of strings')
	if (errorFactories !== undefined && !isStringList(errorFactories))
		return invalid('dialecte.mutation.errorFactories must be an array of strings')
	const badGlob = [
		...scope.map((glob) => ({ field: 'scope', glob })),
		...(exclude ?? []).map((glob) => ({ field: 'exclude', glob })),
	].find(({ glob }) => UNSUPPORTED_GLOB_SYNTAX.test(glob))
	if (badGlob !== undefined)
		return invalid(
			`dialecte.mutation.${badGlob.field} glob "${badGlob.glob}" uses unsupported syntax: globs read \`*\` as one segment and \`**\` as crossing segments; no braces, classes or extglobs`,
		)
	if (!isRecord(fast) || !isNonEmptyString(fast['vitestConfig']))
		return invalid('dialecte.mutation.fast.vitestConfig must be a non-empty string')
	const unknownFast = unknownKey({ value: fast, known: MUTATION_FAST_KEYS })
	if (unknownFast !== undefined)
		return invalid(unknownKeyReason({ path: 'fast', key: unknownFast, known: MUTATION_FAST_KEYS }))
	if (full !== undefined && (!isRecord(full) || !isNonEmptyString(full['command'])))
		return invalid('dialecte.mutation.full.command must be a non-empty string')
	const unknownFull = isRecord(full)
		? unknownKey({ value: full, known: MUTATION_FULL_KEYS })
		: undefined
	if (unknownFull !== undefined)
		return invalid(unknownKeyReason({ path: 'full', key: unknownFull, known: MUTATION_FULL_KEYS }))

	const declaration: MutationDeclaration = {
		scope,
		exclude: exclude ?? [],
		errorFactories: errorFactories ?? [],
		fast: { vitestConfig: fast['vitestConfig'] },
		...(isRecord(full) ? { full: { command: full['command'] as string } } : {}),
	}
	return { kind: 'declared', declaration }
}

function unknownKey(params: {
	value: Record<string, unknown>
	known: readonly string[]
}): string | undefined {
	return Object.keys(params.value).find((key) => !params.known.includes(key))
}

function unknownKeyReason(params: { path: string; key: string; known: readonly string[] }): string {
	const { path, key, known } = params
	const where = path === '' ? 'dialecte.mutation' : `dialecte.mutation.${path}`
	return `${where} has an unknown key "${key}" (known keys: ${known.join(', ')})`
}

function invalid(reason: string): MutationDeclarationResult {
	return { kind: 'invalid', reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value !== ''
}
