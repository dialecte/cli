/** The rows of `dialecte contrib`: the built-in ones around the package's steps. */
import { derivedSteps, validateStepList } from '../gate/gate-config.ts'
import {
	CONTRIB_BUILTIN_STEPS,
	CONTRIB_STEPS_LABEL,
	DEFAULT_CONTRIB_STEPS,
	INVALID_CONTRIB_STEPS,
} from './contrib.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ContribStep } from './contrib.types.ts'

/**
 * `rules`, then `dialecte.contrib.steps` (the default docs and type bench when not declared), then the steps
 * derived from the package's scripts that none of them runs (`derivedSteps`), then `release`; a
 * `dialecte.contrib.steps` that is no list throws, and an invalid step of it (a `scoped` one among them: contrib
 * has no base) throws a `GateConfigError` (`validateStepList`).
 */
export function resolveContribSteps(params: { packageJson: PackageJson }): ContribStep[] {
	const declared = params.packageJson.dialecte?.contrib?.steps
	if (declared !== undefined && !Array.isArray(declared)) throw new Error(INVALID_CONTRIB_STEPS)
	if (declared !== undefined)
		validateStepList({ label: CONTRIB_STEPS_LABEL, steps: declared, scopedAllowed: false })
	const steps = declared ?? DEFAULT_CONTRIB_STEPS
	return [
		CONTRIB_BUILTIN_STEPS.first,
		...steps,
		...derivedSteps({ packageJson: params.packageJson, steps }).added,
		CONTRIB_BUILTIN_STEPS.last,
	]
}
