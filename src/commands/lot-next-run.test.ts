/**
 * The `next` lines run end to end (G14, closing S1a R1-7): the line a status names, run as a host would run it,
 * works. A simulated working lot's wait line returns, an input-required lot's answer line records the answer, a
 * failed lot's stop line stops it, a ready simulated lot's result line answers.
 */
import { readAnswerFile } from '../../test/lot-questions.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { START_NOW } from '../../test/lot-start.constants.ts'
import { wordsOfNext } from '../../test/next-line.ts'
import { createWaitTime, startSimulated, waitSimulated } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotStatusOf } from './lot-status.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SimulatedLot } from '../../test/simulated-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The `next` of the lot's status, read from its records. */
function nextOf(lot: SimulatedLot): string {
	return lotStatusOf({ lotFolder: lot.lotFolder })?.next ?? ''
}

/** Plays `wait` on the lot until its scenario blocks it, as a host would after a start. */
async function waitedUntilBlocked(lot: SimulatedLot): Promise<void> {
	await waitSimulated({ lot, time: createWaitTime() })
}

describe('the next lines, run', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a simulated working lot (slow) -> its next line, dialecte lot wait <name> --timeout 60, runs and returns the ready lot', async () => {
		const lot = startSimulated({ scenario: 'slow' })
		const words = wordsOfNext({ next: nextOf(lot) })
		const time = createWaitTime()

		expect({ verb: words.slice(0, 2), timeout: words.slice(3) }).toEqual({
			verb: ['lot', 'wait'],
			timeout: ['--timeout', '60'],
		})
		await expect(
			waitLot({
				cwd: lot.start.repository,
				argv: [...words.slice(2), '--json'],
				clock: time.clock,
				sleep: time.sleep,
			}).then(withJson),
		).resolves.toMatchObject({ exitCode: 0, json: { state: 'ready' } })
	})

	it('an input-required lot (person) -> its next line with <answer> and <who> filled runs and records the answer by that person', async () => {
		const lot = startSimulated({ scenario: 'person' })
		await waitedUntilBlocked(lot)
		const words = wordsOfNext({ next: nextOf(lot), fill: { answer: 'accept', who: 'a-person' } })

		expect(words.slice(0, 2)).toEqual(['lot', 'answer'])
		expect(
			runLot({ cwd: lot.start.repository, argv: words.slice(1), now: START_NOW }).exitCode,
		).toBe(0)
		expect(readAnswerFile({ lotFolder: lot.lotFolder, number: 1 })).toMatchObject({
			question: 'q1',
			answer: 'accept',
			by: 'a-person',
		})
	})

	it('an input-required lot (caller question) -> its next line filled with keep and caller runs and records the answer by the caller', async () => {
		const lot = startSimulated({ scenario: 'question' })
		await waitedUntilBlocked(lot)
		const words = wordsOfNext({ next: nextOf(lot), fill: { answer: 'keep', who: 'caller' } })

		expect(words.slice(0, 2)).toEqual(['lot', 'answer'])
		expect(
			runLot({ cwd: lot.start.repository, argv: words.slice(1), now: START_NOW }).exitCode,
		).toBe(0)
		expect(readAnswerFile({ lotFolder: lot.lotFolder, number: 1 })).toMatchObject({
			answer: 'keep',
			by: 'caller',
		})
	})

	it('a failed lot (failure) -> its next line with <text> filled runs and stops the lot', async () => {
		const lot = startSimulated({ scenario: 'failure' })
		await waitedUntilBlocked(lot)
		const words = wordsOfNext({ next: nextOf(lot), fill: { text: 'giving up' } })

		expect(words.slice(0, 2)).toEqual(['lot', 'stop'])
		expect(
			runLot({ cwd: lot.start.repository, argv: words.slice(1), now: START_NOW }).exitCode,
		).toBe(0)
		expect(lotStatusOf({ lotFolder: lot.lotFolder })?.state).toBe('canceled')
	})

	it('a ready simulated lot (ready) -> its next line, dialecte lot result <name>, runs and answers exit 0 with the simulated result', async () => {
		const lot = startSimulated({ scenario: 'ready' })
		await waitedUntilBlocked(lot)
		const words = wordsOfNext({ next: nextOf(lot) })

		expect(words.slice(0, 2)).toEqual(['lot', 'result'])
		expect(
			withJson(runLot({ cwd: lot.start.repository, argv: [...words.slice(1), '--json'] })),
		).toMatchObject({ exitCode: 0, json: { state: 'ready', simulated: true } })
	})
})
