/** The steps of `dialecte gate`: the package's `"dialecte": { "gate" }`, or the defaults. */
import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { GateMode } from './gate.types.ts'

export function resolveGateSteps(params: { packageJson: PackageJson; mode: GateMode }): GateStep[] {
	return [...(params.packageJson.dialecte?.gate?.[params.mode] ?? DEFAULT_GATE_STEPS[params.mode])]
}
