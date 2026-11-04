/**
 * `dialecte record standard <folder> consulted <note> | not-consulted <reason>`: writes `standard.json` in the
 * hand-over folder - the state, the note (a reason for `not-consulted`) and the time. The line references of
 * what was read stay in the findings ledger.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { LINE_BREAK_PATTERN } from '../review-rounds/review-rounds.constants.ts'
import { readArguments } from '../review-rounds/round-arguments.ts'
import { handoverFolderRefusal } from '../review-rounds/worktree-state.ts'
import { RECORD_STANDARD_USAGE, STANDARD_FILE, STANDARD_STATES } from './standard.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { StandardRecord } from './standard.types.ts'

export function recordStandard(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [] })
	if (typeof read === 'string') return { exitCode: 2, output: `${RECORD_STANDARD_USAGE} (${read})` }
	const [folderWord, stateWord, ...noteWords] = read.words
	const state = STANDARD_STATES.find((known) => known === stateWord)
	const note = noteWords.join(' ').trim()
	if (!folderWord || !state || !note || LINE_BREAK_PATTERN.test(note))
		return { exitCode: 2, output: RECORD_STANDARD_USAGE }
	const folder = resolve(params.cwd, folderWord)
	const refusal = handoverFolderRefusal(folder)
	if (refusal) return { exitCode: 1, output: `record: ${refusal}` }
	mkdirSync(folder, { recursive: true })
	const path = join(folder, STANDARD_FILE)
	const record: StandardRecord = {
		state,
		note,
		at: (params.now ?? new Date()).toISOString(),
	}
	writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`)
	return { exitCode: 0, output: `record: standard ${state} - ${path}` }
}
