import { PACKET_FILE } from '../../../test/mutation-agent.constants.ts'
import { inputAt } from '../../../test/mutation-agent.ts'
import { SMALL_CASE_TIMEOUT } from '../../../test/mutation-package.constants.ts'
import { packetOf, renderPacket } from './judge-packet.ts'

import { describe, expect, it } from 'vitest'

import type { JudgePacket } from './mutation-agent.types.ts'

const MAX_BYTES = 12_000
const WINDOW_LINES = 31
const TEST_COUNT = 30

/** A line of three-byte characters, longer than a window line keeps. */
function wideLine(line: number): string {
	return `const 値${line} = '${'漢'.repeat(300)}'`
}

/** Both forms of the packet in bytes (UTF-8). */
function bytesOf(packet: JudgePacket): { json: number; text: number } {
	return {
		json: Buffer.byteLength(JSON.stringify(packet), 'utf8'),
		text: Buffer.byteLength(renderPacket({ packet }), 'utf8'),
	}
}

/** One survivor of lines 20..40 of a 60-line file of wide lines, with 30 long covering tests. */
function wideWindowPacket(): JudgePacket {
	const source = Array.from({ length: 60 }, (_unused, index) => wideLine(index + 1)).join('\n')
	return packetOf({
		file: PACKET_FILE,
		source,
		survivors: [
			inputAt({
				line: 20,
				range: `${PACKET_FILE}:20:0-40:10`,
				mutation: `ConditionalExpression: ${'漢'.repeat(150)} -> true`,
				tests: Array.from(
					{ length: TEST_COUNT },
					(_unused, index) => `test/漢.test.ts#${'漢'.repeat(250)} ${index}`,
				),
			}),
		],
	})
}

/** One survivor of a file that is gone, with a mutation text that alone is over the cap. */
function hugeMutationPacket(): JudgePacket {
	return packetOf({
		file: PACKET_FILE,
		source: undefined,
		survivors: [
			inputAt({
				line: 3,
				mutation: `ConditionalExpression: ${'漢'.repeat(5000)} -> true`,
				tests: Array.from(
					{ length: TEST_COUNT },
					(_unused, index) => `test/漢.test.ts#${'漢'.repeat(250)} ${index}`,
				),
			}),
		],
	})
}

describe(
	'packetOf: one survivor over the byte cap is shrunk, never dropped',
	{ timeout: SMALL_CASE_TIMEOUT },
	() => {
		it('wide window lines and long tests → the JSON and the text both within 12000 bytes', () => {
			expect(bytesOf(wideWindowPacket()).json).toBeLessThanOrEqual(MAX_BYTES)
			expect(bytesOf(wideWindowPacket()).text).toBeLessThanOrEqual(MAX_BYTES)
		})

		it('→ the window loses its context lines first, every line it drops counted; the survivor and its tests are kept and counted', () => {
			const packet = wideWindowPacket()
			const [survivor] = packet.survivors

			expect(survivor.window.lines.map(({ mutated }) => mutated)).toEqual(
				survivor.window.lines.map(() => true),
			)
			expect(survivor.window.lines.length).toBeLessThan(21)
			expect(survivor.window.lines.length).toBeGreaterThan(0)
			expect(survivor.window.lines.length + survivor.window.more).toBe(WINDOW_LINES)
			expect(survivor.tests.length + survivor.testsMore).toBe(TEST_COUNT)
			expect(packet.survivors).toHaveLength(1)
			expect(packet.more).toBe(0)
		})

		it('a mutation text over the cap on its own → both forms within 12000 bytes', () => {
			expect(bytesOf(hugeMutationPacket()).json).toBeLessThanOrEqual(MAX_BYTES)
			expect(bytesOf(hugeMutationPacket()).text).toBeLessThanOrEqual(MAX_BYTES)
		})

		it('→ its tests all moved to testsMore first, then its mutation cut, ending …', () => {
			expect(hugeMutationPacket().survivors[0]).toMatchObject({
				tests: [],
				testsMore: TEST_COUNT,
				mutation: expect.stringMatching(/^ConditionalExpression: 漢+…$/),
			})
		})
	},
)
