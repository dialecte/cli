/**
 * The gate's step source, the one reader of where a repository's gate steps come from: its package.json when it
 * has one (its `dialecte` field, as before); else a root `dialecte.json`, each list it lacks taken from what the
 * repository's files tell (`INFERRED_TOOLS`); else those inferred lists alone; else a refusal naming both ways.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	DIALECTE_JSON_FILE,
	DIALECTE_JSON_KEYS,
	DIALECTE_JSON_PROBLEMS,
	DIALECTE_JSON_SCHEMA,
	INFERRED_TOOLS,
	INVALID_DIALECTE_JSON,
	NO_STEP_SOURCE,
} from './step-source.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { DialecteJson, InferredTool, StepSource } from './step-source.types.ts'

/** The step source of the repository at `root`, or the refusal naming why the gate has nothing to run there. */
export function readStepSource(root: string): StepSource | Refusal {
	const packagePath = join(root, 'package.json')
	if (existsSync(packagePath))
		return {
			origin: 'package.json',
			packageJson: JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson,
		}
	const inferred = INFERRED_TOOLS.find(function holdsEveryFile(tool) {
		return tool.files.every((file) => existsSync(join(root, file)))
	})
	const jsonPath = join(root, DIALECTE_JSON_FILE)
	if (!existsSync(jsonPath))
		return inferred
			? {
					origin: 'inferred',
					packageJson: gatePackageJson({
						fast: [...inferred.steps.fast],
						full: [...inferred.steps.full],
					}),
				}
			: { refusal: NO_STEP_SOURCE.replace('{tools}', inferredToolsLabel()) }
	const read = readDialecteJson(readFileSync(jsonPath, 'utf8'))
	if ('refusal' in read) return read
	const gate = { ...read.gate }
	for (const list of ['fast', 'full'] as const) {
		if (gate[list] !== undefined) continue
		if (inferred === undefined)
			return {
				refusal: INVALID_DIALECTE_JSON.replace('{problem}', () =>
					DIALECTE_JSON_PROBLEMS.missingList
						.replace('{list}', list)
						.replace('{tools}', inferredToolsLabel()),
				),
			}
		gate[list] = [...inferred.steps[list]]
	}
	return { origin: 'dialecte.json', packageJson: gatePackageJson(gate) }
}

/** The text of a dialecte.json, checked: an object of `DIALECTE_JSON_KEYS`, schema 1, a gate object without `skip`; else its refusal. */
function readDialecteJson(text: string): DialecteJson | Refusal {
	const problem = findDialecteJsonProblem(text)
	return typeof problem === 'string'
		? { refusal: INVALID_DIALECTE_JSON.replace('{problem}', () => problem) }
		: problem
}

/** What is wrong with a dialecte.json as `DIALECTE_JSON_PROBLEMS` says it, or the file read when nothing is. */
function findDialecteJsonProblem(text: string): string | DialecteJson {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch (error) {
		return DIALECTE_JSON_PROBLEMS.notJson.replace('{error}', () => (error as Error).message)
	}
	if (!isObject(value)) return DIALECTE_JSON_PROBLEMS.notAnObject
	const unknownKey = Object.keys(value).find((key) => !DIALECTE_JSON_KEYS.includes(key))
	if (unknownKey !== undefined)
		return DIALECTE_JSON_PROBLEMS.unknownKey.replace('{key}', unknownKey)
	if (value.schema !== undefined && value.schema !== DIALECTE_JSON_SCHEMA)
		return DIALECTE_JSON_PROBLEMS.schema
	if (value.gate !== undefined && !isObject(value.gate))
		return DIALECTE_JSON_PROBLEMS.gateNotAnObject
	// an opt-out names a default npm step: without package.json there is none to opt out of
	if (isObject(value.gate) && value.gate.skip !== undefined) return DIALECTE_JSON_PROBLEMS.skip
	return value as DialecteJson
}

/** A plain object (no list, no null). */
function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The package.json the gate reads for these lists: only its `dialecte.gate`. */
function gatePackageJson(gate: NonNullable<DialecteJson['gate']>): PackageJson {
	return { dialecte: { gate } }
}

/** Each inferred tool as the refusals name it: `<files> (<commands>)`, joined. */
function inferredToolsLabel(): string {
	return INFERRED_TOOLS.map(function toolLabel(tool: InferredTool) {
		const commands = [...new Set(tool.steps.full.map((step: GateStep) => step.run))]
		return `${tool.label} (${commands.join(', ')})`
	}).join('; ')
}
