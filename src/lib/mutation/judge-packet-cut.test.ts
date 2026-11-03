import { PACKET_FILE } from '../../../test/mutation-agent.constants.ts'
import { inputAt } from '../../../test/mutation-agent.ts'
import { SMALL_CASE_TIMEOUT } from '../../../test/mutation-package.constants.ts'
import { packetOf } from './judge-packet.ts'

import { describe, expect, it } from 'vitest'

/** A text whose emoji (a surrogate pair) straddles the cut at `before` UTF-16 units. */
function straddling(before: number): string {
	return `${'x'.repeat(before)}😀${'y'.repeat(300)}`
}

/** The text holds no half of a surrogate pair. */
function isWellFormed(text: string): boolean {
	return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
}

describe('packetOf: a cut never splits a character', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('a window line cut where an emoji starts → well-formed text, the emoji left out whole', () => {
		const source = ['const a = 1', straddling(158), 'const b = 2'].join('\n')
		const [line] = packetOf({
			file: PACKET_FILE,
			source,
			survivors: [inputAt({ line: 2 })],
		}).survivors[0].window.lines.filter(({ mutated }) => mutated)

		expect(isWellFormed(line.text)).toBe(true)
		expect(line.text).toBe(`${'x'.repeat(158)}…`)
	})

	it('a test name cut where an emoji starts → well-formed text, the emoji left out whole', () => {
		const name = `test/a.test.ts#${straddling(198 - 'test/a.test.ts#'.length)}`
		const [test] = packetOf({
			file: PACKET_FILE,
			source: 'const a = 1',
			survivors: [inputAt({ line: 1, tests: [name] })],
		}).survivors[0].tests

		expect(isWellFormed(test)).toBe(true)
		expect(test).toBe(`${name.slice(0, 198)}…`)
	})
})
