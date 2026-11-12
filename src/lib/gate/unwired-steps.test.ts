/**
 * `findUnwiredSteps`: the result of every opted-out or unwired step of a resolved list, judged before any step
 * runs; a step that runs as listed is absent from the map.
 */
import { outcomeOf } from '../../../test/call-outcome.ts'
import { findUnwiredSteps } from './unwired-steps.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'

const SCRIPTS = { check: 'tsc', build: 'tsc -b' }
const PACKAGE_JSON: PackageJson = { scripts: SCRIPTS }

const DEFAULT_CHECK: GateStep = { name: 'check', run: 'npm run check', isDefault: true }
const DEFAULT_SKILLS: GateStep = {
	name: 'skills',
	run: 'npm run skills:check',
	isDefault: true,
	unwired: true,
}
/** Opted out and wired (its script exists): whether an opted-out step that is also unwired is marked so is the spec's to say. */
const OPTED_OUT_BUILD: GateStep = {
	name: 'build',
	run: 'npm run build',
	isDefault: true,
	optedOut: 'no build here',
}
const DEFAULT_BUNDLE: GateStep = {
	name: 'bundle',
	run: 'npm run bundle',
	isDefault: true,
	unwired: true,
}
const DECLARED_SKILLS: GateStep = { name: 'skills', run: 'npm run skills:check', unwired: true }
const DEFAULT_TESTS: GateStep = {
	name: 'tests',
	run: 'npx vitest run',
	counts: 'tests',
	isDefault: true,
}

/** What each step of `steps` got, by name: its status, reason and marks (a step absent from the map is absent here). */
function judgedOf(params: {
	steps: readonly GateStep[]
	failDefault: boolean
	packageJson?: PackageJson
}): Record<string, Pick<StepResult, 'status' | 'reason' | 'unwired' | 'optedOut'>> {
	const judged = findUnwiredSteps({
		steps: params.steps,
		packageJson: params.packageJson ?? PACKAGE_JSON,
		failDefault: params.failDefault,
	})
	return Object.fromEntries(
		[...judged].map(function entryOf([step, result]) {
			return [
				step.name,
				{
					status: result.status,
					reason: result.reason,
					unwired: result.unwired,
					optedOut: result.optedOut,
				},
			]
		}),
	)
}

describe('findUnwiredSteps', () => {
	for (const { title, steps, failDefault, judged } of [
		{
			title: 'a default unwired step, failDefault true → failed: not wired',
			steps: [DEFAULT_CHECK, DEFAULT_SKILLS, DEFAULT_TESTS],
			failDefault: true,
			judged: {
				skills: {
					status: 'failed',
					reason: 'not wired (no npm script "skills:check")',
					unwired: true,
				},
			},
		},
		{
			title: 'a default unwired step, failDefault false → skipped: not wired, still marked unwired',
			steps: [DEFAULT_CHECK, DEFAULT_SKILLS, DEFAULT_TESTS],
			failDefault: false,
			judged: {
				skills: {
					status: 'skipped',
					reason: 'not wired (no npm script "skills:check")',
					unwired: true,
				},
			},
		},
		{
			title: 'a declared unwired step, failDefault false → failed: declared but not wired',
			steps: [DEFAULT_CHECK, DECLARED_SKILLS],
			failDefault: false,
			judged: {
				skills: {
					status: 'failed',
					reason: 'declared but not wired (no npm script "skills:check")',
					unwired: true,
				},
			},
		},
		{
			title: 'a declared unwired step, failDefault true → failed: declared but not wired',
			steps: [DEFAULT_CHECK, DECLARED_SKILLS],
			failDefault: true,
			judged: {
				skills: {
					status: 'failed',
					reason: 'declared but not wired (no npm script "skills:check")',
					unwired: true,
				},
			},
		},
		{
			title:
				'an opted-out step, failDefault true → skipped: opted out, the reason as given, not unwired',
			steps: [DEFAULT_CHECK, OPTED_OUT_BUILD],
			failDefault: true,
			judged: {
				build: {
					status: 'skipped',
					reason: 'opted out: no build here',
					optedOut: 'no build here',
				},
			},
		},
		{
			title: 'an opted-out step, failDefault false → skipped: opted out',
			steps: [DEFAULT_CHECK, OPTED_OUT_BUILD],
			failDefault: false,
			judged: {
				build: {
					status: 'skipped',
					reason: 'opted out: no build here',
					optedOut: 'no build here',
				},
			},
		},
		{
			title: 'only wired steps, failDefault true → nothing in the map',
			steps: [DEFAULT_CHECK, DEFAULT_TESTS],
			failDefault: true,
			judged: {},
		},
		{
			title:
				'two default unwired steps, failDefault true → both failed, each naming its script, the wired one absent',
			steps: [DEFAULT_CHECK, DEFAULT_SKILLS, DEFAULT_BUNDLE],
			failDefault: true,
			judged: {
				skills: {
					status: 'failed',
					reason: 'not wired (no npm script "skills:check")',
					unwired: true,
				},
				bundle: { status: 'failed', reason: 'not wired (no npm script "bundle")', unwired: true },
			},
		},
	]) {
		it(title, () => {
			expect(outcomeOf(() => judgedOf({ steps, failDefault }))).toEqual({ value: judged })
		})
	}

	it('a step whose run reads npm run <script> -- args, with the script missing → judged on the script, the first word', () => {
		const step: GateStep = { name: 'skills', run: 'npm run skills:check -- --x', isDefault: true }

		expect(outcomeOf(() => judgedOf({ steps: [step], failDefault: true }))).toEqual({
			value: {
				skills: {
					status: 'failed',
					reason: 'not wired (no npm script "skills:check")',
					unwired: true,
				},
			},
		})
	})

	it('an opted-out step whose script is missing too → skipped as opted out, the result carries optedOut and no unwired at all', () => {
		const step: GateStep = {
			name: 'skills',
			run: 'npm run skills:check',
			isDefault: true,
			optedOut: 'no skills folder',
		}
		const judged = outcomeOf(() =>
			findUnwiredSteps({ steps: [step], packageJson: PACKAGE_JSON, failDefault: true }).get(step),
		)

		expect(judged).toStrictEqual({
			value: expect.objectContaining({
				status: 'skipped',
				reason: 'opted out: no skills folder',
				optedOut: 'no skills folder',
			}),
		})
		expect('value' in judged && judged.value !== undefined && 'unwired' in judged.value).toBe(false)
	})

	it('a node step and an npx step in a package with no scripts → never judged unwired: an empty map', () => {
		const node: GateStep = { name: 'lint', run: 'node scripts/lint.js', isDefault: true }

		expect(
			outcomeOf(() =>
				judgedOf({
					steps: [node, DEFAULT_TESTS],
					packageJson: { scripts: {} },
					failDefault: true,
				}),
			),
		).toEqual({ value: {} })
	})

	it('a step with the same name wired in one list and missing its script in another → judged on the package scripts it is given', () => {
		const build: GateStep = { name: 'build', run: 'npm run build', isDefault: true }

		expect({
			withScript: outcomeOf(() => judgedOf({ steps: [build], failDefault: true })),
			withoutScript: outcomeOf(() =>
				judgedOf({ steps: [build], failDefault: true, packageJson: { scripts: {} } }),
			),
		}).toEqual({
			withScript: { value: {} },
			withoutScript: {
				value: {
					build: { status: 'failed', reason: 'not wired (no npm script "build")', unwired: true },
				},
			},
		})
	})
})
