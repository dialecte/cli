/**
 * The gate with the forecast (33CO 4.2, decision Q6): a `--fast` run in a lot's worktree forecasts the lot as its last
 * step and records it with trigger `gate`; a conflict is a warning only, the gate's verdict and exit never change.
 */
import { SHARED_LINE2_A, SHARED_LINE2_B } from '../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { TEST_COUNT_LINE } from '../../test/scratch-checks.constants.ts'
import { runGateIn } from '../../test/scratch-checks.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readForecastRecord } from '../lib/coordination/forecast-record.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastWorkspace } from '../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The package's gate: one step that passes and prints a test count. */
const PACKAGE_JSON = `${JSON.stringify(
	{
		name: 'demo',
		version: '1.0.0',
		scripts: {},
		dialecte: {
			gate: {
				fast: [{ name: 'tests', run: `printf '%s\\n' '${TEST_COUNT_LINE}'`, counts: 'tests' }],
			},
		},
	},
	null,
	2,
)}\n`

/** A forecast workspace whose main (origin's and the local one) holds the package's gate. */
function gateWorkspace(): ForecastWorkspace {
	const workspace = createForecastWorkspace()
	commitOnMain({ workspace, files: { 'package.json': PACKAGE_JSON } })
	git({ root: workspace.repository, args: ['merge', '-q', '--ff-only', 'origin/main'] })
	return workspace
}

describe('the gate with the forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a gate run on the first lot while the second lot's work conflicts -> the first lot's forecast.jsonl gains the conflict line with trigger gate, the warning printed, the gate's verdict unchanged", async () => {
		const workspace = gateWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })

		const result = await runGateIn({ cwd: first.worktree, argv: ['--fast'] })

		expect({
			exitCode: result.exitCode,
			verdict: result.output.split('\n').filter((line) => line.startsWith('gate --fast:')),
			forecast: result.output
				.split('\n')
				.filter((line) => line.startsWith('forecast:') || line.startsWith(`! ${second.name}`)),
			lines: readForecastRecord({ lotFolder: first.lotFolder }).lines.map((line) => ({
				trigger: line.trigger,
				against: line.against,
				verdict: line.verdict,
			})),
		}).toEqual({
			exitCode: 0,
			verdict: ['gate --fast: green'],
			forecast: [
				'forecast: conflict',
				`! ${second.name}: forecast conflict: src/shared.ts:2-6 (content)`,
			],
			lines: [
				{ trigger: 'gate', against: 'main', verdict: 'clean' },
				{ trigger: 'gate', against: second.name, verdict: 'conflict' },
			],
		})
	})
})
