/**
 * The steps of `dialecte gate`: the package's `"dialecte": { "gate" }`, or the defaults; `--full` adds the
 * steps derived from the package's scripts (`DERIVED_STEPS`) that no step runs already.
 */
import {
	BOOLEAN_STEP_FIELDS,
	DEFAULT_GATE_STEPS,
	DERIVED_STEPS,
	GATE_LIST_LABEL,
	GATE_LIST_NAMES,
	INVALID_STEP,
	INVALID_STEP_LIST,
	INVALID_STEP_PROBLEMS,
	NO_NPM_SCRIPT_REASON,
	NPM_RUN_PATTERN,
} from './gate-config.constants.ts'
import { renderStepLine } from './step-line.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { GateListName, GateStep } from './gate-config.types.ts'

/** A gate config the cli cannot run: the message names the list and the step. */
export class GateConfigError extends Error {
	override name = 'GateConfigError'
}

/**
 * Throws a `GateConfigError` for an invalid `dialecte.gate` of the package: a list that is no list of steps, a
 * step without `name` or `run`, a `scoped` or `heavy` that is not a boolean, `scoped` with `changedOnly`.
 * Every list is checked, whatever mode is resolved. No `dialecte.gate` is valid.
 */
export function validateGateConfig(packageJson: PackageJson): void {
	const gate = packageJson.dialecte?.gate
	if (gate === undefined) return
	for (const list of GATE_LIST_NAMES) {
		if (gate[list] === undefined) continue
		validateStepList({
			label: GATE_LIST_LABEL.replace('{list}', list),
			steps: gate[list],
			scopedAllowed: true,
		})
	}
}

/**
 * Throws a `GateConfigError` for a step list that is no list, or holds an invalid step (`validateGateConfig`);
 * `scopedAllowed: false` refuses a `scoped` step too (contrib has no base). `label` names the list in the message.
 */
export function validateStepList(params: {
	label: string
	steps: unknown
	scopedAllowed: boolean
}): void {
	if (!Array.isArray(params.steps))
		throw new GateConfigError(INVALID_STEP_LIST.replace('{list}', params.label))
	params.steps.forEach(function validateEach(step: unknown, index: number) {
		const problem = findStepProblem({ step, scopedAllowed: params.scopedAllowed })
		if (problem === undefined) return
		throw new GateConfigError(
			INVALID_STEP.replace('{list}', params.label)
				.replace('{step}', stepLabelOf({ step, index }))
				.replace('{problem}', problem),
		)
	})
}

/**
 * True when the release list covers `full`: every resolved `full` step (derived ones included) has a resolved
 * release step with the same `name`, `run`, `counts` and `changedOnly` (`scoped` may differ). No declared
 * release is `full` itself, so it covers.
 */
export function releaseCoversFull(params: { packageJson: PackageJson }): boolean {
	return listUncoveredFullSteps(params).length === 0
}

/** The steps of `fullSteps` that `gate --hook` runs: those counting tests. */
export function listHookTestSteps(fullSteps: readonly GateStep[]): GateStep[] {
	return fullSteps.filter((step) => step.counts === 'tests')
}

/** True when one of `steps` is scoped (`"scoped": true`). */
export function holdsScopedStep(steps: readonly GateStep[]): boolean {
	return steps.some((step) => step.scoped === true)
}

/**
 * The resolved `full` steps (derived ones included) that no resolved release step runs with the same `name`,
 * `run`, `counts` and `changedOnly`, in `full`'s order; none when the release covers `full` (`releaseCoversFull`).
 */
export function listUncoveredFullSteps(params: { packageJson: PackageJson }): GateStep[] {
	const releaseSteps = resolveGateSteps({ packageJson: params.packageJson, mode: 'release' })
	return resolveGateSteps({ packageJson: params.packageJson, mode: 'full' }).filter(
		function isUncovered(fullStep) {
			return !releaseSteps.some((releaseStep) =>
				isSameCommand({ first: fullStep, second: releaseStep }),
			)
		},
	)
}

/**
 * The steps of a gate list, the config validated first (`validateGateConfig`, every list): the declared list or
 * the default one; `full` adds the derived steps no step runs; `release` is the declared list as is, else the
 * resolved `full` steps.
 */
export function resolveGateSteps(params: {
	packageJson: PackageJson
	mode: GateListName
}): GateStep[] {
	validateGateConfig(params.packageJson)
	const gate = params.packageJson.dialecte?.gate
	if (params.mode === 'release')
		return gate?.release
			? [...gate.release]
			: resolveGateSteps({ packageJson: params.packageJson, mode: 'full' })
	const steps = [...(gate?.[params.mode] ?? DEFAULT_GATE_STEPS[params.mode])]
	return params.mode === 'full'
		? [...steps, ...derivedSteps({ packageJson: params.packageJson, steps }).added]
		: steps
}

/** Two steps that run the same command as a covering list reads it: same name, run, counts and changedOnly. */
function isSameCommand(params: { first: GateStep; second: GateStep }): boolean {
	const { first, second } = params
	return (
		first.name === second.name &&
		first.run === second.run &&
		first.counts === second.counts &&
		Boolean(first.changedOnly) === Boolean(second.changedOnly)
	)
}

/** What is wrong with a step as a hand-edited package.json holds it, or undefined when it is valid. */
function findStepProblem(params: { step: unknown; scopedAllowed: boolean }): string | undefined {
	const { step } = params
	if (typeof step !== 'object' || step === null || Array.isArray(step))
		return INVALID_STEP_PROBLEMS.notAnObject
	if (!('name' in step) || typeof step.name !== 'string' || step.name === '')
		return INVALID_STEP_PROBLEMS.noName
	if (!('run' in step) || typeof step.run !== 'string' || step.run === '')
		return INVALID_STEP_PROBLEMS.noRun
	const flags: Record<(typeof BOOLEAN_STEP_FIELDS)[number], unknown> = {
		scoped: 'scoped' in step ? step.scoped : undefined,
		heavy: 'heavy' in step ? step.heavy : undefined,
	}
	const notBoolean = BOOLEAN_STEP_FIELDS.find(function isNotBoolean(field) {
		return flags[field] !== undefined && typeof flags[field] !== 'boolean'
	})
	if (notBoolean !== undefined)
		return INVALID_STEP_PROBLEMS.notBoolean.replace('{field}', notBoolean)
	if (flags.scoped === true && !params.scopedAllowed) return INVALID_STEP_PROBLEMS.scopedRefused
	if (flags.scoped === true && 'changedOnly' in step && step.changedOnly === true)
		return INVALID_STEP_PROBLEMS.scopedWithChangedOnly
	return undefined
}

/** A step as a `GateConfigError` names it: `"<name>"`, else its position and its run. */
function stepLabelOf(params: { step: unknown; index: number }): string {
	const { step, index } = params
	if (typeof step !== 'object' || step === null) return `#${index}`
	if ('name' in step && typeof step.name === 'string' && step.name !== '') return `"${step.name}"`
	if ('run' in step && typeof step.run === 'string') return `#${index} ("${step.run}")`
	return `#${index}`
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
