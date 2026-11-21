/**
 * The line that names a landed lot, read from its landed fact: the change request's number comes from the key
 * `changeRequest`; a fact written before that key names none, and its line no number sign.
 */
import { landedLineOf } from './lot-landing.ts'

import { describe, expect, it } from 'vitest'

import type { LandedFact } from './landed-record.types.ts'

const FACT: LandedFact = {
	schema: 1,
	how: 'host',
	tip: 'a'.repeat(40),
	base: 'main',
	changeRequest: { number: 7, url: 'https://host.test/pull/7' },
	at: '2026-11-17T20:00:00.000Z',
}

/** A landed.json as `lot land` wrote it before the key `changeRequest`: its pull request under the old key. */
const OLDER_FACT_TEXT =
	'{"schema":1,"how":"host","tip":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","base":"main","pull":{"number":7,"url":"https://host.test/pull/7"},"at":"2026-11-17T20:00:00.000Z"}'

describe('landedLineOf', () => {
	it.each([
		{
			name: 'a fact landed by the host through its change request',
			fact: FACT,
			line: 'landed on main at aaaaaaaaaaaa: pull request #7 merged',
		},
		{
			name: 'a fact written before the change request key, its number unknown',
			fact: JSON.parse(OLDER_FACT_TEXT) as LandedFact,
			line: 'landed on main at aaaaaaaaaaaa: pull request merged',
		},
	])('$name → its line', ({ fact, line }) => {
		expect(landedLineOf(fact)).toBe(line)
	})
})
