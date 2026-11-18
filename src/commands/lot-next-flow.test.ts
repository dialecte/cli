/**
 * The manual next line of a working lot follows the repository's landing flow (FIX-ci-loop design, section 3): a
 * CI-first repository (its `ci.yml` runs on the merge queue and holds the `ci-ok` job) names `lot land <lot>`,
 * a hand-over repository names `handover write`; `lot start` and `lot status` say the same.
 */
import { createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const CI_FIRST_WORKFLOW = [
	'name: ci',
	'on: [pull_request, merge_group]',
	'jobs:',
	'  ci-ok:',
	'    name: ci-ok',
	'',
].join('\n')

const LAND_LINE = `run the stations, then dialecte lot land ${LOT_NAME}`
const HANDOVER_LINE = `run the stations, then dialecte handover write <lots.json> --out ${LOT_NAME}`

/** Each flow, the words its manual line names, and that line. */
const FLOWS = [
	{
		flow: 'CI-first',
		names: 'lot land',
		ciFirst: true,
		expected: LAND_LINE,
	},
	{
		flow: 'hand-over',
		names: 'handover write',
		ciFirst: false,
		expected: HANDOVER_LINE,
	},
]

/** A start workspace whose repository is CI-first when `ciFirst`: its workflow committed on main. */
function workspaceOf(ciFirst: boolean): StartWorkspace {
	const start = createStartWorkspace()
	if (ciFirst) {
		writeFiles({
			root: start.repository,
			files: { '.github/workflows/ci.yml': CI_FIRST_WORKFLOW },
		})
		git({ root: start.repository, args: ['add', '.github/workflows/ci.yml'] })
		git({
			root: start.repository,
			args: ['commit', '-q', '-m', 'ci: the merge queue workflow'],
		})
	}
	return start
}

/** The manual line of a `--json` answer: `next`, else the one of `also` that starts the stations. */
function manualLineOf(json: unknown): unknown {
	const answer = json as { next?: unknown; also?: unknown }
	const lines = [answer.next, ...(Array.isArray(answer.also) ? answer.also : [])]
	return lines.find((line) => typeof line === 'string' && line.startsWith('run the stations'))
}

describe('the manual next line follows the landing flow', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const { flow, names, ciFirst, expected } of FLOWS)
		it(`${flow} repository: lot start names ${names}`, () => {
			const start = workspaceOf(ciFirst)

			expect(
				manualLineOf(
					withJson(
						runLot({
							cwd: start.cwd,
							argv: ['start', start.workspace.briefPath, '--json'],
							now: START_NOW,
						}),
					).json,
				),
			).toBe(expected)
		})

	for (const { flow, names, ciFirst, expected } of FLOWS)
		it(`${flow} repository: lot status of the working lot names ${names}`, () => {
			const start = workspaceOf(ciFirst)
			runLot({
				cwd: start.cwd,
				argv: ['start', start.workspace.briefPath],
				now: START_NOW,
			})

			expect(
				manualLineOf(
					withJson(
						runLot({
							cwd: start.repository,
							argv: ['status', LOT_NAME, '--json'],
						}),
					).json,
				),
			).toBe(expected)
		})
})
