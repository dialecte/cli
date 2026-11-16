/**
 * `overlaps.jsonl` read back: only a line holding every key, of its type, counts; the rest is counted, never read, and
 * the card's scope line warns about it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildScopeLine } from '../gate-records/card-gates.ts'
import { readLotOverlaps } from './lot-overlaps.ts'
import { STORE_FILES } from './store.constants.ts'

import { afterEach, describe, expect, it } from 'vitest'

const RECORD = {
	schema: 1,
	at: '2026-11-17T20:00:00.000Z',
	verb: 'start',
	lot: '0009-repo-sub',
	met: ['src/a.ts meets src/a.ts'],
	by: 'person-a',
	reason: 'separate lines in one file',
}

const folders: string[] = []

afterEach(function removeFolders() {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A lot folder whose `overlaps.jsonl` holds `text`. */
function lotFolderWith(text: string): string {
	const folder = mkdtempSync(join(tmpdir(), 'dialecte-overlaps-'))
	folders.push(folder)
	writeFileSync(join(folder, STORE_FILES.overlaps), text)
	return folder
}

describe('readLotOverlaps', () => {
	it.each([
		{ label: 'no JSON', line: 'not json' },
		{ label: 'a key missing', line: JSON.stringify({ ...RECORD, reason: undefined }) },
		{ label: 'a key the record does not name', line: JSON.stringify({ ...RECORD, extra: 1 }) },
		{ label: 'another verb', line: JSON.stringify({ ...RECORD, verb: 'land' }) },
		{ label: 'met no list of texts', line: JSON.stringify({ ...RECORD, met: 'src/a.ts' }) },
	])('a line with $label beside a good one → the good one alone', ({ line }) => {
		const lotFolder = lotFolderWith(`${line}\n${JSON.stringify(RECORD)}\n`)

		expect(readLotOverlaps({ lotFolder })).toEqual({ overlaps: [RECORD], unreadable: 1 })
	})

	it('a last line without its line feed → skipped', () => {
		const lotFolder = lotFolderWith(`${JSON.stringify(RECORD)}\n${JSON.stringify(RECORD)}`)

		expect(readLotOverlaps({ lotFolder })).toEqual({ overlaps: [RECORD], unreadable: 1 })
	})
	it('a line that does not read → the card scope line warns, naming how many', () => {
		const lotFolder = lotFolderWith(`not json\n${JSON.stringify(RECORD)}\n`)

		expect(buildScopeLine({ folder: lotFolder })).toEqual({
			name: 'scope',
			status: 'warning',
			detail: `overlaps ${RECORD.lot}: ${RECORD.met[0]} (by ${RECORD.by}: ${RECORD.reason}) · 1 line(s) of overlaps.jsonl do not read`,
		})
	})

	it.each([
		{
			label: 'an undo of the record',
			undo: { lot: RECORD.lot, met: RECORD.met },
			overlaps: [],
			unreadable: 0,
		},
		{
			label: 'an undo holding a key it does not name',
			undo: { lot: RECORD.lot, met: RECORD.met, by: 'person-a' },
			overlaps: [RECORD],
			unreadable: 1,
		},
	])(
		'a record then $label → what stands, and how many lines do not read',
		({ undo, overlaps, unreadable }) => {
			const undoLine = JSON.stringify({ schema: 1, at: RECORD.at, verb: 'undo', ...undo })
			const lotFolder = lotFolderWith(`${JSON.stringify(RECORD)}\n${undoLine}\n`)

			expect(readLotOverlaps({ lotFolder })).toEqual({ overlaps, unreadable })
		},
	)
})
