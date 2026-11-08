/**
 * The steps of `dialecte gate`: the package's `"dialecte": { "gate" }`, or the defaults; `--full` adds the
 * steps derived from the package's scripts (`DERIVED_STEPS`) that no step runs already.
 */
import {
	DEFAULT_GATE_STEPS,
	DERIVED_STEPS,
	NO_NPM_SCRIPT_REASON,
	NPM_RUN_PATTERN,
} from './gate-config.constants.ts'
import { renderStepLine } from './step-line.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { GateMode } from './gate.types.ts'

export function resolveGateSteps(params: { packageJson: PackageJson; mode: GateMode }): GateStep[] {
	const steps = [
		...(params.packageJson.dialecte?.gate?.[params.mode] ?? DEFAULT_GATE_STEPS[params.mode]),
	]
	return params.mode === 'full'
		? [...steps, ...derivedSteps({ packageJson: params.packageJson, steps }).added]
		: steps
}

/**
 * The derived steps for these steps: those whose npm script the package has and no step runs already
 * (`added`), and those whose script it lacks (`absent`: the gate and contrib say so in one skip line, never a
 * step, so a package without the script keeps its rows and records).
 */
export function derivedSteps(params: {
	packageJson: PackageJson
	steps: readonly { run?: string }[]
}): { added: GateStep[]; absent: GateStep[] } {
	const running = new Set(params.steps.map((step) => npmScriptOf(step.run)))
	/** The package has the script the step runs (as `runGateSteps` reads it: a script with a command). */
	function hasScript(step: GateStep): boolean {
		const script = npmScriptOf(step.run)
		return script !== undefined && Boolean(params.packageJson.scripts?.[script])
	}
	const derived = DERIVED_STEPS.filter((step) => !running.has(npmScriptOf(step.run)))
	return {
		added: derived.filter(hasScript),
		absent: derived.filter((step) => !hasScript(step)),
	}
}

/** The skip line of each derived step the package has no script for: said, never a step nor a row. */
export function renderAbsentDerivedLines(params: {
	packageJson: PackageJson
	steps: readonly { run?: string }[]
}): string[] {
	return derivedSteps(params).absent.map(function skipLine(step) {
		return renderStepLine({
			step,
			status: 'skipped',
			counts: {},
			restored: [],
			reason: NO_NPM_SCRIPT_REASON.replace('{script}', npmScriptOf(step.run) ?? step.run),
		})
	})
}

/** The npm script a step's command runs (`npm run <script>` at its start), or undefined. */
function npmScriptOf(run: string | undefined): string | undefined {
	return run === undefined ? undefined : NPM_RUN_PATTERN.exec(run)?.[1]
}
