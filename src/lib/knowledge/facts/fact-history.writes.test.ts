/**
 * A torn-line repair writes its newline in its own write, so the line's write alone holds the bound (R1-7); a
 * writing `node:fs` stands behind `writeSync` and notes each buffer's size.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { written } from '../../../../test/writing-fs.ts'
import { appendHistory } from './fact-history.ts'
import { HISTORY_LINE_LIMIT } from './facts.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HistoryLine } from './facts.types.ts'

vi.mock('node:fs', async (importOriginal) => {
	const { writingFs } = await import('../../../../test/writing-fs.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return writingFs(actual)
})

afterEach(function disarm() {
	written.armed = false
	written.sizes.length = 0
})

/** A history line for fact `F-0001`. */
function lineOf(params: { ask: string }): HistoryLine {
	return {
		at: '2026-11-11T10:00:00.000Z',
		event: 'reused',
		fact: 'F-0001',
		lot: '0025',
		ask: params.ask,
	}
}

describe('appendHistory after a torn last line', () => {
	it('a line of exactly 4,096 bytes → accepted, the file holds the whole line, the torn one and the new one, and no write passes 4,096 bytes', () => {
		const folder = temporaryFolder('facts-history-torn-bound-')
		const file = join(folder, 'F-0001.history.jsonl')
		const whole = JSON.stringify(lineOf({ ask: 'q1' }))
		const torn = '{"at":"2026-11-11T10:0'
		const bare = Buffer.byteLength(`${JSON.stringify(lineOf({ ask: '' }))}\n`)
		const line = lineOf({ ask: 'x'.repeat(HISTORY_LINE_LIMIT - bare) })
		writeFileSync(file, `${whole}\n${torn}`)
		written.sizes.length = 0
		written.armed = true

		expect(appendHistory({ file, line })).toBeUndefined()
		written.armed = false

		expect({
			file: readFileSync(file, 'utf8'),
			largestWrite: Math.max(...written.sizes),
		}).toEqual({
			file: `${whole}\n${torn}\n${JSON.stringify(line)}\n`,
			largestWrite: HISTORY_LINE_LIMIT,
		})
	})
})
