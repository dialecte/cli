import * as fs from 'node:fs'

/** The synchronous print: a short write on the descriptor loses nothing, every byte reaches the stream in order. */
import { BYTES_PER_WRITE, MULTI_BYTE_TEXT } from './print-synchronous.constants.ts'
import { printOut } from './print.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrintedText } from './print.types.ts'

vi.mock('node:fs', () => ({ writeSync: vi.fn() }))

const writtenChunks: Buffer[] = []

function shortWrite(_descriptor: number, data: string | Uint8Array): number {
	const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)
	const accepted = bytes.subarray(0, BYTES_PER_WRITE)
	writtenChunks.push(accepted)
	return accepted.length
}

describe('printOut synchronous', () => {
	beforeEach(function resetWrites() {
		writtenChunks.length = 0
		vi.mocked(fs.writeSync).mockReset()
		vi.mocked(fs.writeSync).mockImplementation(shortWrite as typeof fs.writeSync)
	})

	it('a long multi-byte text written 5 bytes at a time -> every byte written in order, then the line feed', () => {
		printOut({ stream: 'stdout', text: MULTI_BYTE_TEXT as PrintedText, synchronous: true })

		expect(Buffer.concat(writtenChunks).toString('utf8')).toBe(
			'héllo wörld 日本語 😀 fin de la ligne très longue ñ 😀 日本\n',
		)
	})

	it('a full pipe (EAGAIN on the second write) -> retried, every byte written once and in order', () => {
		let calls = 0
		vi.mocked(fs.writeSync).mockImplementation(function fullOnce(
			_descriptor: number,
			data: string | Uint8Array,
		): number {
			calls += 1
			if (calls === 2) throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' })
			return shortWrite(_descriptor, data)
		} as typeof fs.writeSync)

		expect(function write() {
			printOut({ stream: 'stdout', text: MULTI_BYTE_TEXT as PrintedText, synchronous: true })
		}).not.toThrow()
		expect(Buffer.concat(writtenChunks).toString('utf8')).toBe(`${MULTI_BYTE_TEXT}\n`)
	})

	it('a reader gone (EPIPE) -> writing stops, nothing thrown', () => {
		let calls = 0
		vi.mocked(fs.writeSync).mockImplementation(function goneAfterOne(
			_descriptor: number,
			data: string | Uint8Array,
		): number {
			calls += 1
			if (calls > 1) throw Object.assign(new Error('EPIPE'), { code: 'EPIPE' })
			return shortWrite(_descriptor, data)
		} as typeof fs.writeSync)

		expect(function write() {
			printOut({ stream: 'stdout', text: MULTI_BYTE_TEXT as PrintedText, synchronous: true })
		}).not.toThrow()
		expect(calls).toBe(2)
	})
})
