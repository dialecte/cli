/**
 * `landed.json`: the fact a verb that acts writes once a lot merged, read back whole; a file that does not read as a
 * fact is damage, never a landing; no file is no fact.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readLanded, writeLanded } from './landed-record.ts'

import { describe, expect, it } from 'vitest'

import type { LandedFact } from './landed-record.types.ts'

const FACT: LandedFact = {
	schema: 1,
	how: 'tree',
	tip: 'a'.repeat(40),
	base: 'main',
	changeRequest: { number: 7, url: 'https://host.test/pull/7' },
	at: '2026-11-17T20:00:00.000Z',
}

describe('landed.json', () => {
	it('a fact written then read -> the same fact', () => {
		const lotFolder = temporaryFolder('dialecte-landed-')

		expect(writeLanded({ lotFolder, fact: FACT })).toBeUndefined()
		expect(readLanded({ lotFolder })).toEqual(FACT)
	})

	it.each<{ title: string; text: string; reason: string }>([
		{ title: 'torn JSON', text: '{"schema":1,"how":', reason: 'no JSON' },
		{
			title: 'an unknown evidence',
			text: JSON.stringify({ ...FACT, how: 'guess' }),
			reason: 'how is none of ancestor, host, tree',
		},
		{
			title: 'no tip',
			text: JSON.stringify({ ...FACT, tip: undefined }),
			reason: 'tip is no commit',
		},
		{
			title: 'a change request without its url',
			text: JSON.stringify({ ...FACT, changeRequest: { number: 7 } }),
			reason: 'changeRequest is no pull request',
		},
	])('a landed.json with $title -> damaged naming why, never landed', ({ text, reason }) => {
		const lotFolder = temporaryFolder('dialecte-landed-')
		writeFileSync(join(lotFolder, 'landed.json'), text)

		expect(readLanded({ lotFolder })).toEqual({
			damage: `landed.json does not read as a landed fact: ${reason}`,
		})
	})

	it.each([
		{
			title: 'its pull as lot land wrote it',
			text: '{"schema":1,"how":"tree","tip":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","base":"main","pull":{"number":7,"url":"https://host.test/pull/7"},"at":"2026-11-17T20:00:00.000Z"}',
		},
		{
			title: 'its pull unreadable',
			text: '{"schema":1,"how":"tree","tip":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","base":"main","pull":"seven","at":"2026-11-17T20:00:00.000Z"}',
		},
	])(
		'a landed.json written before the change request key, $title -> read undamaged, no change request known',
		({ text }) => {
			const lotFolder = temporaryFolder('dialecte-landed-')
			writeFileSync(join(lotFolder, 'landed.json'), text)

			const read = readLanded({ lotFolder })

			expect(read).toEqual(JSON.parse(text))
			expect(read).not.toHaveProperty('changeRequest')
		},
	)

	it('no landed.json -> no fact', () => {
		expect(readLanded({ lotFolder: temporaryFolder('dialecte-landed-') })).toBeUndefined()
	})
})
