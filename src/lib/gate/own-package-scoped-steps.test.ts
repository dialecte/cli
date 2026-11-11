/**
 * The commands this package's fast gate declares for its scoped steps, run as the gate runs them (a shell, from the
 * package root, the scoped variables set): with only a file no test relates to listed as changed, the tests step
 * runs no test and selects nothing, and the rules step passes. A step that ran the whole suite, or ignored the
 * changed list, fails here.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { scopeRunOf } from '../../../test/scope-run.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import {
	BASE,
	CHANGED_VARIABLE,
	ONLY_CHANGED_FILE,
	PACKAGE_ROOT,
	TREE,
} from '../../../test/step4-cases.constants.ts'
import {
	HELPER_SCENARIO_TIMEOUT,
	OWN_SCOPED_STEP_KILL_BOUND_MS,
} from '../../../test/test-timing.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { resolveGateSteps } from './gate-config.ts'
import { judgeSelection } from './selection.ts'

import { describe, expect, it } from 'vitest'

/**
 * The command of the own package's fast step `name`, as resolved; a failing one when there is no such step or it is
 * not scoped (the default `tests` step runs the suite itself: never run it from here).
 */
function commandOf(name: string): string {
	const steps = resolveGateSteps({ packageJson: readPackageJson(PACKAGE_ROOT), mode: 'fast' })
	const step = steps.find((each) => each.name === name)
	return step?.scoped === true ? step.run : 'echo no scoped step; exit 99'
}

/** Runs `command` from the package root with the scoped variables of a gate whose only changed path is `ONLY_CHANGED_FILE`. */
function runScoped(command: string) {
	const folder = temporaryFolder('dialecte-own-scoped-')
	writeFiles({ root: folder, files: { changed: `${ONLY_CHANGED_FILE}\0` } })
	const selection = join(folder, 'selection.json')
	const run = spawnSync('sh', ['-c', command], {
		cwd: PACKAGE_ROOT,
		encoding: 'utf8',
		timeout: OWN_SCOPED_STEP_KILL_BOUND_MS,
		env: {
			...process.env,
			DIALECTE_GATE_BASE: BASE,
			DIALECTE_GATE_TREE: TREE,
			[CHANGED_VARIABLE]: join(folder, 'changed'),
			DIALECTE_GATE_SELECTION: selection,
		},
	})
	return {
		status: run.status,
		output: `${run.stdout}${run.stderr}`,
		selection,
		scopeRun: scopeRunOf({ base: BASE, tree: TREE, changedCount: 1, folder }),
	}
}

describe('the own package’s scoped fast steps, run as the gate runs them', () => {
	it(
		'only a file no test relates to is changed → the tests step exits 0 without a test line and selects nothing',
		{ timeout: HELPER_SCENARIO_TIMEOUT },
		() => {
			const ran = runScoped(commandOf('tests'))

			expect({ status: ran.status, ranTests: /^\s*Tests\s/m.test(ran.output) }).toEqual({
				status: 0,
				ranTests: false,
			})
			expect(judgeSelection({ path: ran.selection, scopeRun: ran.scopeRun })).toMatchObject({
				selection: { base: BASE, tree: TREE, changed: 1, ids: [] },
			})
		},
	)

	it(
		'the same changed list → the rules step reads it and exits 0',
		{ timeout: HELPER_SCENARIO_TIMEOUT },
		() => {
			const ran = runScoped(commandOf('rules'))

			expect({ status: ran.status, output: ran.output }).toMatchObject({ status: 0 })
		},
	)
})
