/**
 * The proof seen from the inbox (G13, G19): a host that loops `wait` and `answer` over a simulated lot finds the lot
 * in `inbox --simulated` exactly while it waits on someone (a question open, ready, failed) and not while it works
 * (a limit, a timeout); without `--simulated` the lots are only counted.
 */
import { inboxIn } from '../../test/inbox-workspace.ts'
import { createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { INBOX_SAYS, INBOX_SAYS_PATTERN } from '../../test/scenario-proof.constants.ts'
import { driveScenario, startScenarioLot } from '../../test/scenario-proof.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SCENARIOS } from '../lib/store/scenarios.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What `inbox --simulated` said of `lot`: its state in the waiting list (`absent` without one) and whether the text lists it. */
function inboxSaysFrom(params: { lot: string; json: CommandResult; text: CommandResult }): string {
	const listed = withJson(params.json).json as { waiting: { lot: string; state: string }[] }
	const state = listed.waiting.find((status) => status.lot === params.lot)?.state ?? 'absent'
	return `${state}:${params.text.output.split('\n').some((line) => line.includes(params.lot))}`
}

/** Reads the inbox as a host would, in both forms, and keeps what it says of `lot` in `says`. */
function recordInboxSays(params: { says: string[]; start: StartWorkspace; lot: string }): void {
	const { start, lot } = params
	expect(
		inboxSaysFrom({
			lot,
			json: inboxIn({ cwd: start.repository, words: ['--simulated', '--json'] }),
			text: inboxIn({ cwd: start.repository, words: ['--simulated'] }),
		}),
	).toSatisfy(function keptWhenWellFormed(said: string) {
		params.says.push(said)
		return INBOX_SAYS_PATTERN.test(said)
	})
}

describe('every scenario seen from the inbox', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const scenario of Object.keys(SCENARIOS))
		it(`${scenario} -> after each wait the inbox lists the lot when the wait ended 0, 1 or 3 and not when it ended 4 or 5`, async () => {
			const start = createStartWorkspace()
			const says: string[] = []
			const run = await driveScenario({
				start,
				lot: startScenarioLot({ start, scenario }),
				scenario,
				observe: ({ lot }) => recordInboxSays({ says, start, lot }),
			})

			expect(says).toEqual(run.codes.map((code) => INBOX_SAYS[code]))
		})

	it('both lots of a scenario played to their end -> without --simulated nothing is listed and both are counted, exit 1', async () => {
		const start = createStartWorkspace()
		const lots = [
			startScenarioLot({ start, scenario: 'ready' }),
			startScenarioLot({ start, scenario: 'failure' }),
		]
		await driveScenario({ start, lot: lots[0], scenario: 'ready' })
		await driveScenario({ start, lot: lots[1], scenario: 'failure' })

		expect(withJson(inboxIn({ cwd: start.repository, words: ['--json'] }))).toEqual({
			exitCode: 1,
			json: { waiting: [], working: 0, simulated: 2, damaged: [] },
		})
	})
})
