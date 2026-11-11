/**
 * The recursion guard of the scoped tests entry: it hands the vitest it starts a depth one deeper than its own and
 * refuses to start at depth 2 or more (no vitest started), so a test that spawns the entry under a scoped run works
 * once and an endless nesting stops at the second level. Run in a scratch vitest package, never over this package.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../test/scratch-repository.ts'
import { createVitestPackage } from '../test/scratch-vitest-package.ts'
import { BASE, TREE } from '../test/step4-cases.constants.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../test/test-timing.constants.ts'
import {
	DEPTH_VARIABLE,
	ENTRY_KILL_BOUND_MS,
	NESTED_REFUSAL_PATTERN,
	RECORD_VARIABLE,
	SCOPED_TESTS_ENTRY,
	SCRATCH_FILES,
} from './scoped-tests-depth.constants.ts'

import { describe, expect, it } from 'vitest'

/** The entry run in a scratch package with `src/a.ts` changed, at `depth` when given; what it printed and recorded. */
function entryAt(params: { depth?: string }): {
	status: number | null
	lines: string[]
	record: string | undefined
} {
	const root = createVitestPackage({ files: SCRATCH_FILES })
	const scope = temporaryFolder('dialecte-depth-scope-')
	const record = join(scope, 'record.txt')
	writeFileSync(join(scope, 'changed'), 'src/a.ts\0')
	const { [DEPTH_VARIABLE]: _inherited, ...inherited } = process.env
	const run = spawnSync(process.execPath, [SCOPED_TESTS_ENTRY], {
		cwd: root,
		encoding: 'utf8',
		timeout: ENTRY_KILL_BOUND_MS,
		env: {
			...inherited,
			...(params.depth !== undefined && { [DEPTH_VARIABLE]: params.depth }),
			[RECORD_VARIABLE]: record,
			DIALECTE_GATE_BASE: BASE,
			DIALECTE_GATE_TREE: TREE,
			DIALECTE_GATE_CHANGED: join(scope, 'changed'),
			DIALECTE_GATE_SELECTION: join(scope, 'selection.json'),
		},
	})
	return {
		status: run.status,
		lines: `${run.stdout}${run.stderr}`.split('\n').filter((line) => line.trim() !== ''),
		record: existsSync(record) ? readFileSync(record, 'utf8') : undefined,
	}
}

describe(
	'the scoped tests entry and its recursion guard',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('started without a depth -> the vitest it starts sees depth 1', () => {
			const run = entryAt({})

			expect({ status: run.status, record: run.record }).toEqual({ status: 0, record: '1' })
		})

		it('started at depth 1 -> the vitest it starts sees depth 2', () => {
			const run = entryAt({ depth: '1' })

			expect({ status: run.status, record: run.record }).toEqual({ status: 0, record: '2' })
		})

		it('started at depth 1 -> runs as before: its related test runs, exit 0', () => {
			const run = entryAt({ depth: '1' })

			expect(run.status).toBe(0)
			expect(run.record).toBeDefined()
			expect(run.lines.some((line) => /Tests\s+1 passed \(1\)/.test(line))).toBe(true)
		})

		for (const depth of ['2', '3'])
			it(`started at depth ${depth} -> exit 2, one line saying it cannot start inside a nested scoped run, no vitest started`, () => {
				const run = entryAt({ depth })

				expect(run.status).toBe(2)
				expect(run.lines).toHaveLength(1)
				expect(run.lines[0]).toMatch(NESTED_REFUSAL_PATTERN)
				expect(run.record).toBeUndefined()
			})
	},
)
