/**
 * Helpers of the tests of the agent verbs. The code under test (`classifyFamily`, `packetOf`, `recordKeys`) is called
 * from here, not from the test files: a test file calls these helpers inside its `expect(...)`, so the first frame of
 * the test file a failure reports is that assertion.
 */
import { classifyFamily } from '../src/lib/mutation/classify-family.ts'
import { packetOf } from '../src/lib/mutation/judge-packet.ts'
import { hashLine } from '../src/lib/mutation/judge.ts'
import { recordKeys } from '../src/lib/mutation/records-write.ts'
import { PACKET_FILE, PACKET_MUTATION } from './mutation-agent.constants.ts'
import { locationOfText } from './mutation-package.ts'

import type {
	FamilyGuess,
	JudgePacket,
	PacketInput,
	PacketSurvivor,
	RecordResult,
} from '../src/lib/mutation/mutation-agent.types.ts'
import type { MutationFamily } from '../src/lib/mutation/mutation.types.ts'
import type { ClassifyCase, PacketCall, RecordCall } from './mutation-agent.types.ts'

/** `const v1 = 1` ... `const v<count> = <count>`, one per line, no final newline. */
export function numberedSource(count: number): string {
	return Array.from(
		{ length: count },
		(_unused, index) => `const v${index + 1} = ${index + 1}`,
	).join('\n')
}

/** The text of line `line` of `numberedSource`. */
export function lineText(line: number): string {
	return `const v${line} = ${line}`
}

/** A survivor input at `line` whose reported line hash is the text of that line of `numberedSource`. */
export function inputAt(params: Partial<PacketInput> & { line: number }): PacketInput {
	const { key = `k${params.line}`, line, ...rest } = params
	return {
		key,
		line,
		mutation: PACKET_MUTATION,
		lineHash: hashLine({ text: lineText(line) }),
		...rest,
	}
}

/** The range of whole lines `from`..`to` of `numberedSource`, columns from 0 as `exactRange` writes them. */
export function linesRange(params: { from: number; to: number }): string {
	return `${PACKET_FILE}:${params.from}:0-${params.to}:${lineText(params.to).length}`
}

/** The packet of these inputs; the source is `numberedSource(40)` unless given (undefined = the file is gone). */
export function packetOfFirst(params: PacketCall): JudgePacket {
	const { survivors, file = PACKET_FILE } = params
	const source = 'source' in params ? params.source : numberedSource(40)
	return packetOf({ file, source, survivors })
}

export function firstSurvivor(params: PacketCall): PacketSurvivor {
	return packetOfFirst(params).survivors[0]
}

/** A packet of two survivors: line 20 (key abc123, a range, eight tests, a changed line) and line 3 (key def456). */
export function samplePacket(): JudgePacket {
	return packetOfFirst({
		survivors: [
			inputAt({
				line: 20,
				key: 'abc123',
				range: linesRange({ from: 20, to: 20 }),
				tests: Array.from({ length: 8 }, (_unused, index) => `test/a.test.ts#case ${index + 1}`),
				lineHash: hashLine({ text: 'const changed = 1' }),
			}),
			inputAt({ line: 3, key: 'def456' }),
		],
	})
}

/**
 * The family guess for the mutant `original` of the source. `range` gives the survivor's range (the smallest node
 * containing it decides); `text` gives only its start line (the original's first line, nearest that line, decides).
 */
export function classifyLocated(params: {
	testCase: ClassifyCase
	locating: 'range' | 'text'
}): FamilyGuess {
	const { testCase, locating } = params
	const {
		file = 'src/engine/a.ts',
		source,
		mutator,
		original,
		replacement = 'undefined',
	} = testCase
	const where = locationOfText({ file, source: source ?? '', text: original })
	return classifyFamily({
		file,
		source,
		mutation: `${mutator}: ${original} -> ${replacement}`,
		line: where.line,
		...(locating === 'range' ? { range: where.range } : {}),
	})
}

/** `recordKeys` with a wording record of key `n1` unless the call says otherwise. */
export function recordWith(params: { root: string } & RecordCall): RecordResult {
	return recordKeys({
		keys: ['n1'],
		family: 'wording' satisfies MutationFamily,
		reason: 'no output can differ here',
		removable: false,
		...params,
	})
}

/** A call of `recordWith` whose seam throws `message` between the records write and the ledger move. */
export function crashingRecord(params: { root: string; message: string }): () => RecordResult {
	return function crash() {
		return recordWith({
			root: params.root,
			afterRecordsWritten() {
				throw new Error(params.message)
			},
		})
	}
}
