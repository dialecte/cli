/**
 * `contrib` on a package with a scoped gate step: its lookup of full gate records resolves the base, so an unscoped
 * full step answers its step of the same name and command (A12b), a scoped full step never does (A22), and a
 * matching step of a green gate --release that covers full does (A18); one that does not cover answers nothing.
 */
import { createScopedStep, readScopedRuns } from '../../test/scoped-gate-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { countRuns, createCounter, runGateIn, seedFullGate } from '../../test/scratch-checks.ts'
import { SOURCE_FILE, SOURCE_TEXT } from '../../test/scratch-contrib.constants.ts'
import { counterStep, runContribIn } from '../../test/scratch-contrib.ts'
import { createScratchRepository } from '../../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'

/** The step as a plain one: the same name, command and counting, not scoped. */
function plainOf(step: GateStep): GateStep {
	return { name: step.name, run: step.run, counts: step.counts }
}

/**
 * A contributor whose gate `full` holds `docs` (unscoped, counting in its counter) and `bench` (scoped); its contrib
 * steps are `docs` as the gate has it and `bench` as a plain step of the same name and command.
 */
function scopedContribPackage(params: { docsCounter: string; release?: GateStep[] }) {
	const docs = counterStep({ counter: params.docsCounter, name: 'docs' })
	const bench = createScopedStep({ name: 'bench' })
	const plainBench = plainOf(bench.step)
	const full = [docs, bench.step]
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: {},
			dialecte: {
				profile: 'contributor',
				contrib: { steps: [docs, plainBench] },
				gate: { fast: full, full, ...(params.release && { release: params.release }) },
			},
		})}\n`,
		'.gitignore': 'node_modules\n',
		[SOURCE_FILE]: SOURCE_TEXT,
	})
	return { root, docs, bench }
}

describe('contrib: a scoped package', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('A12b and A22: a green gate --full holds an unscoped step and a scoped one → contrib reuses the unscoped step and runs the one of the same name and command the gate ran scoped', async () => {
		const docsCounter = createCounter()
		const { root, bench } = scopedContribPackage({ docsCounter })
		await seedFullGate(root)

		const result = await runContribIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(countRuns(docsCounter)).toBe(1)
		expect(readScopedRuns(bench)).toHaveLength(2)
	})

	it('A18: no gate --full, a green gate --release whose list covers full → contrib reuses its steps, the scoped one included (it ran on everything), nothing runs again', async () => {
		const docsCounter = createCounter()
		const { root, bench } = scopedContribPackage({ docsCounter })
		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(0)

		const result = await runContribIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(countRuns(docsCounter)).toBe(1)
		expect(readScopedRuns(bench)).toHaveLength(1)
	})

	it('R1-2: a package whose dialecte.gate is invalid (heavy: "yes" in gate.full) → exit 2 with the GateConfigError message', async () => {
		const tests = { name: 'tests', run: 'true' }
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({
				name: 'demo',
				scripts: {},
				dialecte: {
					profile: 'contributor',
					contrib: { steps: [tests] },
					gate: { full: [{ ...tests, heavy: 'yes' }] },
				},
			})}\n`,
			'.gitignore': 'node_modules\n',
			[SOURCE_FILE]: SOURCE_TEXT,
		})

		await expect(runContribIn({ cwd: root })).resolves.toEqual({
			exitCode: 2,
			output: expect.stringContaining('dialecte.gate.full, step "tests": "heavy" is true or false'),
		})
	})

	it('A18b: a green gate --release of a list that does not cover full → answers no contrib step: docs runs again', async () => {
		const docsCounter = createCounter()
		const docs = counterStep({ counter: docsCounter, name: 'docs' })
		const { root } = scopedContribPackage({ docsCounter, release: [docs] })
		const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
		expect(releaseGate.exitCode).toBe(0)

		const result = await runContribIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(countRuns(docsCounter)).toBe(2)
	})
})
