import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { PACKET_FILE, PACKET_MUTATION } from '../../../test/mutation-agent.constants.ts'
import {
	firstSurvivor,
	inputAt,
	lineText,
	linesRange,
	numberedSource,
	packetOfFirst,
	samplePacket,
} from '../../../test/mutation-agent.ts'
import { SCOPE_FILE, SMALL_CASE_TIMEOUT } from '../../../test/mutation-package.constants.ts'
import {
	ledgerKeyOf,
	mutationPackage,
	reportedRun,
	runFiles,
	storedReportedRun,
	survivorOf,
} from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../../test/scratch-tree.ts'
import { judgePackets, packetOf, renderPacket } from './judge-packet.ts'
import { hashLine } from './judge.ts'
import { readLedger, scheduleItems, updateLedger } from './ledger.ts'
import { MUTATION_RUNS_FOLDER, MUTATION_STORE_FOLDER } from './mutation.constants.ts'

import { describe, expect, it } from 'vitest'

import type { JudgePacket } from './mutation-agent.types.ts'

const FILE = PACKET_FILE
const MUTATION = PACKET_MUTATION
const SOURCE = numberedSource(40)

describe('packetOf: the window', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('no range → the start line ±5, only the start line marked', () => {
		expect(firstSurvivor({ survivors: [inputAt({ line: 20 })] }).window).toEqual({
			lines: Array.from({ length: 11 }, (_unused, index) => ({
				line: 15 + index,
				text: lineText(15 + index),
				mutated: 15 + index === 20,
			})),
			more: 0,
		})
	})

	it('a range of three lines → every line of it marked, ±5 around the whole range', () => {
		expect(
			firstSurvivor({
				survivors: [inputAt({ line: 20, range: linesRange({ from: 20, to: 22 }) })],
			}).window.lines.map(({ line, mutated }) => [line, mutated]),
		).toEqual(
			Array.from({ length: 13 }, (_unused, index) => [
				15 + index,
				[20, 21, 22].includes(15 + index),
			]),
		)
	})

	it('a mutant near the start of the file → the window starts at line 1', () => {
		expect(
			firstSurvivor({ survivors: [inputAt({ line: 2 })] }).window.lines.map(({ line }) => line),
		).toEqual([1, 2, 3, 4, 5, 6, 7])
	})

	it('a mutant near the end of the file → the window ends at the last line', () => {
		expect(
			firstSurvivor({
				source: numberedSource(30),
				survivors: [inputAt({ line: 29 })],
			}).window.lines.map(({ line }) => line),
		).toEqual([24, 25, 26, 27, 28, 29, 30])
	})

	it('a window of more than 21 lines → 21 lines from its start, the rest counted in more', () => {
		// lines 20..40 mutated: with the context the window is lines 15..45, 31 lines
		const survivors = [inputAt({ line: 20, range: linesRange({ from: 20, to: 40 }) })]

		expect(firstSurvivor({ source: numberedSource(60), survivors }).window.more).toBe(10)
		expect(
			firstSurvivor({ source: numberedSource(60), survivors }).window.lines.map(({ line }) => line),
		).toEqual(Array.from({ length: 21 }, (_unused, index) => 15 + index))
	})

	it('a window of exactly 21 lines → whole, nothing counted in more', () => {
		// lines 20..30 mutated: with the context the window is lines 15..35, 21 lines
		const survivors = [inputAt({ line: 20, range: linesRange({ from: 20, to: 30 }) })]

		expect(firstSurvivor({ source: numberedSource(60), survivors }).window.more).toBe(0)
		expect(firstSurvivor({ source: numberedSource(60), survivors }).window.lines).toHaveLength(21)
	})

	it('a line over 160 characters → cut, ending …; a line of exactly 160 → whole', () => {
		const long = `const long = '${'x'.repeat(300)}'`
		const exact = `const exact = '${'y'.repeat(160 - "const exact = ''".length)}'`
		const source = ['const a = 1', long, exact, 'const b = 2'].join('\n')
		const survivors = [inputAt({ line: 2 })]

		expect(firstSurvivor({ source, survivors }).window.lines[1].text.length).toBe(160)
		expect(firstSurvivor({ source, survivors }).window.lines[1].text.endsWith('…')).toBe(true)
		expect(firstSurvivor({ source, survivors }).window.lines[1].text.slice(0, -1)).toBe(
			long.slice(0, 159),
		)
		expect(firstSurvivor({ source, survivors }).window.lines[2].text).toBe(exact)
	})

	it('a file that is gone → no lines, nothing more', () => {
		expect(firstSurvivor({ source: undefined, survivors: [inputAt({ line: 20 })] }).window).toEqual(
			{ lines: [], more: 0 },
		)
	})
})

describe('packetOf: the covering tests', { timeout: SMALL_CASE_TIMEOUT }, () => {
	function namesOf(count: number): string[] {
		return Array.from({ length: count }, (_unused, index) => `test/a.test.ts#case ${index + 1}`)
	}

	it('five tests → all named, none left out', () => {
		expect(firstSurvivor({ survivors: [inputAt({ line: 5, tests: namesOf(5) })] })).toMatchObject({
			tests: namesOf(5),
			testsMore: 0,
		})
	})

	it('eight tests → the first five, the other three counted', () => {
		expect(firstSurvivor({ survivors: [inputAt({ line: 5, tests: namesOf(8) })] })).toMatchObject({
			tests: namesOf(5),
			testsMore: 3,
		})
	})

	it('no tests → an empty list and none left out', () => {
		expect(firstSurvivor({ survivors: [inputAt({ line: 5 })] })).toMatchObject({
			tests: [],
			testsMore: 0,
		})
	})

	it('a name over 200 characters → cut, ending …; one of exactly 200 → whole', () => {
		const long = `test/a.test.ts#${'n'.repeat(300)}`
		const exact = `test/a.test.ts#${'m'.repeat(200 - 'test/a.test.ts#'.length)}`
		const survivors = [inputAt({ line: 5, tests: [long, exact] })]

		expect(firstSurvivor({ survivors }).tests[0].length).toBe(200)
		expect(firstSurvivor({ survivors }).tests[0].endsWith('…')).toBe(true)
		expect(firstSurvivor({ survivors }).tests[0].slice(0, -1)).toBe(long.slice(0, 199))
		expect(firstSurvivor({ survivors }).tests[1]).toBe(exact)
	})
})

describe('packetOf: what changed since the run', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it.each([
		['the line is the one reported', hashLine({ text: lineText(20) }), SOURCE, false],
		[
			'the line differs only by its surrounding whitespace',
			hashLine({ text: `   ${lineText(20)}\t` }),
			SOURCE,
			false,
		],
		['the line text differs', hashLine({ text: 'const other = 1' }), SOURCE, true],
		['the file is gone', hashLine({ text: lineText(20) }), undefined, true],
	])('%s → lineChanged %s', (_label, lineHash, source, changed) => {
		expect(
			firstSurvivor({ source, survivors: [inputAt({ line: 20, lineHash })] }).lineChanged,
		).toBe(changed)
	})
})

describe('packetOf: the guess and the commands', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('a guess the classifier names → the family in the record command; the guess and its reason in the packet', () => {
		expect(
			packetOf({
				file: 'src/engine/limits.constants.ts',
				source: SOURCE,
				survivors: [inputAt({ line: 3, key: 'abc123' })],
			}).survivors[0],
		).toMatchObject({
			familyGuess: 'static-init',
			guessReason: expect.stringMatching(/\S/),
			commands: {
				record:
					'dialecte mutants record --key abc123 --family static-init --reason "<why no output can change>"',
			},
		})
	})

	it('an unclassified guess → <family> in the record command', () => {
		expect(
			firstSurvivor({
				survivors: [
					inputAt({ line: 3, key: 'abc123', mutation: 'ConditionalExpression: zzz() -> true' }),
				],
			}),
		).toMatchObject({
			familyGuess: 'unclassified',
			commands: {
				record:
					'dialecte mutants record --key abc123 --family <family> --reason "<why no output can change>"',
			},
		})
	})

	it('the schedule command names the survivor key after the follow-up placeholder', () => {
		expect(
			firstSurvivor({ survivors: [inputAt({ line: 3, key: 'abc123' })] }).commands.schedule,
		).toBe('dialecte mutants schedule <follow-up> abc123')
	})

	it('the file command holds the file', () => {
		expect(packetOfFirst({ survivors: [inputAt({ line: 3 })] }).recordFile).toContain(
			`dialecte mutants record --file ${FILE} --family`,
		)
	})

	it('the survivor keeps its key, line, mutation and range', () => {
		const range = linesRange({ from: 3, to: 3 })

		expect(
			firstSurvivor({ survivors: [inputAt({ line: 3, key: 'abc123', range })] }),
		).toMatchObject({ key: 'abc123', line: 3, mutation: MUTATION, range })
	})
})

describe('packetOf: the caps', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('ten survivors → all in, none counted', () => {
		const survivors = Array.from({ length: 10 }, (_unused, index) => inputAt({ line: index + 1 }))

		expect(packetOfFirst({ survivors })).toMatchObject({
			survivors: survivors.map(({ key }) => expect.objectContaining({ key })),
			more: 0,
		})
	})

	it('eleven survivors → the first ten, one counted', () => {
		const survivors = Array.from({ length: 11 }, (_unused, index) => inputAt({ line: index + 1 }))

		expect(packetOfFirst({ survivors })).toMatchObject({
			survivors: survivors.slice(0, 10).map(({ key }) => expect.objectContaining({ key })),
			more: 1,
		})
	})

	describe('a byte cap that several survivors fit under', () => {
		const MAX_BYTES = 12_000
		const TOTAL = 10
		function wide(index: number): string {
			return `const w${index} = '${'x'.repeat(140)}'`
		}
		const source = Array.from({ length: 200 }, (_unused, index) => wide(index + 1)).join('\n')
		const survivors = Array.from({ length: TOTAL }, (_unused, index) =>
			inputAt({ line: 20 + index * 15, key: `wide-${index}`, lineHash: 'h' }),
		)

		it('→ more than one kept, kept + more = total, and the next survivor would not have fitted', () => {
			expect(packetOf({ file: FILE, source, survivors })).toSatisfy(function stoppedByTheBytes(
				packet: JudgePacket,
			) {
				const kept = packet.survivors.length
				const next = packetOf({ file: FILE, source, survivors: [survivors[kept]] }).survivors[0]
				const widened = { ...packet, survivors: [...packet.survivors, next], more: packet.more - 1 }
				return (
					kept >= 2 &&
					kept < TOTAL &&
					kept + packet.more === TOTAL &&
					(Buffer.byteLength(JSON.stringify(widened), 'utf8') > MAX_BYTES ||
						Buffer.byteLength(renderPacket({ packet: widened }), 'utf8') > MAX_BYTES)
				)
			})
		})
	})

	describe('a large file', () => {
		const MAX_BYTES = 12_000
		const COUNT = 60
		// multi-byte characters: a count of characters would let the packet pass at about twice the bytes
		function longLine(index: number): string {
			return `const v${index} = '${'é'.repeat(300)}'`
		}
		const source = Array.from({ length: 200 }, (_unused, index) => longLine(index + 1)).join('\n')
		const survivors = Array.from({ length: COUNT }, (_unused, index) =>
			inputAt({
				line: 5 + index * 3,
				key: `key-${String(index).padStart(2, '0')}`,
				mutation: `ConditionalExpression: ${'é'.repeat(100)} -> true`,
				lineHash: hashLine({ text: longLine(5 + index * 3) }),
				tests: Array.from(
					{ length: 30 },
					(_test, test) => `test/é.test.ts#${'é'.repeat(300)} ${test}`,
				),
			}),
		)

		it('60 survivors on long lines with long test names → the JSON within 12000 bytes', () => {
			expect(
				Buffer.byteLength(JSON.stringify(packetOf({ file: FILE, source, survivors })), 'utf8'),
			).toBeLessThanOrEqual(MAX_BYTES)
		})

		it('→ the text within 12000 bytes too', () => {
			expect(
				Buffer.byteLength(
					renderPacket({ packet: packetOf({ file: FILE, source, survivors }) }),
					'utf8',
				),
			).toBeLessThanOrEqual(MAX_BYTES)
		})

		it('→ the survivors left out are counted: kept + more = 60', () => {
			expect(packetOf({ file: FILE, source, survivors })).toSatisfy(
				function keptAndLeftOut(packet: { survivors: unknown[]; more: number }) {
					return packet.survivors.length + packet.more === COUNT && packet.survivors.length >= 1
				},
			)
		})

		it('→ the kept survivors are the first ones', () => {
			expect(packetOf({ file: FILE, source, survivors })).toSatisfy(
				function keptAreTheFirst(packet: { survivors: { key: string }[] }) {
					return packet.survivors.every(({ key }, index) => key === survivors[index].key)
				},
			)
			expect(packetOf({ file: FILE, source, survivors }).more).toBeGreaterThan(0)
		})

		it('→ the text says how many survivors it leaves out', () => {
			expect(renderPacket({ packet: packetOf({ file: FILE, source, survivors }) })).toContain(
				`…and ${packetOf({ file: FILE, source, survivors }).more} more`,
			)
		})
	})
})

describe('renderPacket', { timeout: SMALL_CASE_TIMEOUT }, () => {
	const KEY = 'abc123'

	it('a head line naming the file and how many survivors are pending', () => {
		expect(renderPacket({ packet: samplePacket() }).split('\n')[0]).toMatch(
			/^src\/engine\/a\.ts - 2 pending survivors/,
		)
	})

	it('one survivor → "survivor", not "survivors"', () => {
		expect(
			renderPacket({ packet: packetOfFirst({ survivors: [inputAt({ line: 3 })] }) }).split('\n')[0],
		).toMatch(/^src\/engine\/a\.ts - 1 pending survivor$/)
	})

	it('each survivor: its key, mutation and guess', () => {
		expect(renderPacket({ packet: samplePacket() })).toContain(KEY)
		expect(renderPacket({ packet: samplePacket() })).toContain(MUTATION)
		expect(renderPacket({ packet: samplePacket() })).toMatch(/guess: [a-z-]+ \(.+\)/)
	})

	it('the tests, the first five, and how many more', () => {
		expect(renderPacket({ packet: samplePacket() })).toMatch(
			/tests: .*case 1.*case 5.*…and 3 more/s,
		)
	})

	it('the window as "<line> | <text>" lines, the mutated ones marked with >', () => {
		function lineWith(text: string, shown: string): string | undefined {
			return text.split('\n').find((line) => line.includes(shown))
		}

		expect(lineWith(renderPacket({ packet: samplePacket() }), `20 | ${lineText(20)}`)).toContain(
			'>',
		)
		expect(lineWith(renderPacket({ packet: samplePacket() }), `19 | ${lineText(19)}`)).toMatch(
			/^ +19 \| /,
		)
		expect(
			lineWith(renderPacket({ packet: samplePacket() }), `19 | ${lineText(19)}`),
		).not.toContain('>')
	})

	it('a changed line → says so', () => {
		expect(renderPacket({ packet: samplePacket() })).toContain('line changed since the run')
	})

	it('no line changed → says nothing of it', () => {
		expect(
			renderPacket({ packet: packetOfFirst({ survivors: [inputAt({ line: 3 })] }) }),
		).not.toContain('line changed since the run')
	})

	it('both commands of a survivor, and the file command last', () => {
		expect(renderPacket({ packet: samplePacket() })).toContain(
			`dialecte mutants record --key ${KEY} --family`,
		)
		expect(renderPacket({ packet: samplePacket() })).toContain(
			`dialecte mutants schedule <follow-up> ${KEY}`,
		)
		expect(renderPacket({ packet: samplePacket() }).trimEnd().split('\n').pop()).toContain(
			samplePacket().recordFile,
		)
	})

	it('a window cut → "…and <n> more lines"', () => {
		expect(
			renderPacket({
				packet: packetOfFirst({
					source: numberedSource(60),
					survivors: [inputAt({ line: 20, range: linesRange({ from: 20, to: 40 }) })],
				}),
			}),
		).toContain('…and 10 more lines')
	})

	it('survivors left out → "…and <n> more survivors"', () => {
		expect(
			renderPacket({
				packet: packetOfFirst({
					survivors: Array.from({ length: 11 }, (_unused, index) => inputAt({ line: index + 1 })),
				}),
			}),
		).toContain('…and 1 more survivors')
	})
})

describe('judgePackets', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const OTHER_FILE = 'src/engine/b.ts'
	const FILES = {
		[FILE]: numberedSource(30),
		[OTHER_FILE]: numberedSource(30),
		'src/engine/c.ts': numberedSource(30),
	}

	/** A scratch package with the engine files above. */
	function packageWithFiles(): string {
		return mutationPackage({ files: FILES })
	}

	function survivorIn(params: {
		key: string
		file?: string
		line?: number
		[key: string]: unknown
	}) {
		const { key, file = FILE, line = 5, ...rest } = params
		return { ...survivorOf({ key, file, line }), ...rest }
	}

	it('nothing pending → no packet', () => {
		expect(judgePackets({ root: packageWithFiles() })).toEqual([])
	})

	it('only the new items: a scheduled, a killed and a recorded one are left out', () => {
		const root = packageWithFiles()
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: ['k1', 'k2', 'k3', 'k4', 'k5'].map((key) => survivorIn({ key })),
		})
		expect(scheduleItems({ root, keys: ['k2'], followUp: 'later' })).toMatchObject({ ok: true })
		writeFiles({
			root,
			files: {
				'.dialecte/mutation-records.json': `${JSON.stringify({
					[FILE]: {
						k4: { line: 5, mutation: MUTATION, family: 'wording', reason: 'text', lineHash: 'h' },
					},
				})}\n`,
			},
		})
		storedReportedRun({
			root,
			startedAt: '2026-11-02T11:00:00.000Z',
			survivors: [],
			detected: ['k3'],
		})

		expect(
			judgePackets({ root })
				.flatMap(({ survivors }) => survivors)
				.map(({ key }) => key)
				.sort(),
		).toEqual(['k1', 'k5'])
	})

	it("only this package's items", () => {
		const root = packageWithFiles()
		const own = reportedRun({ root, runId: 'r1', survivors: [survivorIn({ key: 'own' })] })
		const other = {
			...reportedRun({ root, runId: 'r2', survivors: [survivorIn({ key: 'foreign' })] }),
			package: 'other-package',
		}
		expect(updateLedger({ root, run: own, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(updateLedger({ root, run: other, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(Object.keys(readLedger({ root }))).toContain(
			ledgerKeyOf({ packageName: 'other-package', key: 'foreign' }),
		)

		expect(
			judgePackets({ root }).flatMap(({ survivors }) => survivors.map(({ key }) => key)),
		).toEqual(['own'])
	})

	it('one packet per file, files sorted, survivors by line then key; the file text read from the package', () => {
		const root = packageWithFiles()
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: [
				survivorIn({ key: 'b-late', file: OTHER_FILE, line: 9 }),
				survivorIn({ key: 'a-9-first', file: FILE, line: 9 }),
				survivorIn({ key: 'b-early', file: OTHER_FILE, line: 4 }),
				survivorIn({ key: 'a-9', file: FILE, line: 9 }),
				survivorIn({ key: 'a-2', file: FILE, line: 2 }),
			],
		})

		expect(judgePackets({ root }).map(({ file }) => file)).toEqual([FILE, OTHER_FILE])
		expect(judgePackets({ root }).map(({ survivors }) => survivors.map(({ key }) => key))).toEqual([
			['a-2', 'a-9', 'a-9-first'],
			['b-early', 'b-late'],
		])
		expect(judgePackets({ root })[0].survivors[0].window.lines.map(({ text }) => text)).toContain(
			lineText(2),
		)
	})

	it('--file → that file only', () => {
		const root = packageWithFiles()
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: [survivorIn({ key: 'a1' }), survivorIn({ key: 'b1', file: OTHER_FILE })],
		})

		expect(judgePackets({ root, file: OTHER_FILE }).map(({ file }) => file)).toEqual([OTHER_FILE])
	})

	it('the range and tests come from the latest run that reported the key, by when it started', () => {
		const root = packageWithFiles()
		// created in this order, and the earlier-started run finishes last: neither the folder order nor finishedAt decides
		storedReportedRun({
			root,
			startedAt: '2026-11-02T12:00:00.000Z',
			finishedAt: '2026-11-02T12:05:00.000Z',
			survivors: [
				survivorIn({ key: 'k1', range: `${FILE}:7:0-7:5`, tests: ['t/late.test.ts#late'] }),
			],
		})
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			finishedAt: '2026-11-02T13:00:00.000Z',
			survivors: [
				survivorIn({ key: 'k1', range: `${FILE}:5:0-5:5`, tests: ['t/early.test.ts#early'] }),
			],
		})

		expect(judgePackets({ root })[0].survivors).toEqual([
			expect.objectContaining({
				key: 'k1',
				range: `${FILE}:7:0-7:5`,
				tests: ['t/late.test.ts#late'],
			}),
		])
	})

	it('a key whose runs were all removed → no range, no tests', () => {
		const root = packageWithFiles()
		const run = storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: [survivorIn({ key: 'k1', tests: ['t/a.test.ts#one'] })],
		})
		expect(Object.keys(readLedger({ root }))).toHaveLength(1)
		rmSync(
			join(commonGitDirOf(root), MUTATION_STORE_FOLDER, MUTATION_RUNS_FOLDER, `${run.runId}.json`),
		)
		expect(runFiles(root)).toEqual([])

		expect(judgePackets({ root })[0].survivors[0]).not.toHaveProperty('range')
		expect(judgePackets({ root })[0].survivors[0].tests).toEqual([])
	})

	it('the window shows the file as it is now, and flags a line that changed since the run', () => {
		const root = packageWithFiles()
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: [
				survivorIn({ key: 'k1', line: 5, lineHash: hashLine({ text: 'something else' }) }),
			],
		})

		expect(judgePackets({ root })[0].survivors[0].lineChanged).toBe(true)
		expect(
			judgePackets({ root })[0].survivors[0].window.lines.find(({ mutated }) => mutated),
		).toEqual({
			line: 5,
			text: lineText(5),
			mutated: true,
		})
	})

	it('a file that is gone → a packet with no lines, the line flagged changed', () => {
		const root = packageWithFiles()
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: [survivorIn({ key: 'k1', file: 'src/engine/gone.ts' })],
		})

		expect(judgePackets({ root })[0].survivors[0]).toMatchObject({
			lineChanged: true,
			window: { lines: [], more: 0 },
		})
	})
})
