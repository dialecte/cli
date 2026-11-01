import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../scratch-repository.ts'
import { describeLeftovers, listLeftovers } from './temp-leftovers.ts'

import { describe, expect, it } from 'vitest'

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

const DESCRIBE_CASES: Record<string, { names: string[]; message: string | undefined }> = {
	'no leftover → no message': { names: [], message: undefined },
	'one leftover → its count, singular, and its name': {
		names: ['dialecte-hook-a'],
		message: '1 temporary entry left: dialecte-hook-a',
	},
	'three leftovers → their count and their names, in their order': {
		names: ['dialecte-skills-b', 'dialecte-hook-a', 'dialecte-facts-c'],
		message: '3 temporary entries left: dialecte-skills-b, dialecte-hook-a, dialecte-facts-c',
	},
	'ten leftovers → all ten named, no "more"': {
		names: namesOf(10),
		message: `10 temporary entries left: ${namesOf(10).join(', ')}`,
	},
	'eleven leftovers → the first ten named, and 1 more': {
		names: namesOf(11),
		message: `11 temporary entries left: ${namesOf(10).join(', ')} and 1 more`,
	},
	'four hundred leftovers → the first ten named, and 390 more': {
		names: namesOf(400),
		message: `400 temporary entries left: ${namesOf(10).join(', ')} and 390 more`,
	},
}

describe('describeLeftovers', () => {
	for (const [name, row] of Object.entries(DESCRIBE_CASES))
		it(name, () => {
			expect(describeLeftovers({ names: row.names })).toBe(row.message)
		})
})
