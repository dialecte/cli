/** Plan tags and standard citations in the files (evals and fixtures included) and messages of the lots. */
import { join } from 'node:path'

import { findReferences, isReferenceChecked } from '../rules/committed-text.ts'
import { readCommittedBytes } from './committed-bytes.ts'
import { BINARY_PROBE_LENGTH } from './handover.constants.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'
import type { ResolvedLot } from './handover.types.ts'

/** One line per reference found: `<file>:<line>: <label> \`<text>\`` or `lot <n> message, line <l>: ...`. */
export function findLotReferences(params: {
	root: string
	lots: readonly ResolvedLot[]
	referencePatterns: readonly ReferencePattern[]
}): string[] {
	const { root, referencePatterns } = params
	const found: string[] = []
	for (const [index, lot] of params.lots.entries()) {
		for (const reference of findReferences({ text: lot.message, patterns: referencePatterns }))
			found.push(
				`lot ${index + 1} message, line ${reference.line}: ${reference.label} \`${reference.text}\``,
			)
		for (const file of lot.files) {
			const content = readCommittedBytes(join(root, file))
			if (isBinary(content) || !isReferenceChecked(file)) continue
			for (const reference of findReferences({
				text: content.toString('utf8'),
				patterns: referencePatterns,
			}))
				found.push(`${file}:${reference.line}: ${reference.label} \`${reference.text}\``)
		}
	}
	return found
}

/** As `grep -I` decides: a NUL byte near the start makes a file binary. */
function isBinary(content: Buffer): boolean {
	return content.subarray(0, BINARY_PROBE_LENGTH).includes(0)
}
