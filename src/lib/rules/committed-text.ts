/** Plan tags and standard citations in committed text, found line by line. */
import { readPackageJson } from '../package-json.ts'
import {
	GENERIC_REFERENCE_PATTERNS,
	REFERENCE_FREE_EXTENSIONS,
} from './committed-text.constants.ts'

import type { ReferenceMatch, ReferencePattern } from './committed-text.types.ts'

export function findReferences(params: {
	text: string
	patterns: readonly ReferencePattern[]
}): ReferenceMatch[] {
	const expressions = params.patterns.map((pattern) => ({
		label: pattern.label,
		expression: new RegExp(pattern.source, 'g'),
		leadingBoundary: pattern.leadingBoundary ?? false,
	}))
	const matches: ReferenceMatch[] = []
	for (const [index, line] of params.text.split(/\r?\n/).entries())
		for (const { label, expression, leadingBoundary } of expressions)
			for (const match of line.matchAll(expression)) {
				// the boundary character before the reference is not part of it
				const skipped = leadingBoundary ? (match[1]?.length ?? 0) : 0
				matches.push({
					line: index + 1,
					column: match.index + skipped + 1,
					text: match[0].slice(skipped),
					label,
				})
			}
	return matches.sort((left, right) => left.line - right.line || left.column - right.column)
}

/**
 * The generic patterns but those the package allows (`"dialecte": { "allowReferences" }`), then those it declares
 * (`"dialecte": { "referencePatterns" }`). Allowing a pattern that is not allowable (a citation of a standard) throws.
 */
export function readReferencePatterns(root: string): ReferencePattern[] {
	const packageJson = readPackageJson(root)
	const declared = packageJson.dialecte?.referencePatterns ?? []
	const allowed = packageJson.dialecte?.allowReferences ?? []
	if (!Array.isArray(allowed) || allowed.some((label) => typeof label !== 'string'))
		throw new Error('dialecte.allowReferences: a list of labels, such as ["ticket number"]')
	const allowable = GENERIC_REFERENCE_PATTERNS.filter((pattern) => pattern.allowable).map(
		(pattern) => pattern.label,
	)
	const refused = allowed.filter((label) => !allowable.includes(label))
	if (refused.length)
		throw new Error(
			`dialecte.allowReferences: ${refused.join(', ')} can never be allowed (only a tag can); allowable: ${allowable.join(', ')}`,
		)
	return [
		...GENERIC_REFERENCE_PATTERNS.filter((pattern) => !allowed.includes(pattern.label)),
		...declared.map((source) => ({
			label: `reference declared by ${packageJson.name ?? 'the package'}`,
			source,
		})),
	]
}

/** Whether references are looked for in the file: not in style and image files, where a `#` number is a colour. */
export function isReferenceChecked(file: string): boolean {
	const extension = file.split('.').at(-1)?.toLowerCase() ?? ''
	return !REFERENCE_FREE_EXTENSIONS.includes(extension)
}
