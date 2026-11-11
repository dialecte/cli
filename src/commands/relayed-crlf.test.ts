/**
 * R1-A5: relayed child output with CRLF line ends prints no carriage return, escaped or raw: the lines are split at
 * the line end whatever it is. Two relay sites: a failing gate step's tail and the scoped tests entry.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createGatePackage } from '../../test/scratch-checks.ts'
import { createScratchRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runGate } from './gate.ts'
import {
	CARRIAGE_RETURN_ESCAPE,
	CRLF_LINES,
	FAILING_CRLF_STEP,
	SCOPED_ENTRY_BOUND_MS,
	SCOPED_PACKAGE_FILES,
	SCOPED_TESTS_ENTRY,
	VITEST_WITH_CRLF,
} from './relayed-crlf.constants.ts'

import { describe, expect, it } from 'vitest'

describe(
	'a failing gate step whose child prints CRLF line ends',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('its tail is relayed -> each line on its own, no carriage return printed', async () => {
			const root = createGatePackage({
				fast: [FAILING_CRLF_STEP],
				files: { 'src/a.ts': 'export {}\n' },
			})

			const result = await runGate({ cwd: root, argv: [] })

			const lines = result.output.split('\n')
			expect(result.exitCode).toBe(1)
			expect(lines).toEqual(expect.arrayContaining(CRLF_LINES))
			expect(result.output).not.toContain(CARRIAGE_RETURN_ESCAPE)
			expect(result.output).not.toContain('\r')
		})
	},
)

describe(
	'the scoped tests entry relaying vitest output with CRLF line ends',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('vitest prints CRLF -> each line on its own, no carriage return printed', () => {
			const root = createScratchRepository(SCOPED_PACKAGE_FILES)
			const binary = join(root, 'node_modules', '.bin', 'vitest')
			mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
			writeFileSync(binary, VITEST_WITH_CRLF)
			chmodSync(binary, 0o755)
			const scope = temporaryFolder('dialecte-crlf-scope-')
			writeFileSync(join(scope, 'changed'), 'src/a.ts\0')

			const run = spawnSync(process.execPath, [SCOPED_TESTS_ENTRY], {
				cwd: root,
				encoding: 'utf8',
				timeout: SCOPED_ENTRY_BOUND_MS,
				env: {
					...process.env,
					DIALECTE_GATE_BASE: 'a'.repeat(40),
					DIALECTE_GATE_TREE: 'b'.repeat(40),
					DIALECTE_GATE_CHANGED: join(scope, 'changed'),
					DIALECTE_GATE_SELECTION: join(scope, 'selection.json'),
				},
			})

			expect(run.status).toBe(0)
			expect(run.stdout.split('\n')).toEqual(expect.arrayContaining(CRLF_LINES))
			expect(run.stdout).not.toContain(CARRIAGE_RETURN_ESCAPE)
			expect(run.stdout).not.toContain('\r')
		})
	},
)
