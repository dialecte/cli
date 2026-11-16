import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../scratch-repository.ts'
import { describeLeftovers, listLeftovers } from './temp-leftovers.ts'

import { describe, expect, it } from 'vitest'

import type { Leftover } from './temp-leftovers.types.ts'

/** `count` entry names, `entry-01` to `entry-<count>`. */
function namesOf(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `entry-${String(index + 1).padStart(2, '0')}`)
}

describe('listLeftovers', () => {
	it('an empty folder → no leftover', () => {
		const folder = temporaryFolder('dlt-guard-')

		expect(listLeftovers({ folder })).toEqual([])
	})

	it('files, folders and a link directly in the folder, entries nested in a folder → the direct entries only, sorted', () => {
		const folder = temporaryFolder('dlt-guard-')
		mkdirSync(join(folder, 'dialecte-skills-b', 'nested'), { recursive: true })
		writeFileSync(join(folder, 'dialecte-skills-b', 'nested', 'deep.txt'), 'deep\n')
		mkdirSync(join(folder, 'dialecte-hook-a'))
		writeFileSync(join(folder, 'tsx-0.sock.txt'), 'socket\n')
		symlinkSync(join(folder, 'dialecte-hook-a'), join(folder, 'dialecte-facts-c'))

		expect(listLeftovers({ folder })).toEqual([
			'dialecte-facts-c',
			'dialecte-hook-a',
			'dialecte-skills-b',
			'tsx-0.sock.txt',
		])
	})
})

/** Leftovers named only: no recorded maker, nothing inside, no holder. */
function bare(names: readonly string[]): Leftover[] {
	return names.map((name) => ({ name, holds: [], holders: [] }))
}

const DESCRIBE_CASES: Record<string, { leftovers: Leftover[]; message: string | undefined }> = {
	'no leftover → no message': { leftovers: [], message: undefined },
	'one leftover → its count, singular, and its name': {
		leftovers: bare(['dialecte-hook-a']),
		message: '1 temporary entry left: dialecte-hook-a',
	},
	'three leftovers → their count and their names, in their order': {
		leftovers: bare(['dialecte-skills-b', 'dialecte-hook-a', 'dialecte-facts-c']),
		message: '3 temporary entries left: dialecte-skills-b, dialecte-hook-a, dialecte-facts-c',
	},
	'ten leftovers → all ten named, no "more"': {
		leftovers: bare(namesOf(10)),
		message: `10 temporary entries left: ${namesOf(10).join(', ')}`,
	},
	'eleven leftovers → the first ten named, and 1 more': {
		leftovers: bare(namesOf(11)),
		message: `11 temporary entries left: ${namesOf(10).join(', ')} and 1 more`,
	},
	'four hundred leftovers → the first ten named, and 390 more': {
		leftovers: bare(namesOf(400)),
		message: `400 temporary entries left: ${namesOf(10).join(', ')} and 390 more`,
	},
	'a leftover with its maker, its paths and its holder → all three in brackets after its name': {
		leftovers: [
			{
				name: 'dialecte-review-a',
				origin: 'src/x.test.ts > x > y',
				holds: ['repo/.git/objects/maintenance.lock'],
				holders: ['41 git maintenance run --auto'],
			},
		],
		message:
			'1 temporary entry left: dialecte-review-a (made by src/x.test.ts > x > y; holds repo/.git/objects/maintenance.lock; open in 41 git maintenance run --auto)',
	},
	'a leftover with only what it holds → its paths alone': {
		leftovers: [{ name: 'dialecte-brief-b', holds: ['ws/a.txt', 'ws/b/'], holders: [] }],
		message: '1 temporary entry left: dialecte-brief-b (holds ws/a.txt, ws/b/)',
	},
}

describe('describeLeftovers', () => {
	for (const [name, row] of Object.entries(DESCRIBE_CASES))
		it(name, () => {
			expect(describeLeftovers({ leftovers: row.leftovers })).toBe(row.message)
		})
})
