import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { RECORD_TIME } from '../../../test/store-records.constants.ts'
import { transitionOf, writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { STORE_REFUSAL } from './store.constants.ts'
import { appendTransition, readTransitions } from './transitions.ts'

import { describe, expect, it } from 'vitest'

import type { Transition, TransitionDraft } from './store.types.ts'

/** A lot folder whose `transitions/` holds the given numbers as published records. */
function lotFolderWith(numbers: number[]): string {
	const lotFolder = temporaryFolder('dialecte-transitions-')
	mkdirSync(join(lotFolder, 'transitions'))
	for (const seq of numbers) {
		writeFileSync(
			join(lotFolder, 'transitions', `${String(seq).padStart(6, '0')}.json`),
			JSON.stringify(transitionOf({ seq })),
		)
	}
	return lotFolder
}

function draftOf(reason: string): TransitionDraft {
	const { seq: _seq, ...draft } = transitionOf({ seq: 0 })
	return { ...draft, cause: { ...draft.cause, reason } }
}

function namesIn(lotFolder: string): string[] {
	return readdirSync(join(lotFolder, 'transitions')).sort()
}

describe('readTransitions', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('records 1, 2 and 10 → in number order', () => {
		const lotFolder = lotFolderWith([2, 10, 1])

		expect(readTransitions({ lotFolder }).map((transition) => transition.seq)).toEqual([1, 2, 10])
	})

	it.each([
		'000003.json.tmp-123-1',
		'00003.json',
		'0000003.json',
		'000003.JSON',
		'000003.json.bak',
		'notes.txt',
	])('beside record 1, %s → never a record', (name) => {
		const lotFolder = lotFolderWith([1])
		writeRecordFile({
			folder: lotFolder,
			name: `transitions/${name}`,
			text: JSON.stringify(transitionOf({ seq: 3 })),
		})

		expect(readTransitions({ lotFolder }).map((transition) => transition.seq)).toEqual([1])
	})

	it('no transitions/ folder → none', () => {
		const lotFolder = temporaryFolder('dialecte-transitions-')

		expect(readTransitions({ lotFolder })).toEqual([])
	})
})

/** Root writes through a read-only file: the permission case means nothing there. */
const RUNS_AS_ROOT = process.getuid?.() === 0

describe('appendTransition', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('records 1 and 2 → publishes 000003.json, read-only, with seq 3 and the draft', () => {
		const lotFolder = lotFolderWith([1, 2])

		expect(appendTransition({ lotFolder, next: () => draftOf('third') }).seq).toBe(3)
		expect(namesIn(lotFolder)).toEqual(['000001.json', '000002.json', '000003.json'])
		const published = JSON.parse(
			readFileSync(join(lotFolder, 'transitions', '000003.json'), 'utf8'),
		) as Transition
		expect(published.seq).toBe(3)
		expect(published.cause.reason).toBe('third')
		expect(statSync(join(lotFolder, 'transitions', '000003.json')).mode & 0o777).toBe(0o444)
	})

	it('no record yet → seq 1, and next is given no last transition', () => {
		const lotFolder = lotFolderWith([])
		const seen: (number | undefined)[] = []

		expect(
			appendTransition({
				lotFolder,
				next: function record({ last }) {
					seen.push(last?.seq)
					return draftOf('first')
				},
			}).seq,
		).toBe(1)
		expect(seen).toEqual([undefined])
	})

	it('a temporary 000003.json.tmp-<pid>-1 beside record 2 → seq 3, the temporary never the highest', () => {
		const lotFolder = lotFolderWith([1, 2])
		writeRecordFile({ folder: lotFolder, name: 'transitions/000005.json.tmp-1-1', text: 'half' })

		expect(appendTransition({ lotFolder, next: () => draftOf('x') }).seq).toBe(3)
	})

	it('another writer publishes n + 1 between the read and the publish → exactly one holds 2, the loser re-reads and publishes 3', () => {
		const lotFolder = lotFolderWith([1])
		const lastSeen: (number | undefined)[] = []
		let winner: Transition | undefined

		expect(
			appendTransition({
				lotFolder,
				next: function loser({ last }) {
					lastSeen.push(last?.seq)
					return draftOf('loser')
				},
				afterRead: function otherWriter() {
					winner = appendTransition({ lotFolder, next: () => draftOf('winner') })
				},
			}).seq,
		).toBe(3)
		expect(winner?.seq).toBe(2)
		expect(lastSeen).toEqual([1, 2])
		expect(namesIn(lotFolder)).toEqual(['000001.json', '000002.json', '000003.json'])
		const second = JSON.parse(
			readFileSync(join(lotFolder, 'transitions', '000002.json'), 'utf8'),
		) as Transition
		expect(second.cause.reason).toBe('winner')
	})

	it('record 999999 present → refuses to publish 1,000,000, nothing written', () => {
		const lotFolder = lotFolderWith([999_999])

		expect(thrownBy(() => appendTransition({ lotFolder, next: () => draftOf('x') }))).toMatchObject(
			{
				name: STORE_REFUSAL,
				message: expect.stringContaining('1,000,000'),
			},
		)
		expect(existsSync(join(lotFolder, 'transitions', '1000000.json'))).toBe(false)
		expect(namesIn(lotFolder)).toEqual(['999999.json'])
	})

	it('record 999998 present → publishes 999999', () => {
		const lotFolder = lotFolderWith([999_998])

		expect(appendTransition({ lotFolder, next: () => draftOf('x') }).seq).toBe(999_999)
	})

	it.skipIf(RUNS_AS_ROOT)(
		'a record published read-only reached through a symlink → a write through it fails, the record unchanged (case 48)',
		() => {
			const lotFolder = lotFolderWith([1])

			expect(appendTransition({ lotFolder, next: () => draftOf('second') }).seq).toBe(2)
			const record = join(lotFolder, 'transitions', '000002.json')
			const before = readFileSync(record, 'utf8')
			// the link a worktree holds to its lot folder
			const link = join(temporaryFolder('dialecte-transitions-view-'), 'lot')
			symlinkSync(lotFolder, link)

			expect(() =>
				writeFileSync(join(link, 'transitions', '000002.json'), `${RECORD_TIME} rewritten`),
			).toThrow(/EACCES|EPERM/)
			expect(readFileSync(record, 'utf8')).toBe(before)
		},
	)
})
