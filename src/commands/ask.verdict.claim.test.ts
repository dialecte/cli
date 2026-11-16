/**
 * K3-c, D40 c: a verdict run claims its round (a `verdict.claim` file naming its process) before it records a fact,
 * so two runs on one round at once give one verdict.json and one fact; a claim left by a process that is gone is
 * taken over.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { A_YEAR_MS, ROUND_CLAIM_FILE } from '../../test/ask-answer-fixtures.constants.ts'
import { deadProcessId, factIdsIn, writeClaimFile } from '../../test/ask-answer-fixtures.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ROUND_ONE, ROUNDS_FOLDER } from '../../test/ask-pack-fixtures.constants.ts'
import {
	agreeingReportsOf,
	packedForVerdict,
	readVerdictRecord,
	reportFilesOf,
} from '../../test/ask-verdict-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runAskVerdict } from './ask-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { PackedForVerdict } from '../../test/ask-verdict-fixtures.types.ts'
import type { CommandOutput } from '../lib/command-output.types.ts'

/** Claims a run must respect: held by a live process however old, or just made by a process that is gone. */
const HELD_CLAIMS: Record<string, { pid: () => number; ageMs: number }> = {
	'a round claim held by a live process (this one), just made': {
		pid: () => process.pid,
		ageMs: 0,
	},
	'a round claim left by a process that is gone, just made': { pid: deadProcessId, ageMs: 0 },
}

const IN_PROGRESS = /(?=.*round 1)(?=.*in progress)/su

/** An ask whose round 1 is open and the files of two agreeing reports. */
async function agreedRound(): Promise<{ packed: PackedForVerdict; files: string[] }> {
	const packed = await packedForVerdict()
	return { packed, files: reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) }) }
}

/** The parameters of one `ask verdict` run over the files, in the packed ask's workspace. */
function runParamsOf(params: { packed: PackedForVerdict; files: string[] }): {
	argv: string[]
	cwd: string
	environment: NodeJS.ProcessEnv
} {
	const { packed } = params
	return {
		argv: [packed.ask, ...params.files, '--json'],
		cwd: packed.workspace.cwd,
		environment: packed.workspace.environment,
	}
}

/** Where the round's claim lives. */
function claimPathOf(params: { packed: PackedForVerdict }): string {
	return join(
		params.packed.asksFolder,
		params.packed.ask,
		ROUNDS_FOLDER,
		ROUND_ONE,
		ROUND_CLAIM_FILE,
	)
}

describe('ask verdict: one run at a time on a round (K3-c, D40 c)', () => {
	it(
		'a second run that starts while the first holds the round claim -> the second is refused (exit 2) naming the round in progress; the first answers: one verdict.json, one fact',
		async () => {
			const { packed, files } = await agreedRound()
			const seen: { second: CommandOutput | undefined } = { second: undefined }

			const first = await runAskVerdict({
				...runParamsOf({ packed, files }),
				afterClaim: async function startSecondRun() {
					seen.second = await runAskVerdict(runParamsOf({ packed, files }))
				},
			})

			expect({
				first: first.exitCode,
				second: seen.second,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				verdict: readVerdictRecord({ packed, round: ROUND_ONE }),
			}).toMatchObject({
				first: 0,
				second: { exitCode: 2, output: expect.stringMatching(IN_PROGRESS) },
				facts: ['F-0001'],
				verdict: { state: 'answered', fact: 'F-0001' },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a round claim held by a live process (this one) that recorded its start time, a year old (past the 10-minute cap) -> taken over: exit 0, the fact recorded, the claim removed',
		async () => {
			const { packed, files } = await agreedRound()
			writeClaimFile({ path: claimPathOf({ packed }), pid: process.pid, ageMs: A_YEAR_MS })

			const run = await runAskVerdict(runParamsOf({ packed, files }))

			expect({
				exitCode: run.exitCode,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				claimLeft: existsSync(claimPathOf({ packed })),
			}).toEqual({ exitCode: 0, facts: ['F-0001'], claimLeft: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a round claim left by a process that is gone, older than any stale limit -> taken over: exit 0, the fact recorded, the claim removed',
		async () => {
			const { packed, files } = await agreedRound()
			writeClaimFile({
				path: claimPathOf({ packed }),
				pid: deadProcessId(),
				ageMs: A_YEAR_MS,
			})

			const run = await runAskVerdict(runParamsOf({ packed, files }))

			expect({
				exitCode: run.exitCode,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				claimLeft: existsSync(claimPathOf({ packed })),
			}).toEqual({ exitCode: 0, facts: ['F-0001'], claimLeft: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it.each(Object.entries(HELD_CLAIMS))(
		'%s -> refused (exit 2) naming the round in progress; nothing recorded and the claim left as it was',
		async (_title, held) => {
			const { packed, files } = await agreedRound()
			writeClaimFile({ path: claimPathOf({ packed }), pid: held.pid(), ageMs: held.ageMs })

			const run = await runAskVerdict(runParamsOf({ packed, files }))

			expect({
				run,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				claimLeft: existsSync(claimPathOf({ packed })),
			}).toMatchObject({
				run: { exitCode: 2, output: expect.stringMatching(IN_PROGRESS) },
				facts: [],
				claimLeft: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
