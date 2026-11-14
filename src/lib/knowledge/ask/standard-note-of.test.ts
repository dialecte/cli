import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ASK_FILE } from '../../../../test/ask-command-workspace.constants.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { standardNoteOf } from './standard-note-of.ts'

import { describe, expect, it } from 'vitest'

type AskRecord = { ask: string; state: string; fact: string | null }

/** An asks folder holding the given asks; an ask given as `null` is a claimed folder with no record yet. */
function asksFolderOf(params: { asks: (AskRecord | { ask: string; record: null })[] }): string {
	const folder = join(temporaryFolder('dialecte-ask-note-'), 'asks')
	for (const entry of params.asks) {
		mkdirSync(join(folder, entry.ask), { recursive: true })
		if (!('record' in entry))
			writeFileSync(join(folder, entry.ask, ASK_FILE), `${JSON.stringify(entry)}\n`)
	}
	return folder
}

describe('standardNoteOf: the lot note recomputed from every ask of asks/ (D18)', () => {
	const rows: Record<
		string,
		{ asks: (AskRecord | { ask: string; record: null })[]; note: string }
	> = {
		'one ask that needs readers': {
			asks: [{ ask: 'A-0001', state: 'needs-readers', fact: null }],
			note: 'asks A-0001 needs-readers',
		},
		'three asks: an answer names its fact, the others their state': {
			asks: [
				{ ask: 'A-0001', state: 'needs-readers', fact: null },
				{ ask: 'A-0002', state: 'answered', fact: 'F-0003' },
				{ ask: 'A-0003', state: 'needs-person', fact: null },
			],
			note: 'asks A-0001 needs-readers · A-0002 answered F-0003 · A-0003 needs-person',
		},
		'ids in numeric order, the tenth after the ninth': {
			asks: [
				{ ask: 'A-0010', state: 'needs-readers', fact: null },
				{ ask: 'A-0002', state: 'needs-readers', fact: null },
			],
			note: 'asks A-0002 needs-readers · A-0010 needs-readers',
		},
		'a claimed folder with no record yet is left out': {
			asks: [
				{ ask: 'A-0001', state: 'needs-readers', fact: null },
				{ ask: 'A-0002', record: null },
			],
			note: 'asks A-0001 needs-readers',
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} -> ${row.note}`, () => {
			expect(standardNoteOf({ asksFolder: asksFolderOf({ asks: row.asks }) })).toBe(row.note)
		})
})
