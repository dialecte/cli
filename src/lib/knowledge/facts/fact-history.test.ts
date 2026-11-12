import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../../test/test-timing.constants.ts'
import { appendHistory, readHistory } from './fact-history.ts'
import { HISTORY_LINE_LIMIT } from './facts.constants.ts'

import { describe, expect, it } from 'vitest'

import type { HistoryLine } from './facts.types.ts'

/** A history line for fact `F-0001`. */
function lineOf(params: { event?: HistoryLine['event']; ask?: string }): HistoryLine {
	return {
		at: '2026-11-11T10:00:00.000Z',
		event: params.event ?? 'reused',
		fact: 'F-0001',
		lot: '0025',
		ask: params.ask ?? 'q1',
	}
}

/** A line whose JSON and final newline take exactly `bytes` bytes, padded in a field the ledger does not cut. */
function lineOfBytes(params: { bytes: number }): HistoryLine {
	const bare = Buffer.byteLength(`${JSON.stringify(lineOf({ ask: '' }))}\n`)
	return lineOf({ ask: 'x'.repeat(params.bytes - bare) })
}

/** The script a child process runs: appends `count` lines of about 4,000 bytes, tagged with its name. */
const APPEND_SCRIPT = `
import { appendHistory } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'fact-history.ts')).href)}
const [file, tag, count] = process.argv.slice(2)
for (let index = 0; index < Number(count); index++) {
	appendHistory({
		file,
		line: {
			at: '2026-11-11T10:00:00.000Z',
			event: 'reused',
			fact: 'F-0001',
			lot: tag,
			ask: String(index),
			note: 'x'.repeat(3900),
		},
	})
}
`

/** Runs the append script in a child node process; resolves its exit code and what it wrote to stderr. */
function runAppender(params: {
	script: string
	file: string
	tag: string
	count: number
}): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[params.script, params.file, params.tag, String(params.count)],
			{ stdio: ['ignore', 'ignore', 'pipe'] },
		)
		let stderr = ''
		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString()
		})
		child.on('exit', (code) => resolve({ code, stderr }))
	})
}

describe('appendHistory', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('two node processes appending lines near 4 KiB at once → every record parses whole, the count of records is the sum', async () => {
		const folder = temporaryFolder('facts-history-race-')
		const script = join(folder, 'append.mjs')
		writeFileSync(script, APPEND_SCRIPT)
		const file = join(folder, 'F-0001.history.jsonl')
		const count = 60

		const runs = await Promise.all([
			runAppender({ script, file, tag: 'a', count }),
			runAppender({ script, file, tag: 'b', count }),
		])

		expect(runs.map((run) => run.code)).toEqual([0, 0])
		expect(runs.map((run) => run.stderr)).toEqual(['', ''])
		const lines = readFileSync(file, 'utf8').split('\n')
		// a writer's torn-line check may see the other's append mid-write and add an empty line: no record
		const records = lines.filter((text) => text !== '')
		const parsed = records.map((record) => JSON.parse(record) as HistoryLine)
		expect({
			endsWithNewline: lines.at(-1) === '',
			count: parsed.length,
			byWriter: [
				parsed.filter((line) => line.lot === 'a').length,
				parsed.filter((line) => line.lot === 'b').length,
			],
		}).toEqual({ endsWithNewline: true, count: 2 * count, byWriter: [count, count] })
	})

	it('a line over 4,096 bytes → refused naming the bound, no file written', () => {
		const folder = temporaryFolder('facts-history-limit-')
		const file = join(folder, 'F-0001.history.jsonl')

		expect(() =>
			appendHistory({ file, line: lineOfBytes({ bytes: HISTORY_LINE_LIMIT + 1 }) }),
		).toThrow(/4,?096/)
		expect(existsSync(file)).toBe(false)
	})

	it('a line of exactly 4,096 bytes, newline included → accepted whole', () => {
		const folder = temporaryFolder('facts-history-bound-')
		const file = join(folder, 'F-0001.history.jsonl')

		expect(
			appendHistory({ file, line: lineOfBytes({ bytes: HISTORY_LINE_LIMIT }) }),
		).toBeUndefined()
		expect(statSync(file).size).toBe(HISTORY_LINE_LIMIT)
	})

	it('a history whose last line is torn → the next line starts on a new line, both readable, the torn one skipped', () => {
		const folder = temporaryFolder('facts-history-torn-')
		const file = join(folder, 'F-0001.history.jsonl')
		const whole = JSON.stringify(lineOf({ event: 'created', ask: 'q1' }))
		const torn = '{"at":"2026-11-11T10:0'
		const next = lineOf({ event: 'reused', ask: 'q2' })
		writeFileSync(file, `${whole}\n${torn}`)

		expect(appendHistory({ file, line: next })).toBeUndefined()
		expect(readFileSync(file, 'utf8')).toBe(`${whole}\n${torn}\n${JSON.stringify(next)}\n`)
		expect(readHistory({ folder, id: 'F-0001' }).map((line) => [line.event, line.ask])).toEqual([
			['created', 'q1'],
			['reused', 'q2'],
		])
	})
})
