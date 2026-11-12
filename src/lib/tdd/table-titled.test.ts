import { locationOf } from '../../../test/moved-cases-fixture.ts'
import { isTableTitledAt } from './test-source.ts'

import { describe, expect, it } from 'vitest'

describe('isTableTitledAt', () => {
	const CASES: Record<string, { text: string; needle: string; tableTitled: boolean }> = {
		'it.each(rows)("$name") at the start of the call → a table title': {
			text: "it.each([{ name: 'a' }])('$name', () => { expect(1).toBe(1) })\n",
			needle: 'it.each',
			tableTitled: true,
		},
		'it.each(rows)("$name") at the parenthesis taking the title, where vitest locates it → a table title':
			{
				text: "it.each([{ name: 'a' }])('$name', () => { expect(1).toBe(1) })\n",
				needle: "('$name'",
				tableTitled: true,
			},
		'a plain it inside describe.each(rows)("$x") → a table title through its suite': {
			text: "describe.each([{ x: 1 }])('rows $x', () => {\n\tit('plain', () => { expect(1).toBe(1) })\n})\n",
			needle: "it('plain'",
			tableTitled: true,
		},
		'a plain it inside describe.for(rows)("$x") → a table title through its suite': {
			text: "describe.for([{ x: 1 }])('rows $x', () => {\n\tit('plain', () => { expect(1).toBe(1) })\n})\n",
			needle: "it('plain'",
			tableTitled: true,
		},
		'a plain it nested two describes below a describe.each → a table title': {
			text: "describe.each([{ x: 1 }])('rows $x', () => {\n\tdescribe('inner', () => {\n\t\tit('plain', () => { expect(1).toBe(1) })\n\t})\n})\n",
			needle: "it('plain'",
			tableTitled: true,
		},
		'test.for(rows)("$name") → a table title': {
			text: "test.for([{ name: 'a' }])('$name', () => { expect(1).toBe(1) })\n",
			needle: 'test.for',
			tableTitled: true,
		},
		'a plain it inside a plain describe → not a table title': {
			text: "describe('plain', () => {\n\tit('plain', () => { expect(1).toBe(1) })\n})\n",
			needle: "it('plain'",
			tableTitled: false,
		},
		'it.skipIf(condition)("t") → not a table title': {
			text: "it.skipIf(skipped)('t', () => { expect(1).toBe(1) })\n",
			needle: 'it.skipIf',
			tableTitled: false,
		},
		'a plain it beside a describe.each, not inside it → not a table title': {
			text: "describe.each([{ x: 1 }])('rows $x', () => {\n\tit('inside', () => { expect(1).toBe(1) })\n})\nit('beside', () => { expect(1).toBe(1) })\n",
			needle: "it('beside'",
			tableTitled: false,
		},
	}

	for (const [name, row] of Object.entries(CASES))
		it(name, () => {
			expect(
				isTableTitledAt({
					text: row.text,
					file: 'a.test.ts',
					location: locationOf({ text: row.text, needle: row.needle }),
				}),
			).toBe(row.tableTitled)
		})
})
