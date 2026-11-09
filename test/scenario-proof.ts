/** The proof's driver: a host's loop of `wait` and `answer` over a simulated lot, under an injected clock and sleep. */
import { existsSync } from 'node:fs'

import { runLot } from '../src/commands/lot.ts'
import { withJson } from './lot-start-workspace.ts'
import { START_NOW } from './lot-start.constants.ts'
import {
	ANSWER_TABLE,
	PROOF_TIMEOUT_SECONDS,
	PROOF_TURN_LIMIT,
	SLOW_TIMEOUT_SECONDS,
} from './scenario-proof.constants.ts'
import { createWaitTime, waitJson } from './simulated-lot.ts'

import type { StartWorkspace } from './lot-start-workspace.types.ts'
import type {
	LoopStatus,
	RealStartOutcome,
	ScenarioRun,
	WaitObservation,
} from './scenario-proof.types.ts'

/** One `lot start <brief> --simulate <scenario> --json` of the workspace's brief; the name of the lot it made. */
export function startScenarioLot(params: { start: StartWorkspace; scenario: string }): string {
	const started = withJson(
		runLot({
			cwd: params.start.cwd,
			argv: ['start', params.start.workspace.briefPath, '--simulate', params.scenario, '--json'],
			now: START_NOW,
		}),
	)
	return (started.json as { lot?: string } | undefined)?.lot ?? ''
}

/** A real `lot start` of the same brief: whether it started and made its worktree. */
export function startRealLotOutcome(start: StartWorkspace): RealStartOutcome {
	const started = withJson(
		runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath, '--json'],
			now: START_NOW,
		}),
	)
	const json = started.json as { runner?: string; worktree?: string | null } | undefined
	return {
		exitCode: started.exitCode,
		runner: json?.runner,
		worktreeMade: typeof json?.worktree === 'string' && existsSync(json.worktree),
	}
}

/**
 * Drives the lot with a loop of `wait` (a clock and sleep that move together) and `lot answer` (the fixed table):
 * 3 -> every open question answered then wait again, 4 and 5 -> wait again, anything else ends the loop.
 * `observe` runs after each wait, before any answer.
 */
export async function driveScenario(params: {
	start: StartWorkspace
	lot: string
	scenario: string
	observe?: (observation: WaitObservation) => void
}): Promise<ScenarioRun> {
	const time = createWaitTime()
	const timeout = params.scenario === 'slow' ? SLOW_TIMEOUT_SECONDS : PROOF_TIMEOUT_SECONDS
	const run: ScenarioRun = { codes: [], answers: [] }
	for (let turn = 0; turn < PROOF_TURN_LIMIT; turn++) {
		const waited = await waitJson({
			cwd: params.start.repository,
			id: params.lot,
			time,
			words: ['--timeout', timeout],
		})
		run.codes.push(waited.exitCode)
		params.observe?.({ code: waited.exitCode, lot: params.lot })
		if (waited.exitCode === 3) {
			for (const question of (waited.json as LoopStatus).questions ?? [])
				run.answers.push(answerQuestion({ start: params.start, lot: params.lot, ...question }))
		} else if (waited.exitCode !== 4 && waited.exitCode !== 5) break
	}
	run.answers.sort()
	return run
}

/** Answers one question from the table; `<audience>:<exit code>`. */
function answerQuestion(params: {
	start: StartWorkspace
	lot: string
	id: string
	audience: 'caller' | 'person'
}): string {
	const row = ANSWER_TABLE[params.audience]
	const answered = runLot({
		cwd: params.start.repository,
		argv: [
			'answer',
			params.lot,
			params.id,
			row.answer,
			...(row.by === undefined ? [] : ['--by', row.by]),
		],
		now: START_NOW,
	})
	return `${params.audience}:${answered.exitCode}`
}
