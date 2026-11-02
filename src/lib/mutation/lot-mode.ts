/** The per-lot mutation switch: `.dialecte/lot.json` `"mutation"`, and the mode a run follows from it. */
import { join } from 'node:path'

import { readLotDeclaration } from '../tdd/lot-declaration.ts'
import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { MUTATION_MODES } from './mutation.constants.ts'

import type { MutationMode, MutationModeSetting } from './mutation.types.ts'

/**
 * What the lot declaration at the package `root` says about mutation: `default` when the file or its `mutation`
 * key is absent, the mode it names, or `invalid` with a reason: one naming the four modes for a value no mode is,
 * the lot file's own reading failure (not JSON, not an object, an unknown key) when the file cannot be read.
 */
export function readMutationMode(params: { root: string }): MutationModeSetting {
	const declaration = readLotDeclaration(join(params.root, LOT_FILE))
	if ('failure' in declaration) return { kind: 'invalid', reason: declaration.failure }
	const { mutation } = declaration
	if (mutation === undefined) return { kind: 'default' }
	const mode = MUTATION_MODES.find((known) => known === mutation)
	return mode
		? { kind: mode }
		: {
				kind: 'invalid',
				reason: `${LOT_FILE}: "mutation" must be one of ${MUTATION_MODES.join(', ')}, not ${JSON.stringify(mutation)}`,
			}
}

/** The mode a run follows: `default` is `changed` when the lot's diff touches the scope, else `off`. */
export function effectiveMode(params: {
	mode: Exclude<MutationModeSetting, { kind: 'invalid' }>
	touchesScope: boolean
}): MutationMode {
	const { mode, touchesScope } = params
	if (mode.kind !== 'default') return mode.kind
	return touchesScope ? 'changed' : 'off'
}
