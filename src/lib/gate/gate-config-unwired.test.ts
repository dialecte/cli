/**
 * The marks the cli's resolution puts on a gate list (`isDefault`, `optedOut`, `unwired`) and the validation of
 * `dialecte.gate.skip`: a default step is told from a declared one, an opt-out names a default step and gives a
 * one-line reason.
 */
import { outcomeOf } from '../../../test/call-outcome.ts'
import { GATE_SKIP_LABEL, SKIP_PROBLEMS } from './gate-config.constants.ts'
import { GateConfigError, resolveGateSteps, validateGateConfig } from './gate-config.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { GateListName, GateStep } from './gate-config.types.ts'

const ALL_SCRIPTS = { check: 'tsc', 'skills:check': 'dialecte skills check', build: 'tsc -b' }
const NO_SKILLS_SCRIPTS = { check: 'tsc', build: 'tsc -b' }

/** What a refusal of a skip naming a step the package can run says (the user's decision R3-3). */
const SKIP_FOR_UNRUNNABLE_TEXT = 'skip is for a step the package cannot run; remove the skip'

const CHECK_STEP = { name: 'check', run: 'npm run check' }
const SKILLS_STEP = { name: 'skills', run: 'npm run skills:check' }
const BUILD_STEP = { name: 'build', run: 'npm run build' }
const TESTS_STEP = { name: 'tests', run: 'npx vitest run', counts: 'tests' as const }

/** A package.json as a hand-edited file may hold it: `dialecte.gate` of any shape, with these scripts. */
function packageWith(params: { gate?: unknown; scripts?: Record<string, string> }): PackageJson {
	return { scripts: params.scripts ?? ALL_SCRIPTS, dialecte: { gate: params.gate } } as PackageJson
}

/** The marks of each step, in order: what the resolution says about where the step comes from and how it runs. */
function marksOf(steps: readonly GateStep[]) {
	return steps.map(function marksOfStep(step) {
		return {
			name: step.name,
			isDefault: step.isDefault,
			optedOut: step.optedOut,
			unwired: step.unwired,
		}
	})
}

describe('resolveGateSteps marks the steps of a default list', () => {
	for (const { title, mode, gate, marks } of [
		{
			title: 'the default fast list → every step is a default step',
			mode: 'fast' as GateListName,
			gate: undefined,
			marks: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
		},
		{
			title: 'the default full list → every step is a default step',
			mode: 'full' as GateListName,
			gate: undefined,
			marks: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true },
				{ name: 'build', isDefault: true },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
		},
		{
			title:
				'release with no declared release and no declared full → the default full steps, default',
			mode: 'release' as GateListName,
			gate: undefined,
			marks: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true },
				{ name: 'build', isDefault: true },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
		},
		{
			title: 'release with a declared fast list only → the default full steps, default',
			mode: 'release' as GateListName,
			gate: { fast: [CHECK_STEP] },
			marks: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true },
				{ name: 'build', isDefault: true },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
		},
	]) {
		it(title, () => {
			expect(marksOf(resolveGateSteps({ packageJson: packageWith({ gate }), mode }))).toEqual(marks)
		})
	}
})

describe('resolveGateSteps marks no declared step as default', () => {
	for (const { title, mode, gate, names } of [
		{
			title: 'a declared fast list → no step is default',
			mode: 'fast' as GateListName,
			gate: { fast: [CHECK_STEP, SKILLS_STEP, TESTS_STEP] },
			names: ['check', 'skills', 'tests'],
		},
		{
			title: 'a declared full list → no step is default',
			mode: 'full' as GateListName,
			gate: { full: [CHECK_STEP, BUILD_STEP] },
			names: ['check', 'build'],
		},
		{
			title: 'a declared release list → no step is default',
			mode: 'release' as GateListName,
			gate: { release: [CHECK_STEP, BUILD_STEP] },
			names: ['check', 'build'],
		},
		{
			title: 'release falling back to a declared full list → no step is default',
			mode: 'release' as GateListName,
			gate: { full: [CHECK_STEP, SKILLS_STEP, BUILD_STEP] },
			names: ['check', 'skills', 'build'],
		},
	]) {
		it(`${title}; the same mode without a declared list → its first step is`, () => {
			expect({
				declared: marksOf(resolveGateSteps({ packageJson: packageWith({ gate }), mode })),
				defaulted: resolveGateSteps({ packageJson: packageWith({}), mode })[0]?.isDefault,
			}).toEqual({ declared: names.map((name) => ({ name })), defaulted: true })
		})
	}

	it('a declared step carrying isDefault, optedOut and unwired in package.json → the three are dropped', () => {
		const written = { ...CHECK_STEP, isDefault: true, optedOut: 'no check here', unwired: true }

		expect(
			marksOf(
				resolveGateSteps({ packageJson: packageWith({ gate: { fast: [written] } }), mode: 'fast' }),
			),
		).toEqual([{ name: 'check' }])
	})

	it('a derived step the package has the script for → added without any mark', () => {
		const packageJson = packageWith({
			scripts: { ...ALL_SCRIPTS, 'type-narrowing': 'tsc -p narrowing.json' },
		})

		expect(marksOf(resolveGateSteps({ packageJson, mode: 'full' }))).toEqual([
			{ name: 'check', isDefault: true },
			{ name: 'skills', isDefault: true },
			{ name: 'build', isDefault: true },
			{ name: 'tests', isDefault: true },
			{ name: 'rules', isDefault: true },
			{ name: 'type-narrowing' },
		])
	})
})

describe('resolveGateSteps marks an opted-out and an unwired step', () => {
	it('dialecte.gate.skip names skills → that step carries the reason, the others none, in fast and full', () => {
		const packageJson = packageWith({
			scripts: NO_SKILLS_SCRIPTS,
			gate: { skip: { skills: 'no skills folder' } },
		})

		expect({
			fast: marksOf(resolveGateSteps({ packageJson, mode: 'fast' })),
			full: marksOf(resolveGateSteps({ packageJson, mode: 'full' })),
		}).toEqual({
			fast: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true, optedOut: 'no skills folder' },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
			full: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true, optedOut: 'no skills folder' },
				{ name: 'build', isDefault: true },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
		})
	})

	it('an opt-out → the default lists stay as they were: a package without it resolves unmarked by it', () => {
		resolveGateSteps({
			packageJson: packageWith({
				scripts: NO_SKILLS_SCRIPTS,
				gate: { skip: { skills: 'no skills folder' } },
			}),
			mode: 'fast',
		})

		expect(marksOf(resolveGateSteps({ packageJson: packageWith({}), mode: 'fast' }))).toEqual([
			{ name: 'check', isDefault: true },
			{ name: 'skills', isDefault: true },
			{ name: 'tests', isDefault: true },
			{ name: 'rules', isDefault: true },
		])
	})

	it('a default step whose npm script the package lacks → unwired, and only that one', () => {
		const packageJson = packageWith({ scripts: NO_SKILLS_SCRIPTS })

		expect(marksOf(resolveGateSteps({ packageJson, mode: 'full' }))).toEqual([
			{ name: 'check', isDefault: true },
			{ name: 'skills', isDefault: true, unwired: true },
			{ name: 'build', isDefault: true },
			{ name: 'tests', isDefault: true },
			{ name: 'rules', isDefault: true },
		])
	})

	it('a package with no scripts at all → every default npm run step is unwired, the npx step is not', () => {
		const packageJson = { dialecte: {} } as PackageJson

		expect(marksOf(resolveGateSteps({ packageJson, mode: 'full' }))).toEqual([
			{ name: 'check', isDefault: true, unwired: true },
			{ name: 'skills', isDefault: true, unwired: true },
			{ name: 'build', isDefault: true, unwired: true },
			{ name: 'tests', isDefault: true },
			{ name: 'rules', isDefault: true },
		])
	})

	it('a declared step running a missing script → unwired and not default; one running node is never unwired', () => {
		const packageJson = packageWith({
			scripts: { check: 'tsc' },
			gate: { fast: [CHECK_STEP, SKILLS_STEP, { name: 'lint', run: 'node scripts/lint.js' }] },
		})

		expect(marksOf(resolveGateSteps({ packageJson, mode: 'fast' }))).toEqual([
			{ name: 'check' },
			{ name: 'skills', unwired: true },
			{ name: 'lint' },
		])
	})

	it('a step that runs the missing script with arguments (npm run skills:check -- --x) → unwired, the pattern reads the first word', () => {
		const packageJson = packageWith({
			scripts: { check: 'tsc' },
			gate: { fast: [{ name: 'skills', run: 'npm run skills:check -- --x' }] },
		})

		expect(marksOf(resolveGateSteps({ packageJson, mode: 'fast' }))).toEqual([
			{ name: 'skills', unwired: true },
		])
	})
})

describe('validateGateConfig refuses a dialecte.gate.skip that is stale or unwritten', () => {
	for (const { title, skip, names, problem } of [
		{
			title: 'an empty reason',
			skip: { skills: '' },
			names: 'skills',
			problem: SKIP_PROBLEMS.emptyReason,
		},
		{
			title: 'a number as the reason',
			skip: { skills: 3 },
			names: 'skills',
			problem: SKIP_PROBLEMS.notAString,
		},
		{
			title: 'a reason of 201 characters',
			skip: { skills: 'x'.repeat(201) },
			names: 'skills',
			problem: SKIP_PROBLEMS.tooLong,
		},
		{
			title: 'a two-line reason',
			skip: { skills: 'no skills folder\nsee the readme' },
			names: 'skills',
			problem: SKIP_PROBLEMS.multiLine,
		},
		{
			title: 'a name that is no default step (a typo)',
			skip: { skils: 'no skills folder' },
			names: 'skils',
			problem: SKIP_PROBLEMS.notADefaultStep,
		},
		{
			title: 'a string instead of a map',
			skip: 'skills',
			names: '',
			problem: SKIP_PROBLEMS.notAnObject,
		},
		{
			title: 'an array instead of a map',
			skip: ['skills'],
			names: '',
			problem: SKIP_PROBLEMS.notAnObject,
		},
	]) {
		it(`${title} → a GateConfigError naming dialecte.gate.skip and saying its own problem`, () => {
			const packageJson = packageWith({ scripts: NO_SKILLS_SCRIPTS, gate: { skip } })
			const outcome = outcomeOf(() => validateGateConfig(packageJson))

			expect({
				says:
					'error' in outcome &&
					outcome.error.includes(GATE_SKIP_LABEL) &&
					outcome.error.includes(problem.replace('{name}', names)),
			}).toEqual({ says: true })
			expect(() => validateGateConfig(packageJson)).toThrow(GateConfigError)
		})
	}

	it('a name only declared lists hold (fast and full declared, skills among them) → refused, naming dialecte.gate.skip and the name', () => {
		const packageJson = packageWith({
			gate: {
				fast: [CHECK_STEP, SKILLS_STEP],
				full: [CHECK_STEP, SKILLS_STEP, BUILD_STEP],
				skip: { skills: 'no skills folder' },
			},
		})
		const outcome = outcomeOf(() => resolveGateSteps({ packageJson, mode: 'full' }))

		expect({
			says:
				'error' in outcome &&
				outcome.error.includes(GATE_SKIP_LABEL) &&
				outcome.error.includes(SKIP_PROBLEMS.notADefaultStep.replace('{name}', 'skills')),
		}).toEqual({ says: true })
	})

	it('an opted-out default step whose script is missing too → exactly name, run, isDefault and optedOut: no unwired', () => {
		const packageJson = packageWith({
			scripts: NO_SKILLS_SCRIPTS,
			gate: { skip: { skills: 'no skills folder' } },
		})

		expect(resolveGateSteps({ packageJson, mode: 'full' })[1]).toStrictEqual({
			name: 'skills',
			run: 'npm run skills:check',
			isDefault: true,
			optedOut: 'no skills folder',
		})
	})

	it('a declared step opted out while the other mode still defaults it (full declared, fast default) → accepted, the fast step opted out', () => {
		const packageJson = packageWith({
			scripts: NO_SKILLS_SCRIPTS,
			gate: { full: [CHECK_STEP, SKILLS_STEP], skip: { skills: 'no skills folder' } },
		})

		expect({
			fast: marksOf(resolveGateSteps({ packageJson, mode: 'fast' })),
			full: marksOf(resolveGateSteps({ packageJson, mode: 'full' })),
		}).toEqual({
			fast: [
				{ name: 'check', isDefault: true },
				{ name: 'skills', isDefault: true, optedOut: 'no skills folder' },
				{ name: 'tests', isDefault: true },
				{ name: 'rules', isDefault: true },
			],
			full: [{ name: 'check' }, { name: 'skills', unwired: true }],
		})
	})

	it('a reason of exactly 200 characters on a default step the package cannot run → accepted and applied', () => {
		const reason = 'r'.repeat(200)
		const packageJson = packageWith({
			scripts: NO_SKILLS_SCRIPTS,
			gate: { skip: { skills: reason } },
		})

		expect(marksOf(resolveGateSteps({ packageJson, mode: 'full' })).at(1)).toEqual({
			name: 'skills',
			isDefault: true,
			optedOut: reason,
		})
	})
})

describe('validateGateConfig refuses a dialecte.gate.skip naming a step the package can run', () => {
	for (const { title, scripts, name } of [
		{
			title: 'the npx tests step, which is no npm run step',
			scripts: ALL_SCRIPTS,
			name: 'tests',
		},
		{
			title: 'skills while its skills:check script exists',
			scripts: ALL_SCRIPTS,
			name: 'skills',
		},
		{
			title: 'check while its check script exists',
			scripts: ALL_SCRIPTS,
			name: 'check',
		},
	]) {
		it(`${title} → a GateConfigError naming dialecte.gate.skip, the step and the text that skip is for a step the package cannot run`, () => {
			const packageJson = packageWith({ scripts, gate: { skip: { [name]: 'not needed here' } } })
			const outcome = outcomeOf(() => validateGateConfig(packageJson))

			expect({
				says:
					'error' in outcome &&
					outcome.error.includes(GATE_SKIP_LABEL) &&
					outcome.error.includes(`"${name}"`) &&
					outcome.error.includes(SKIP_FOR_UNRUNNABLE_TEXT),
			}).toEqual({ says: true })
			expect(() => validateGateConfig(packageJson)).toThrow(GateConfigError)
		})
	}

	it('skills without its skills:check script → accepted as today, nothing thrown', () => {
		const packageJson = packageWith({
			scripts: NO_SKILLS_SCRIPTS,
			gate: { skip: { skills: 'no skills folder' } },
		})

		expect(() => validateGateConfig(packageJson)).not.toThrow()
	})
})
