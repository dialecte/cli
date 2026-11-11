/**
 * The print boundary over every command (P1.8) and the rows S2 left open (P1.7: R6-4, R6-5, R6-6, and the cli's
 * own catch). The first table runs the real cli, one row per command of the command map (per verb for a command
 * with verbs), plus the cli's own prints, with a forged value (a line feed, a carriage return, an escape sequence, an
 * override and a forged line) in what the command takes from outside the cli: no raw unsafe character, no line
 * beginning with the forged mark or a forged tail, on standard output and standard error together, judged by the
 * table's own list of characters; a row that quotes the value shows it escaped; a row whose usage line has `--json`
 * holds the JSON form (it holds the forged value as written) or states why it has none. A command or verb of the map
 * with no row fails the case: the rows are derived from the map, never from a list here. The closed rows run the
 * real cli too and assert the same: safe, and the value shown escaped.
 */
import { join } from 'node:path'

import { briefWith } from '../../../test/brief-workspace.ts'
import {
	ESCAPED_ESCAPE_CHARACTER,
	FORGED_KEY_DECLARATION,
	FORGED_LOT_DECLARATION,
	FORGED_STEPS,
	LEDGER_ROWS,
	OPEN_LOT_SCOPE,
} from '../../../test/print-closed-rows.constants.ts'
import {
	catchText,
	declarationOf,
	identityFieldText,
	ledgerOf,
	lotsFileBranchText,
	recapText,
	registryEntryText,
	startText,
} from '../../../test/print-closed-rows.ts'
import { printFaultsOf } from '../../../test/print-faults.ts'
import {
	FORGED_WORD,
	FORGED_WORD_ESCAPED_OVERRIDE,
	TABLE_PACKAGE_JSON,
} from '../../../test/print-table.constants.ts'
import { printReportOf, printRunCount, rowKeysOf } from '../../../test/print-table.ts'
import {
	createScratchRepository,
	isolateGitConfig,
	temporaryFolder,
} from '../../../test/scratch-repository.ts'
import {
	HANDOVER_CASE_TIMEOUT,
	PRINT_TABLE_TIMEOUT_PER_RUN,
} from '../../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClosedRow } from '../../../test/print-closed-rows.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Every closed row, in the order of the plan: R6-4, R6-5, R6-6, the catch of the cli. */
const CLOSED_ROWS: readonly ClosedRow[] = [
	{
		title:
			'lot start, a brief with a key no brief has, holding forged text -> the refusal line prints no raw character and no forged line, and shows the value escaped',
		print: async () => startText({ brief: briefWith({ [FORGED_WORD]: 1 }) }),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot start, a brief whose behaviour is forged text -> the refusal quoting it prints no raw character and no forged line, and shows the value escaped',
		print: async () => startText({ brief: briefWith({ steps: FORGED_STEPS }) }),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot start, a brief whose branch is forged text -> the refusal quoting it prints no raw character and no forged line, and shows the value escaped',
		print: async () => startText({ brief: briefWith({ branch: FORGED_WORD }) }),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot start --simulate --dry-run, a brief whose scope entry is forged text and meets an open lot -> the wouldRefuse line prints no raw character and no forged line, and shows the value escaped',
		print: async () =>
			startText({
				brief: briefWith({
					scope: ['src/dataflow/', `src/dataflow/${FORGED_WORD}`],
					lots: [{ paths: ['src/dataflow/'], message: 'feat: x' }],
				}),
				extra: ['--simulate', 'question', '--dry-run'],
				openScope: OPEN_LOT_SCOPE,
			}),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			"handover write --out <lot>, a lot whose identity branch is forged text -> the refusal naming the lot's branch prints no raw character and no forged line, and shows the value escaped",
		print: async () => identityFieldText('branch'),
		shows: ESCAPED_ESCAPE_CHARACTER,
	},
	{
		title:
			"handover write --out <lot>, a lot whose identity worktree is forged text -> the refusal naming the lot's worktree prints no raw character and no forged line, and shows the value escaped",
		print: async () => identityFieldText('worktree'),
		shows: ESCAPED_ESCAPE_CHARACTER,
	},
	{
		title:
			'handover write --out <lot>, a lots file whose branch is forged text -> the refusal prints no raw character and no forged line, and shows the value escaped',
		print: async () => lotsFileBranchText(),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'handover write --out <lot>, a committed registry entry whose name is forged text -> the refusal naming it prints no raw character and no forged line, and shows the value escaped',
		print: async () => registryEntryText(),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a ledger finding whose id holds forged text -> the review lines print no raw character and show the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.id)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a ledger finding whose severity holds forged text -> the round lines print no raw character and show the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.severity)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a ledger finding whose text holds forged text -> the review lines print no raw character and show the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.finding)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a ledger finding whose location holds forged text -> the review lines print no raw character and show the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.location)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a logged ledger finding holding forged text -> the follow-up lines print no raw character and show the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.logged)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, an accepted ledger finding whose reason holds forged text -> the decision lines print no raw character and show the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.reason)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a ledger state holding forged text -> the recap error quoting it prints no raw character and no forged line, and shows the value escaped',
		print: async () => recapText([ledgerOf(LEDGER_ROWS.state)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a lot.json whose accepted and revised cases hold forged reasons -> the decision lines print no raw character and no forged line, and show the value escaped',
		print: async () => recapText([declarationOf(FORGED_LOT_DECLARATION)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'lot recap, a lot.json whose entry holds a forged key -> the recap error quoting it prints no raw character and no forged line, and shows the value escaped',
		print: async () => recapText([declarationOf(FORGED_KEY_DECLARATION)]),
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
	{
		title:
			'a command that throws an error quoting a record (an api index holding forged text) -> the cli prints the message with no raw character and no forged line, and shows the value escaped',
		print: catchText,
		shows: FORGED_WORD_ESCAPED_OVERRIDE,
	},
]

describe(
	'the print table over the command map',
	{ timeout: PRINT_TABLE_TIMEOUT_PER_RUN * printRunCount() },
	() => {
		it('every command and verb of the map, and the cli own prints, run with a forged value in what they take -> each prints no raw unsafe character and no forged line, shows the escaped value where it quotes it, and answers JSON holding the value as written', async () => {
			isolateGitConfig()
			vi.stubEnv('XDG_STATE_HOME', join(temporaryFolder('dialecte-print-state-'), 'state'))
			vi.stubEnv('DIALECTE_CACHE_DIR', temporaryFolder('dialecte-print-cache-'))
			const shared = createScratchRepository({ 'package.json': TABLE_PACKAGE_JSON })

			await expect(
				printReportOf({
					keys: rowKeysOf(),
					cwdOf: (row) =>
						row.isolated ? createScratchRepository({ 'package.json': TABLE_PACKAGE_JSON }) : shared,
				}),
			).resolves.toEqual({
				missingRows: [],
				staleRows: [],
				missingReasons: [],
				jsonUnaccounted: [],
				timedOut: [],
				faults: {},
				notShown: [],
				jsonFaults: {},
			})
		})
	},
)

describe(
	'the closed rows of the lot verbs, the hand-over and the recap',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		for (const row of CLOSED_ROWS)
			it(row.title, async () => {
				await expect(
					row.print().then((text) => ({
						faults: printFaultsOf(text),
						shown: text.includes(row.shows),
					})),
				).resolves.toEqual({ faults: [], shown: true })
			})
	},
)
