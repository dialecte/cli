/** The rows of `dialecte contrib`: the built-in ones around the package's steps. */
import {
	derivedSteps,
	markResolvedSteps,
	validateSkip,
	validateStepList,
} from '../gate/gate-config.ts'
import {
	CONTRIB_BUILTIN_STEPS,
	CONTRIB_SKIP_LABEL,
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
 * has no base) throws a `GateConfigError` (`validateStepList`), as does a `dialecte.contrib.skip` that names no
 * default step, names one the package can run, or gives no one-line reason (`validateSkip`: the default steps count
 * only while `steps` is not declared). The package steps are marked as the gate's are (`markResolvedSteps`).
 */
export function resolveContribSteps(params: { packageJson: PackageJson }): ContribStep[] {
	const { packageJson } = params
	const contrib = packageJson.dialecte?.contrib
	const declared = contrib?.steps
	if (declared !== undefined && !Array.isArray(declared)) throw new Error(INVALID_CONTRIB_STEPS)
	if (declared !== undefined)
		validateStepList({ label: CONTRIB_STEPS_LABEL, steps: declared, scopedAllowed: false })
	if (contrib?.skip !== undefined)
		validateSkip({
			label: CONTRIB_SKIP_LABEL,
			skip: contrib.skip,
			defaultSteps: declared === undefined ? DEFAULT_CONTRIB_STEPS : [],
			packageJson,
		})
	const steps = markResolvedSteps({
		steps: declared ?? DEFAULT_CONTRIB_STEPS,
		packageJson,
		isDefault: declared === undefined,
		skip: contrib?.skip,
	})
	return [
		CONTRIB_BUILTIN_STEPS.first,
		...steps,
		...derivedSteps({ packageJson, steps }).added,
		CONTRIB_BUILTIN_STEPS.last,
	]
}
