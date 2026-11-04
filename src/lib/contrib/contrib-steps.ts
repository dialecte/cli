/** The rows of `dialecte contrib`: the built-in ones around the package's steps. */
import {
	CONTRIB_BUILTIN_STEPS,
	DEFAULT_CONTRIB_STEPS,
	INVALID_CONTRIB_STEPS,
} from './contrib.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ContribStep } from './contrib.types.ts'

/**
 * `rules`, then `dialecte.contrib.steps` (the default docs and type bench when not declared), then `release`; a
 * `dialecte.contrib.steps` that is no list throws.
 */
export function resolveContribSteps(params: { packageJson: PackageJson }): ContribStep[] {
	const declared = params.packageJson.dialecte?.contrib?.steps
	if (declared !== undefined && !Array.isArray(declared)) throw new Error(INVALID_CONTRIB_STEPS)
	return [
		CONTRIB_BUILTIN_STEPS.first,
		...(declared ?? DEFAULT_CONTRIB_STEPS),
		CONTRIB_BUILTIN_STEPS.last,
	]
}
