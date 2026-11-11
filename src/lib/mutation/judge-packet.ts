/**
 * The judge packets of `dialecte mutants judge`: per file, its pending survivors, each with the code around it as the
 * file is now, the tests that covered it, a family guess and the commands that close it. Every part is capped, and a
 * packet's JSON and text both stay within `PACKET_MAX_BYTES`, so an agent reads any packet whole.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tabsExpanded } from '../expand-tabs.ts'
import { classifyFamily } from './classify-family.ts'
import { hashLine, parseTarget } from './judge.ts'
import { itemsOf, readLedger } from './ledger.ts'
import {
	CUT_MARK,
	FAMILY_PLACEHOLDER,
	FOLLOW_UP_PLACEHOLDER,
	MUTATION_MIN_CHARS,
	LEADING_DOT_SLASH,
	PACKET_MAX_BYTES,
	PACKET_MAX_SURVIVORS,
	PACKET_MAX_TESTS,
	REASON_PLACEHOLDER,
	TEST_NAME_MAX_CHARS,
	TRAILING_HIGH_SURROGATE,
	UNCLASSIFIED_FAMILY,
	WINDOW_CONTEXT_LINES,
	WINDOW_LINE_MAX_CHARS,
	WINDOW_MAX_LINES,
} from './mutation-agent.constants.ts'
import { packageNameOf, readStoredRuns } from './run-store.ts'

import type { JudgePacket, PacketInput, PacketSurvivor } from './mutation-agent.types.ts'
import type { KeyedLedgerItem, Survivor } from './mutation.types.ts'

/** The packet of one file's pending survivors: windows, covering tests, family guesses, caps. */
export function packetOf(params: {
	file: string
	source: string | undefined
	survivors: readonly PacketInput[]
}): JudgePacket {
	const { file, source } = params
	const inputs = [...params.survivors].sort(byLineThenKey)
	const lines = source?.split('\n')
	const survivors = inputs
		.slice(0, PACKET_MAX_SURVIVORS)
		.map((input) => packetSurvivorOf({ file, source, lines, input }))
	const recordFile = `dialecte mutants record --file ${file} --family ${FAMILY_PLACEHOLDER} --reason "${REASON_PLACEHOLDER}"`
	let packet: JudgePacket = { file, survivors, more: inputs.length - survivors.length, recordFile }
	// the last survivors go to `more` until both forms fit, down to one survivor; that one is shrunk if need be
	while (packet.survivors.length > 1 && !fits(packet))
		packet = {
			...packet,
			survivors: packet.survivors.slice(0, -1),
			more: packet.more + 1,
		}
	return shrunkToFit(packet)
}

/** A packet as text. */
export function renderPacket(params: { packet: JudgePacket }): string {
	return packetLines(params).join('\n')
}

/** A packet's lines, one entry per printed line. */
export function packetLines(params: { packet: JudgePacket }): string[] {
	const { packet } = params
	const pending = packet.survivors.length + packet.more
	return [
		`${packet.file} - ${pending} pending survivor${pending === 1 ? '' : 's'}`,
		...packet.survivors.flatMap(renderSurvivor),
		...(packet.more > 0 ? ['', `…and ${packet.more} more survivors`] : []),
		'',
		`every survivor of the file under one family: ${packet.recordFile}`,
	]
}

/** The packets of the package's pending (`new`) survivors, one per file, files sorted; `file` keeps that file only. */
export function judgePackets(params: { root: string; file?: string }): JudgePacket[] {
	const { root } = params
	const file = params.file?.replace(LEADING_DOT_SLASH, '')
	const packageName = packageNameOf(root)
	const pending = itemsOf({ ledger: readLedger({ root }), packageName }).filter(
		(item) => item.state === 'new' && (file === undefined || item.file === file),
	)
	if (pending.length === 0) return []
	const reported = lastReportedOf({ root, packageName })
	const byFile = new Map<string, KeyedLedgerItem[]>()
	for (const item of pending) byFile.set(item.file, [...(byFile.get(item.file) ?? []), item])
	return [...byFile.keys()].sort().map((each) => {
		const path = join(root, each)
		return packetOf({
			file: each,
			source: existsSync(path) ? readFileSync(path, 'utf8') : undefined,
			survivors: (byFile.get(each) ?? []).map((item) =>
				inputOf({ item, survivor: reported.get(item.key) }),
			),
		})
	})
}

/** Per survivor key, the survivor as the latest (by start) stored reported run of the package holds it. */
function lastReportedOf(params: { root: string; packageName: string }): Map<string, Survivor> {
	const { root, packageName } = params
	const latest = new Map<string, { startedAt: string; survivor: Survivor }>()
	for (const run of readStoredRuns(root)) {
		if (run.state !== 'reported' || run.package !== packageName) continue
		for (const survivor of run.survivors ?? []) {
			const known = latest.get(survivor.key)
			if (known === undefined || known.startedAt <= run.startedAt)
				latest.set(survivor.key, { startedAt: run.startedAt, survivor })
		}
	}
	return new Map([...latest].map(([key, { survivor }]) => [key, survivor]))
}

function inputOf(params: { item: KeyedLedgerItem; survivor: Survivor | undefined }): PacketInput {
	const { item, survivor } = params
	return {
		key: item.key,
		line: item.line,
		mutation: item.mutation,
		lineHash: item.lineHash,
		...(survivor === undefined ? {} : { range: survivor.range }),
		...(survivor?.tests === undefined ? {} : { tests: survivor.tests }),
		...(survivor?.testsMore === undefined ? {} : { testsMore: survivor.testsMore }),
	}
}

function packetSurvivorOf(params: {
	file: string
	source: string | undefined
	lines: readonly string[] | undefined
	input: PacketInput
}): PacketSurvivor {
	const { file, source, lines, input } = params
	const { key, line, mutation, range, lineHash, tests = [], testsMore = 0 } = input
	const { familyGuess, guessReason } = classifyFamily({ file, source, mutation, line, range })
	const family = familyGuess === UNCLASSIFIED_FAMILY ? FAMILY_PLACEHOLDER : familyGuess
	return {
		key,
		line,
		mutation,
		...(range === undefined ? {} : { range }),
		lineChanged: lines === undefined || hashLine({ text: lines[line - 1] ?? '' }) !== lineHash,
		window: windowOf({ lines, line, range }),
		tests: tests
			.slice(0, PACKET_MAX_TESTS)
			.map((name) => cut({ text: name, max: TEST_NAME_MAX_CHARS })),
		testsMore: testsMore + Math.max(0, tests.length - PACKET_MAX_TESTS),
		familyGuess,
		guessReason,
		commands: {
			record: `dialecte mutants record --key ${key} --family ${family} --reason "${REASON_PLACEHOLDER}"`,
			schedule: `dialecte mutants schedule ${FOLLOW_UP_PLACEHOLDER} ${key}`,
		},
	}
}

/** The lines around the mutated ones, clamped to the file and capped; none when the file is gone. */
function windowOf(params: {
	lines: readonly string[] | undefined
	line: number
	range: string | undefined
}): PacketSurvivor['window'] {
	const { lines, line, range } = params
	if (lines === undefined) return { lines: [], more: 0 }
	const target = range === undefined ? undefined : parseTarget({ target: range }).range
	const first = target?.start.line ?? line
	const last = target?.end.line ?? line
	const from = Math.max(1, first - WINDOW_CONTEXT_LINES)
	const to = Math.min(lines.length, last + WINDOW_CONTEXT_LINES)
	const shown = Array.from({ length: Math.max(0, to - from + 1) }, (_unused, index) => from + index)
	return {
		lines: shown.slice(0, WINDOW_MAX_LINES).map((each) => ({
			line: each,
			text: cut({ text: lines[each - 1], max: WINDOW_LINE_MAX_CHARS }),
			mutated: each >= first && each <= last,
		})),
		more: Math.max(0, shown.length - WINDOW_MAX_LINES),
	}
}

function renderSurvivor(survivor: PacketSurvivor): string[] {
	const { window } = survivor
	const shownTests =
		survivor.tests.length === 0
			? 'none named'
			: `${survivor.tests.join(', ')}${survivor.testsMore > 0 ? ` …and ${survivor.testsMore} more` : ''}`
	return [
		'',
		`${survivor.key}  line ${survivor.line}  ${survivor.mutation}`,
		`  guess: ${survivor.familyGuess} (${survivor.guessReason})`,
		`  tests: ${shownTests}`,
		...window.lines.map(
			({ line, text, mutated }) =>
				`${mutated ? '>' : ' '} ${String(line).padStart(5)} | ${tabsExpanded(text)}`,
		),
		...(window.more > 0 ? [`  …and ${window.more} more lines`] : []),
		...(survivor.lineChanged ? ['  line changed since the run'] : []),
		`  record:   ${survivor.commands.record}`,
		`  schedule: ${survivor.commands.schedule}`,
	]
}

/**
 * The packet with its last survivor shrunk until both forms fit: window lines dropped from the ends into
 * `window.more` (context lines before mutated ones), then tests moved into `testsMore`, then its mutation text cut.
 */
function shrunkToFit(packet: JudgePacket): JudgePacket {
	let shrunk = packet
	for (const shrink of [withoutWindowLine, withoutTest, withShorterMutation])
		while (!fits(shrunk)) {
			const last = shrunk.survivors[shrunk.survivors.length - 1]
			const smaller = last === undefined ? undefined : shrink(last)
			if (smaller === undefined) break
			shrunk = { ...shrunk, survivors: [...shrunk.survivors.slice(0, -1), smaller] }
		}
	return shrunk
}

/**
 * The survivor with one window line fewer, counted in `more`: a context line from the end holding more of them, else
 * a mutated line from the end; undefined when the window is empty.
 */
function withoutWindowLine(survivor: PacketSurvivor): PacketSurvivor | undefined {
	const { lines, more } = survivor.window
	if (lines.length === 0) return undefined
	const contextBefore = contextLinesAtStart(lines)
	const contextAfter =
		contextBefore === lines.length ? 0 : contextLinesAtStart([...lines].reverse())
	const fromStart = contextBefore > contextAfter
	return {
		...survivor,
		window: { lines: fromStart ? lines.slice(1) : lines.slice(0, -1), more: more + 1 },
	}
}

/** How many lines not mutated open the window. */
function contextLinesAtStart(lines: readonly { mutated: boolean }[]): number {
	const firstMutated = lines.findIndex(({ mutated }) => mutated)
	return firstMutated < 0 ? lines.length : firstMutated
}

/** The survivor with one test name fewer, counted in `testsMore`; undefined when it names none. */
function withoutTest(survivor: PacketSurvivor): PacketSurvivor | undefined {
	if (survivor.tests.length === 0) return undefined
	return { ...survivor, tests: survivor.tests.slice(0, -1), testsMore: survivor.testsMore + 1 }
}

/** The survivor with its mutation text cut to half its length; undefined once it is at `MUTATION_MIN_CHARS`. */
function withShorterMutation(survivor: PacketSurvivor): PacketSurvivor | undefined {
	const { mutation } = survivor
	if (mutation.length <= MUTATION_MIN_CHARS) return undefined
	const max = Math.max(MUTATION_MIN_CHARS, Math.floor(mutation.length / 2))
	return { ...survivor, mutation: cut({ text: mutation, max }) }
}

/** Both the JSON and the text of the packet are within the byte cap (UTF-8). */
function fits(packet: JudgePacket): boolean {
	return (
		Buffer.byteLength(JSON.stringify(packet), 'utf8') <= PACKET_MAX_BYTES &&
		Buffer.byteLength(renderPacket({ packet }), 'utf8') <= PACKET_MAX_BYTES
	)
}

/** The text, cut to `max` characters ending with the cut mark when longer; a cut never splits a surrogate pair. */
function cut(params: { text: string; max: number }): string {
	const { text, max } = params
	if (text.length <= max) return text
	const kept = text.slice(0, max - CUT_MARK.length)
	return `${TRAILING_HIGH_SURROGATE.test(kept) ? kept.slice(0, -1) : kept}${CUT_MARK}`
}

function byLineThenKey(first: PacketInput, second: PacketInput): number {
	if (first.line !== second.line) return first.line - second.line
	return first.key < second.key ? -1 : first.key > second.key ? 1 : 0
}
