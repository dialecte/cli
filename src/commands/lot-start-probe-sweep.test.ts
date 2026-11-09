/** `lot start` removes the hard-link probe leftovers of dead pids in the store root, and nothing else there (E5). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import { createStartWorkspace, snapshotOf } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { otherLivePid } from '../../test/other-live-pid.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { startLot } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LEFTOVER_TEXT = 'a probe left behind'

describe(
	'lot start, the leftovers of a probe in the store root',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a dead pid's .link-probe.tmp-<pid>-<n> files -> removed; a live pid's and foreign names byte-identical", () => {
			const start = createStartWorkspace()
			const dead = deadPid()
			const live = otherLivePid()
			const kept = [
				`.link-probe.tmp-${live}-1`,
				`.link-probe.tmp-${live}-2`,
				`link-probe.tmp-${dead}-1`,
				`.link-probe-${dead}-1`,
				`.link-probe.tmp-${dead}-1.bak`,
				'notes.txt',
			]
			mkdirSync(start.store, { recursive: true })
			for (const name of [`.link-probe.tmp-${dead}-1`, `.link-probe.tmp-${dead}-2`, ...kept])
				writeFileSync(join(start.store, name), LEFTOVER_TEXT)

			expect(
				startLot({ cwd: start.cwd, argv: [start.workspace.briefPath], now: START_NOW }),
			).toMatchObject({ exitCode: 0 })
			expect(
				Object.fromEntries(
					Object.entries(snapshotOf(start.store)).filter(([name]) => !name.startsWith(LOT_NAME)),
				),
			).toEqual(Object.fromEntries(kept.map((name) => [name, LEFTOVER_TEXT])))
		})
	},
)
