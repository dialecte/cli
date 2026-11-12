/**
 * The steps of a resolved list that do not run as listed: an opted-out step, and a step that runs an npm script the
 * package lacks, judged all at once before any step runs.
 */
import {
	DECLARED_NOT_WIRED_REASON,
	GATE_SKIP_LABEL,
	NOT_WIRED_REASON,
	OPTED_OUT_REASON,
	UNWIRED_FIX_LINE,
	UNWIRED_OPT_OUT_REASON,
} from './gate-config.constants.ts'
import { missingNpmScriptOf } from './gate-config.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'

/**
 * The result of every step of `steps` that is opted out (`skipped`, `optedOut`) or unwired (its `run` is
 * `npm run <script>` and the package has no such script; `unwired: true`): a declared step `failed` in every mode,
 * a default step `failed` when `failDefault` (a line under it says how to fix it: add the script or opt out under
 * `skipLabel`), else `skipped`. A step that runs as listed is absent from the map.
 */
export function findUnwiredSteps(params: {
	steps: readonly GateStep[]
	packageJson: PackageJson
	failDefault: boolean
	/** The opt-out key of the run: `dialecte.gate.skip` (the default) or `dialecte.contrib.skip`. */
	skipLabel?: string
}): Map<GateStep, StepResult> {
	const judged = new Map<GateStep, StepResult>()
	for (const step of params.steps) {
		const result = judgeWiring({
			step,
			packageJson: params.packageJson,
			failDefault: params.failDefault,
			skipLabel: params.skipLabel ?? GATE_SKIP_LABEL,
		})
		if (result) judged.set(step, result)
	}
	return judged
}

/** The result of one step that does not run as listed (`findUnwiredSteps`), or undefined when it runs. */
function judgeWiring(params: {
	step: GateStep
	packageJson: PackageJson
	failDefault: boolean
	skipLabel: string
}): StepResult | undefined {
	const { step } = params
	const unrun = { step, counts: {}, restored: [] }
	// an opted-out step is opted out only, its script there or not
	const { optedOut } = step
	if (optedOut !== undefined)
		return {
			...unrun,
			status: 'skipped',
			// the package's own words, taken as they are (a `$` in them is no replacement pattern)
			reason: OPTED_OUT_REASON.replace('{reason}', () => optedOut),
			optedOut,
		}
	const script = missingNpmScriptOf({ step, packageJson: params.packageJson })
	if (script === undefined) return undefined
	if (step.isDefault !== true)
		return {
			...unrun,
			status: 'failed',
			reason: DECLARED_NOT_WIRED_REASON.replace('{script}', script),
			unwired: true,
		}
	if (!params.failDefault)
		return {
			...unrun,
			status: 'skipped',
			reason: NOT_WIRED_REASON.replace('{script}', () => script),
			unwired: true,
		}
	return {
		...unrun,
		status: 'failed',
		reason: NOT_WIRED_REASON.replace('{script}', () => script),
		unwired: true,
		details: [
			UNWIRED_FIX_LINE.replace('{label}', () => params.skipLabel).replace('{optOut}', () =>
				optOutEntryOf({ skipLabel: params.skipLabel, name: step.name }),
			),
		],
	}
}

/**
 * The package.json entry opting `name` out under `skipLabel`, one object per part of the label:
 * `"dialecte": { "gate": { "skip": { "skills": "<reason>" } } }`.
 */
function optOutEntryOf(params: { skipLabel: string; name: string }): string {
	let entry = `${JSON.stringify(params.name)}: ${JSON.stringify(UNWIRED_OPT_OUT_REASON)}`
	for (const key of params.skipLabel.split('.').reverse())
		entry = `${JSON.stringify(key)}: { ${entry} }`
	return entry
}
