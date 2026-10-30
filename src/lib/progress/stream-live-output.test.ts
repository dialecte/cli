import { createStreamLiveOutput } from './stream-live-output.ts'

import { describe, expect, it } from 'vitest'

import type { LiveStream } from './stream-live-output.types.ts'

function fakeStream(params: { isTTY: boolean; columns?: number }): {
	stream: LiveStream
	chunks: string[]
} {
	const chunks: string[] = []
	return {
		chunks,
		stream: { isTTY: params.isTTY, columns: params.columns, write: (text) => chunks.push(text) },
	}
}

describe('createStreamLiveOutput', () => {
	it('not a terminal → not a tty, no width even when the stream names one; a line is written with its newline; a redrawn region writes nothing', () => {
		const { stream, chunks } = fakeStream({ isTTY: false, columns: 80 })

		const output = createStreamLiveOutput(stream)
		output.rewriteLines(['⠋ step 1 s'])
		output.writeLine('done')

		expect({ tty: output.tty, columns: output.columns, text: chunks.join('') }).toEqual({
			tty: false,
			columns: undefined,
			text: 'done\n',
		})
	})

	it('a terminal → a tty with the stream width; the region is drawn, then a finished line ends the text with its newline', () => {
		const { stream, chunks } = fakeStream({ isTTY: true, columns: 100 })

		const output = createStreamLiveOutput(stream)
		output.rewriteLines(['⠋ step 1 s', '  │ line 1'])
		const drawn = chunks.join('')
		output.writeLine('✓ step')

		expect({ tty: output.tty, columns: output.columns }).toEqual({ tty: true, columns: 100 })
		expect(drawn).toContain('⠋ step 1 s')
		expect(drawn).toContain('  │ line 1')
		const text = chunks.join('')
		const between = text.slice(drawn.length, text.lastIndexOf('✓ step'))
		expect(text.endsWith('✓ step\n')).toBe(true)
		// the drawn region is erased before the finished line: a carriage return or a cursor / erase sequence
		expect(between.includes('\r') || between.includes('\u001B[')).toBe(true)
	})
})
