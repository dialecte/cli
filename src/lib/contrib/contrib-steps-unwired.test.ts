/**
 * The marks the cli's resolution puts on contrib's package steps (`isDefault`, `optedOut`, `unwired`) and the
 * validation of `dialecte.contrib.skip`: the docs build and the type bench are default steps of contrib only while
 * the package declares no `dialecte.contrib.steps`.
 */
import { outcomeOf } from '../../../test/call-outcome.ts'
import { SKIP_PROBLEMS } from '../gate/gate-config.constants.ts'
import { GateConfigError } from '../gate/gate-config.ts'
import { resolveContribSteps } from './contrib-steps.ts'
import { CONTRIB_SKIP_LABEL } from './contrib.constants.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { PackageJson } from '../package-json.types.ts'

const WIRED_SCRIPTS = { 'doc:build': 'node docs.js', 'type-bench:check': 'node bench.js' }

const NO_DOCS_SCRIPTS = { 'type-bench:check': 'node bench.js' }

/** What a refusal of a skip naming a step the package can run says (the user's decision R3-3). */
const SKIP_FOR_UNRUNNABLE_TEXT = 'skip is for a step the package cannot run; remove the skip'

const BENCH_STEP = { name: 'bench', run: 'npm run bench' }

/** A package.json as a hand-edited file may hold it: `dialecte.contrib` of any shape, with these scripts. */
function packageWith(params: { contrib?: unknown; scripts?: Record<string, string> }): PackageJson {
	return {
		scripts: params.scripts ?? WIRED_SCRIPTS,
		dialecte: { contrib: params.contrib },
	} as PackageJson
}

/** The name and marks of each package step (the built-in rows, `rules` and `release`, are left out). */
function marksOf(steps: readonly ({ name: string } | GateStep)[]) {
	return steps
		.filter((step): step is GateStep => 'run' in step)
		.map(function marksOfStep(step) {
			return {
				name: step.name,
				isDefault: step.isDefault,
				optedOut: step.optedOut,
				unwired: step.unwired,
			}
		})
}

describe('resolveContribSteps marks', () => {
	it('no dialecte.contrib.steps → docs and type-bench are default steps, wired', () => {
		expect(marksOf(resolveContribSteps({ packageJson: packageWith({}) }))).toEqual([
			{ name: 'docs', isDefault: true },
			{ name: 'type-bench', isDefault: true },
		])
	})

	it('no doc:build script → docs is unwired, type-bench is not', () => {
		const packageJson = packageWith({ scripts: { 'type-bench:check': 'node bench.js' } })

		expect(marksOf(resolveContribSteps({ packageJson }))).toEqual([
			{ name: 'docs', isDefault: true, unwired: true },
			{ name: 'type-bench', isDefault: true },
		])
	})

	it('dialecte.contrib.skip names docs → docs carries the reason, type-bench none', () => {
		const packageJson = packageWith({
			scripts: NO_DOCS_SCRIPTS,
			contrib: { skip: { docs: 'no docs build here' } },
		})

		expect(marksOf(resolveContribSteps({ packageJson }))).toEqual([
			{ name: 'docs', isDefault: true, optedOut: 'no docs build here' },
			{ name: 'type-bench', isDefault: true },
		])
	})

	it('a declared steps list → no step is default; a missing script makes it unwired; fields written in package.json are dropped', () => {
		const written = { ...BENCH_STEP, isDefault: true, optedOut: 'not needed', unwired: true }
		const packageJson = packageWith({
			scripts: { bench: 'node bench.js' },
			contrib: { steps: [written, { name: 'docs', run: 'npm run doc:build' }] },
		})

		expect(marksOf(resolveContribSteps({ packageJson }))).toEqual([
			{ name: 'bench' },
			{ name: 'docs', unwired: true },
		])
	})

	it('the built-in rows carry no mark and a node step is never unwired', () => {
		const packageJson = packageWith({
			contrib: { steps: [{ name: 'lint', run: 'node scripts/lint.js' }] },
		})

		expect(resolveContribSteps({ packageJson })).toEqual([
			{ name: 'rules', builtin: 'rules' },
			{ name: 'lint', run: 'node scripts/lint.js' },
			{ name: 'release', builtin: 'release' },
		])
		expect({
			declared: marksOf(resolveContribSteps({ packageJson })),
			defaulted: marksOf(resolveContribSteps({ packageJson: packageWith({}) })).map(
				(step) => step.isDefault,
			),
		}).toEqual({ declared: [{ name: 'lint' }], defaulted: [true, true] })
	})
})

describe('resolveContribSteps refuses a dialecte.contrib.skip that is stale or unwritten', () => {
	for (const { title, skip, name, problem } of [
		{
			title: 'an empty reason',
			skip: { docs: '' },
			name: 'docs',
			problem: SKIP_PROBLEMS.emptyReason,
		},
		{
			title: 'a number as the reason',
			skip: { docs: 7 },
			name: 'docs',
			problem: SKIP_PROBLEMS.notAString,
		},
		{
			title: 'a reason of 201 characters',
			skip: { docs: 'x'.repeat(201) },
			name: 'docs',
			problem: SKIP_PROBLEMS.tooLong,
		},
		{
			title: 'a two-line reason',
			skip: { docs: 'no docs build\nsee the readme' },
			name: 'docs',
			problem: SKIP_PROBLEMS.multiLine,
		},
		{
			title: 'a name that is no default step (a typo)',
			skip: { dox: 'no docs build' },
			name: 'dox',
			problem: SKIP_PROBLEMS.notADefaultStep,
		},
		{
			title: 'the built-in rules row',
			skip: { rules: 'not here' },
			name: 'rules',
			problem: SKIP_PROBLEMS.notADefaultStep,
		},
		{
			title: 'a string instead of a map',
			skip: 'docs',
			name: '',
			problem: SKIP_PROBLEMS.notAnObject,
		},
		{
			title: 'an array instead of a map',
			skip: ['docs'],
			name: '',
			problem: SKIP_PROBLEMS.notAnObject,
		},
	]) {
		it(`${title} → a GateConfigError naming dialecte.contrib.skip and saying its own problem`, () => {
			const packageJson = packageWith({ scripts: NO_DOCS_SCRIPTS, contrib: { skip } })
			const outcome = outcomeOf(() => resolveContribSteps({ packageJson }))

			expect({
				says:
					'error' in outcome &&
					outcome.error.includes(CONTRIB_SKIP_LABEL) &&
					outcome.error.includes(problem.replace('{name}', name)),
			}).toEqual({ says: true })
			expect(() => resolveContribSteps({ packageJson })).toThrow(GateConfigError)
		})
	}

	it('docs opted out while dialecte.contrib.steps is declared (the list is no default) → refused, naming dialecte.contrib.skip and docs', () => {
		const packageJson = packageWith({
			contrib: { steps: [{ name: 'docs', run: 'npm run doc:build' }], skip: { docs: 'no docs' } },
		})
		const outcome = outcomeOf(() => resolveContribSteps({ packageJson }))

		expect({
			says:
				'error' in outcome &&
				outcome.error.includes(CONTRIB_SKIP_LABEL) &&
				outcome.error.includes(SKIP_PROBLEMS.notADefaultStep.replace('{name}', 'docs')),
		}).toEqual({ says: true })
	})

	it('an opted-out default step whose script is missing too → exactly name, run, restoresGeneratedDocs, isDefault and optedOut: no unwired', () => {
		const packageJson = packageWith({
			scripts: { 'type-bench:check': 'node bench.js' },
			contrib: { skip: { docs: 'no docs build here' } },
		})

		expect(resolveContribSteps({ packageJson })[1]).toStrictEqual({
			name: 'docs',
			run: 'npm run doc:build',
			restoresGeneratedDocs: true,
			isDefault: true,
			optedOut: 'no docs build here',
		})
	})
})

describe('resolveContribSteps refuses a dialecte.contrib.skip naming a step the package can run', () => {
	for (const { title, name } of [
		{ title: 'docs while its doc:build script exists', name: 'docs' },
		{ title: 'type-bench while its type-bench:check script exists', name: 'type-bench' },
	]) {
		it(`${title} → a GateConfigError naming dialecte.contrib.skip, the step and the text that skip is for a step the package cannot run`, () => {
			const packageJson = packageWith({ contrib: { skip: { [name]: 'not needed here' } } })
			const outcome = outcomeOf(() => resolveContribSteps({ packageJson }))

			expect({
				says:
					'error' in outcome &&
					outcome.error.includes(CONTRIB_SKIP_LABEL) &&
					outcome.error.includes(`"${name}"`) &&
					outcome.error.includes(SKIP_FOR_UNRUNNABLE_TEXT),
			}).toEqual({ says: true })
			expect(() => resolveContribSteps({ packageJson })).toThrow(GateConfigError)
		})
	}

	it('docs without its doc:build script → accepted as today, nothing thrown', () => {
		const packageJson = packageWith({
			scripts: NO_DOCS_SCRIPTS,
			contrib: { skip: { docs: 'no docs build here' } },
		})

		expect(() => resolveContribSteps({ packageJson })).not.toThrow()
	})
})
