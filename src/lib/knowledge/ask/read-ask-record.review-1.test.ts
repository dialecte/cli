/**
 * Review round 1, R1-17: the state of an ask's record is one of the ask states; a record holding any other word
 * reads as a refusal that names the file.
 */
import { join } from 'node:path'

import { BASE_ASK_JSON } from '../../../../test/ask-records-fixtures.constants.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { writeTextFile } from '../../../../test/standard-workspace.ts'
import { askStateOf } from './ask-state-of.ts'
import { readAskRecord } from './read-ask-record.ts'

import { describe, expect, it } from 'vitest'

const UNKNOWN_STATE = 'on-hold'

/** An ask folder whose `ask.json` holds a state no ask has; the folder and the file. */
function askFolderWithUnknownState(): { askFolder: string; file: string } {
	const askFolder = join(temporaryFolder('dialecte-ask-state-'), BASE_ASK_JSON.ask)
	const file = join(askFolder, 'ask.json')
	writeTextFile({
		path: file,
		text: `${JSON.stringify({ ...BASE_ASK_JSON, state: UNKNOWN_STATE }, null, '\t')}\n`,
	})
	return { askFolder, file }
}

describe('an ask record whose state is not an ask state', () => {
	it('readAskRecord -> refused, naming the file', () => {
		const { askFolder, file } = askFolderWithUnknownState()

		expect(readAskRecord({ askFolder })).toEqual({ refused: expect.stringContaining(file) })
	})

	it('askStateOf -> throws, naming the file', () => {
		const { askFolder, file } = askFolderWithUnknownState()

		expect(() => askStateOf({ askFolder })).toThrow(file)
	})
})
