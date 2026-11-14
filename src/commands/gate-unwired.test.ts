/**
 * `dialecte gate` and a default step whose npm script the package lacks: it never skips in silence. A full or
 * release run fails it before any step runs, a fast run says it, a package opts out by name with a reason, a
 * declared step without its script fails in every mode.
 */
import {
	ABSENT_DERIVED_LINE,
	ALL_DEFAULT_SCRIPTS,
	BUILD_NOT_WIRED_FAIL_LINE,
	DEFAULT_WIRED_SCRIPTS,
	NOT_RUN_LINE,
	SKILLS_NOT_WIRED_FAIL_LINE,
	SKILLS_NOT_WIRED_SKIP_LINE,
} from '../../test/rule-gaps-unwired.constants.ts'
import {
	createUnwiredPackage,
	parseGateJson,
	runGateWith,
	seedPreUnwiredFullRecord,
	stepLinesOf,
} from '../../test/rule-gaps-unwired.ts'
import { countRuns, createCounter } from '../../test/scratch-checks.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SKIP_PROBLEMS, UNWIRED_NOT_RUN_REASON } from '../lib/gate/gate-config.constants.ts'

import { describe, expect, it } from 'vitest'

function notRun(name: string): string {
	return NOT_RUN_LINE.replace('{name}', name)
}

/** The refusal names `dialecte.gate.skip` and holds the problem's own text, the step's name filled in. */
function refusalSays(params: { output: string; problem: string; name?: string }): boolean {
	return (
		params.output.includes('dialecte.gate.skip') &&
		params.output.includes(params.problem.replace('{name}', params.name ?? ''))
	)
}

describe('gate: a default step without its npm script', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	for (const { title, argv, verdict } of [
		{
			title:
				'gate --full on a package with check and build but no skills:check and no dialecte.gate',
			argv: ['--full'],
			verdict: 'gate --full: failed at skills',
		},
		{
			title:
				'gate --release on a package with no declared release list (it falls back to the default full list)',
			argv: ['--release'],
			verdict: 'gate --release: failed at skills',
		},
	]) {
		it(`${title} → skills fails not wired, every other step not run, nothing ran, exit 1`, async () => {
			const counter = createCounter()
			const root = createUnwiredPackage({ counter, scripts: DEFAULT_WIRED_SCRIPTS })

			const result = await runGateWith({ cwd: root, argv })

			expect({
				exitCode: result.exitCode,
				lines: stepLinesOf(result.output),
				verdict: result.output.split('\n').find((line) => line.startsWith('gate --')),
				runs: countRuns(counter),
			}).toEqual({
				exitCode: 1,
				lines: [
					notRun('check'),
					SKILLS_NOT_WIRED_FAIL_LINE,
					notRun('build'),
					notRun('tests'),
					notRun('rules'),
					ABSENT_DERIVED_LINE,
				],
				verdict,
				runs: 0,
			})
		})
	}

	it('gate --full on the same package → the output names the fix: dialecte.gate.skip to opt out and to add the script, on the step line or a line after it', async () => {
		const root = createUnwiredPackage({ counter: createCounter(), scripts: DEFAULT_WIRED_SCRIPTS })

		const result = await runGateWith({ cwd: root, argv: ['--full'] })
		const lines = result.output.split('\n')
		const failedAt = lines.findIndex((line) => line.startsWith('FAIL  skills'))
		const fromFailed = lines.slice(failedAt, failedAt + 3).join('\n')

		expect({
			exitCode: result.exitCode,
			namesTheSkipKey: fromFailed.includes('dialecte.gate.skip'),
			namesTheScript: fromFailed.includes('add the script'),
		}).toEqual({ exitCode: 1, namesTheSkipKey: true, namesTheScript: true })
	})

	it('gate --full --json on the same package → the skills step is failed and unwired, the others not-run', async () => {
		const root = createUnwiredPackage({ counter: createCounter(), scripts: DEFAULT_WIRED_SCRIPTS })

		const result = await runGateWith({ cwd: root, argv: ['--full', '--json'] })

		expect({
			exitCode: result.exitCode,
			ok: parseGateJson(result.output).ok,
			steps: parseGateJson(result.output)
				.steps.filter((entry) => entry.step.name !== 'tdd')
				.map(({ step, status, reason, unwired }) => ({ name: step.name, status, reason, unwired })),
		}).toEqual({
			exitCode: 1,
			ok: false,
			steps: [
				{ name: 'check', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
				{
					name: 'skills',
					status: 'failed',
					reason: 'not wired (no npm script "skills:check")',
					unwired: true,
				},
				{ name: 'build', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
				{ name: 'tests', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
				{ name: 'rules', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
			],
		})
	})

	it('gate --fast on the same package → green; the skills step is skipped, says not wired, and the other steps ran', async () => {
		const counter = createCounter()
		const root = createUnwiredPackage({ counter, scripts: DEFAULT_WIRED_SCRIPTS })

		const result = await runGateWith({ cwd: root, argv: ['--fast'] })

		expect({
			exitCode: result.exitCode,
			hasSkippedLine: stepLinesOf(result.output).includes(SKILLS_NOT_WIRED_SKIP_LINE),
			runs: countRuns(counter),
		}).toEqual({ exitCode: 0, hasSkippedLine: true, runs: 2 })
	})

	it('gate --fast --json on the same package → the skills step is skipped and marked unwired, the run ok', async () => {
		const root = createUnwiredPackage({ counter: createCounter(), scripts: DEFAULT_WIRED_SCRIPTS })

		const result = await runGateWith({ cwd: root, argv: ['--fast', '--json'] })

		expect({
			exitCode: result.exitCode,
			ok: parseGateJson(result.output).ok,
			skills: parseGateJson(result.output)
				.steps.filter((entry) => entry.step.name === 'skills')
				.map(({ status, reason, unwired }) => ({ status, reason, unwired })),
		}).toEqual({
			exitCode: 0,
			ok: true,
			skills: [
				{ status: 'skipped', reason: 'not wired (no npm script "skills:check")', unwired: true },
			],
		})
	})

	it('two default steps unwired (skills and build), check wired → both fail up front, check and tests are not run', async () => {
		const counter = createCounter()
		const root = createUnwiredPackage({ counter, scripts: ['check'] })

		const result = await runGateWith({ cwd: root, argv: ['--full'] })

		expect({
			exitCode: result.exitCode,
			lines: stepLinesOf(result.output),
			runs: countRuns(counter),
		}).toEqual({
			exitCode: 1,
			lines: [
				notRun('check'),
				SKILLS_NOT_WIRED_FAIL_LINE,
				BUILD_NOT_WIRED_FAIL_LINE,
				notRun('tests'),
				notRun('rules'),
				ABSENT_DERIVED_LINE,
			],
			runs: 0,
		})
	})
})

describe('gate: an opt-out', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('dialecte.gate.skip.skills holds a reason → gate --full is green, the skills line says opted out, the other three steps ran', async () => {
		const counter = createCounter()
		const root = createUnwiredPackage({
			counter,
			scripts: DEFAULT_WIRED_SCRIPTS,
			dialecte: { gate: { skip: { skills: 'no skills folder' } } },
		})

		const result = await runGateWith({ cwd: root, argv: ['--full'] })

		expect({
			exitCode: result.exitCode,
			skipLine: stepLinesOf(result.output).find((line) => line.startsWith('skip  skills')),
			runs: countRuns(counter),
		}).toEqual({ exitCode: 0, skipLine: 'skip  skills  opted out: no skills folder', runs: 3 })
	})

	it('an opt-out and a derived step the package has no script for → green; the derived step leaves its one absent line and no step', async () => {
		const root = createUnwiredPackage({
			counter: createCounter(),
			scripts: DEFAULT_WIRED_SCRIPTS,
			dialecte: { gate: { skip: { skills: 'no skills folder' } } },
		})

		const json = await runGateWith({ cwd: root, argv: ['--full', '--json', '--no-reuse'] })
		const plain = await runGateWith({ cwd: root, argv: ['--full', '--no-reuse'] })
		const skills = parseGateJson(json.output).steps.find((entry) => entry.step.name === 'skills')

		expect({
			exitCode: plain.exitCode,
			absentLine: stepLinesOf(plain.output).includes(ABSENT_DERIVED_LINE),
			names: parseGateJson(json.output).steps.map((entry) => entry.step.name),
			skills: { status: skills?.status, optedOut: skills?.optedOut },
			skillsHasUnwired: skills !== undefined && 'unwired' in skills,
		}).toEqual({
			exitCode: 0,
			absentLine: true,
			names: ['tdd', 'check', 'skills', 'build', 'tests', 'rules'],
			skills: { status: 'skipped', optedOut: 'no skills folder' },
			skillsHasUnwired: false,
		})
	})

	it('an opted-out default step whose script is missing too → skipped with optedOut, never marked unwired, never failing', async () => {
		const root = createUnwiredPackage({
			counter: createCounter(),
			scripts: DEFAULT_WIRED_SCRIPTS,
			dialecte: { gate: { skip: { skills: 'no skills folder' } } },
		})

		const result = await runGateWith({ cwd: root, argv: ['--full', '--json', '--no-reuse'] })
		const skills = parseGateJson(result.output).steps.find((entry) => entry.step.name === 'skills')

		expect({
			exitCode: result.exitCode,
			skills: { status: skills?.status, reason: skills?.reason, optedOut: skills?.optedOut },
			unwiredAbsent: skills !== undefined && !('unwired' in skills),
		}).toEqual({
			exitCode: 0,
			skills: {
				status: 'skipped',
				reason: 'opted out: no skills folder',
				optedOut: 'no skills folder',
			},
			unwiredAbsent: true,
		})
	})

	it('an opt-out that names no default step, an empty reason → exit 2, the refusal names dialecte.gate.skip and says its own problem', async () => {
		const counter = createCounter()
		const root = createUnwiredPackage({
			counter,
			scripts: ALL_DEFAULT_SCRIPTS,
			dialecte: { gate: { skip: { skils: 'a typo' } } },
		})
		const emptyReason = createUnwiredPackage({
			counter,
			scripts: DEFAULT_WIRED_SCRIPTS,
			dialecte: { gate: { skip: { skills: '' } } },
		})

		const typo = await runGateWith({ cwd: root, argv: ['--full'] })
		const empty = await runGateWith({ cwd: emptyReason, argv: ['--full'] })

		expect({
			typo: {
				exitCode: typo.exitCode,
				says: refusalSays({
					output: typo.output,
					problem: SKIP_PROBLEMS.notADefaultStep,
					name: 'skils',
				}),
			},
			empty: {
				exitCode: empty.exitCode,
				says: refusalSays({
					output: empty.output,
					problem: SKIP_PROBLEMS.emptyReason,
					name: 'skills',
				}),
			},
			runs: countRuns(counter),
		}).toEqual({
			typo: { exitCode: 2, says: true },
			empty: { exitCode: 2, says: true },
			runs: 0,
		})
	})

	it('an opt-out of skills while its skills:check script exists → exit 2, the refusal names dialecte.gate.skip, skills and that skip is for a step the package cannot run, nothing ran', async () => {
		const counter = createCounter()
		const root = createUnwiredPackage({
			counter,
			scripts: ALL_DEFAULT_SCRIPTS,
			dialecte: { gate: { skip: { skills: 'no skills folder' } } },
		})

		const result = await runGateWith({ cwd: root, argv: ['--full'] })

		expect({
			exitCode: result.exitCode,
			namesTheKey: result.output.includes('dialecte.gate.skip'),
			namesTheStep: result.output.includes('"skills"'),
			saysWhy: result.output.includes('skip is for a step the package cannot run; remove the skip'),
			runs: countRuns(counter),
		}).toEqual({ exitCode: 2, namesTheKey: true, namesTheStep: true, saysWhy: true, runs: 0 })
	})

	for (const { title, skip } of [
		{ title: 'a string', skip: 'skills' },
		{ title: 'an array', skip: ['skills'] },
	]) {
		it(`dialecte.gate.skip as ${title} → exit 2, the refusal names dialecte.gate.skip and says it is a map`, async () => {
			const root = createUnwiredPackage({
				counter: createCounter(),
				scripts: ALL_DEFAULT_SCRIPTS,
				dialecte: { gate: { skip } },
			})

			const result = await runGateWith({ cwd: root, argv: ['--full'] })

			expect({
				exitCode: result.exitCode,
				says: refusalSays({ output: result.output, problem: SKIP_PROBLEMS.notAnObject }),
			}).toEqual({ exitCode: 2, says: true })
		})
	}
})

describe('gate: a step the package declares', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	async function expectDeclaredNotWired(parameters: {
		argv: string[]
		list: 'fast' | 'full'
		extraLines: string[]
	}) {
		const { argv, list, extraLines } = parameters
		const counter = createCounter()
		const root = createUnwiredPackage({
			counter,
			scripts: ['check'],
			dialecte: {
				gate: {
					[list]: [
						{ name: 'check', run: 'npm run check' },
						{ name: 'lint', run: 'npm run lint' },
					],
				},
			},
		})

		const result = await runGateWith({ cwd: root, argv })

		expect({
			exitCode: result.exitCode,
			lines: stepLinesOf(result.output),
			runs: countRuns(counter),
		}).toEqual({
			exitCode: 1,
			lines: [
				notRun('check'),
				'FAIL  lint  declared but not wired (no npm script "lint")',
				...extraLines,
			],
			runs: 0,
		})
	}

	for (const { title, argv } of [{ title: 'a declared fast list', argv: ['--fast'] }]) {
		it(`${title} naming a script the package lacks → fails declared but not wired, whatever the mode, nothing ran`, async () => {
			// a fast run does not say the derived step it has no script for
			await expectDeclaredNotWired({ argv, list: 'fast', extraLines: [] })
		})
	}

	for (const { title, argv } of [{ title: 'a declared full list', argv: ['--full'] }]) {
		it(`${title} naming a script the package lacks → fails declared but not wired, whatever the mode, nothing ran`, async () => {
			// a full run says the derived step it has no script for
			await expectDeclaredNotWired({ argv, list: 'full', extraLines: [ABSENT_DERIVED_LINE] })
		})
	}

	it('an opt-out naming a step of declared lists → exit 2, the refusal names dialecte.gate.skip and the step', async () => {
		const root = createUnwiredPackage({
			counter: createCounter(),
			scripts: ['check'],
			dialecte: {
				gate: {
					fast: [{ name: 'lint', run: 'npm run lint' }],
					full: [{ name: 'lint', run: 'npm run lint' }],
					skip: { lint: 'no lint yet' },
				},
			},
		})

		await expect(runGateWith({ cwd: root, argv: ['--full'] })).resolves.toEqual({
			exitCode: 2,
			output: expect.stringMatching(/dialecte\.gate\.skip.*lint/s),
		})
	})

	it('a declared step running npm run skills:check -- --x without the script fails as unwired; a declared node step is never judged unwired', async () => {
		const unwired = createUnwiredPackage({
			counter: createCounter(),
			scripts: ['check'],
			dialecte: {
				gate: { fast: [{ name: 'skills', run: 'npm run skills:check -- --x' }] },
			},
		})
		const counter = createCounter()
		const node = createUnwiredPackage({
			counter,
			scripts: [],
			dialecte: { gate: { fast: [{ name: 'lint', run: 'node -e "process.exit(0)"' }] } },
		})

		const first = await runGateWith({ cwd: unwired, argv: ['--fast'] })
		const second = await runGateWith({ cwd: node, argv: ['--fast'] })

		expect({
			first: { exitCode: first.exitCode, lines: stepLinesOf(first.output) },
			second: { exitCode: second.exitCode, lines: stepLinesOf(second.output) },
		}).toEqual({
			first: {
				exitCode: 1,
				lines: ['FAIL  skills  declared but not wired (no npm script "skills:check")'],
			},
			second: { exitCode: 0, lines: ['ok    lint  exit 0'] },
		})
	})
})

describe(
	'gate: the record of an earlier run answers only a gate that is judged the same',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('a green full record written before steps could be unwired → reused by a wired gate, never by an unwired one, which fails as a fresh run does', async () => {
			const wiredCounter = createCounter()
			const wired = createUnwiredPackage({ counter: wiredCounter, scripts: ALL_DEFAULT_SCRIPTS })
			seedPreUnwiredFullRecord({ root: wired, skillsWired: true })
			const unwiredCounter = createCounter()
			const unwired = createUnwiredPackage({
				counter: unwiredCounter,
				scripts: DEFAULT_WIRED_SCRIPTS,
			})
			seedPreUnwiredFullRecord({ root: unwired, skillsWired: false })

			const wiredRun = await runGateWith({ cwd: wired, argv: ['--full', '--json'] })
			const unwiredRun = await runGateWith({ cwd: unwired, argv: ['--full'] })

			expect({
				wired: {
					exitCode: wiredRun.exitCode,
					reused: parseGateJson(wiredRun.output).reused,
					runs: countRuns(wiredCounter),
				},
				unwired: {
					exitCode: unwiredRun.exitCode,
					lines: stepLinesOf(unwiredRun.output),
					runs: countRuns(unwiredCounter),
				},
			}).toEqual({
				wired: { exitCode: 0, reused: true, runs: 0 },
				unwired: {
					exitCode: 1,
					lines: [
						notRun('check'),
						SKILLS_NOT_WIRED_FAIL_LINE,
						notRun('build'),
						notRun('tests'),
						notRun('rules'),
						ABSENT_DERIVED_LINE,
					],
					runs: 0,
				},
			})
		})
	},
)
