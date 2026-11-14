/**
 * `dialecte lot risk <id|folder>` (33L1 section 3, cases 18-35 around the effort): the class derived now with its
 * reasons, the effort and whether it is below; `--effort` appends the person's record; every refusal is exit 2 with
 * nothing written. Each case runs on a real scratch repository and a hand-over folder beside it, or a scratch store lot.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { createStationLot } from '../../test/lot-station-workspace.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { rewriteRecord } from '../../test/station-records-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../lib/store/store.constants.ts'
import { runLotRisk } from './lot-risk.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../test/lot-station-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The manifest of the scratch repository: a tool (a `bin`, so no api change) that declares its store folder high. */
const PACKAGE_JSON = `{
	"name": "scratch",
	"version": "1.0.0",
	"bin": { "scratch": "scratch.js" },
	"dialecte": { "risk": { "high": ["src/lib/store/**"] } }
}
`

/** An id no lot of the store holds. */
const UNKNOWN_ID = '9999'

/** The time every write is made at. */
const NOW = new Date('2026-11-13T09:00:00.000Z')

/** The one usage line of `lot risk`, for every usage fault. */
const USAGE =
	'lot risk: expected <id|folder> [--json] or <id|folder> --effort low|medium|high [--class high|medium|light] --by <who> [--reason <text>]'

/** A declared file, one line: high by its glob. */
const DECLARED_CHANGE = { 'src/lib/store/publish.ts': 'export const published = 1\n' }

/** A small change outside every declared glob: light by size. */
const SMALL_CHANGE = { 'src/small.ts': 'export const small = 1\n' }

/** A source file adding a destructive call on its second line. */
const DESTRUCTIVE_CHANGE = {
	'src/cleanup.ts': 'export function clean(target: string) {\n\trmSync(target)\n}\n',
}

/** The declared reason of the declared change, as `lot risk` prints and records it. */
const DECLARED_REASON = {
	kind: 'declared',
	file: 'src/lib/store/publish.ts',
	detail: 'src/lib/store/**',
}

/** An effort line of a person, as the file holds it. */
function effortLine(params: { effort: string; class?: string }): string {
	return `${JSON.stringify({ schema: 1, kind: 'effort', at: '2026-11-13T08:00:00.000Z', effort: params.effort, ...(params.class && { class: params.class }), by: 'person-a' })}\n`
}

/** A derived line, as `lot snapshot` records it. */
function derivedLine(): string {
	return `${JSON.stringify({ schema: 1, kind: 'derived', at: '2026-11-13T08:00:00.000Z', class: 'high', reasons: [DECLARED_REASON], from: 'snapshot' })}\n`
}

/** A scratch repository holding the manifest and then the `changes`, untracked; its path. */
function repositoryWith(changes: Record<string, string>): string {
	const root = createScratchRepository({ 'package.json': PACKAGE_JSON })
	writeFiles({ root, files: changes })
	return root
}

/** A repository on `main` with the manifest and the `changes` and no commit at all: nothing to derive against. */
function repositoryWithoutCommit(changes: Record<string, string>): string {
	const root = temporaryFolder('dialecte-risk-unborn-')
	git({ root, args: ['init', '-q', '-b', 'main'] })
	writeFiles({ root, files: { 'package.json': PACKAGE_JSON, ...changes } })
	return root
}

/** The answer of `lot risk`; a throw is an answer too (exit -1, the message), so a case fails on its assertion. */
function answerOrThrow(params: { cwd: string; argv: string[] }): {
	exitCode: number
	output: string
} {
	try {
		return runLotRisk(params)
	} catch (error) {
		return { exitCode: -1, output: (error as Error).message }
	}
}

/** A hand-over folder with no identity, holding `risk` as its `risk.jsonl` when given. */
function folderHolding(risk?: string): string {
	const folder = temporaryFolder('dialecte-risk-folder-')
	if (risk !== undefined) writeFiles({ root: folder, files: { 'risk.jsonl': risk } })
	return folder
}

/** An answer's exit and its output read as JSON (undefined when it is not JSON). */
function answerAsJson(result: { exitCode: number; output: string }): {
	exitCode: number
	json: unknown
} {
	try {
		return { exitCode: result.exitCode, json: JSON.parse(result.output) }
	} catch {
		return { exitCode: result.exitCode, json: undefined }
	}
}

/** The names a folder holds, sorted. */
function listing(folder: string): string[] {
	return readdirSync(folder).sort()
}

/** The text of the folder's `risk.jsonl`; undefined when there is none. */
function riskTextOf(folder: string): string | undefined {
	return listing(folder).includes('risk.jsonl')
		? readFileSync(join(folder, 'risk.jsonl'), 'utf8')
		: undefined
}

/** The lines of a text, each read as JSON. */
function jsonLinesOf(text: string | undefined): unknown[] {
	return (text ?? '')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line))
}

/** A store lot whose worktree is gone (its identity names a folder that does not exist), holding `risk`. */
function lotWithoutWorktree(risk?: string): StationLot {
	const lot = createStationLot()
	if (risk !== undefined) writeFiles({ root: lot.lotFolder, files: { 'risk.jsonl': risk } })
	return lot
}

describe('lot risk - read', { timeout: STORE_CASE_TIMEOUT }, () => {
	type ReadCase = {
		title: string
		changes: Record<string, string>
		risk?: string
		expected: string
	}

	const READ_CASES: ReadCase[] = [
		{
			title: 'declared file, effort high -> class high, the declared line, no below',
			changes: DECLARED_CHANGE,
			risk: effortLine({ effort: 'high' }),
			expected: [
				'lot risk: class high · effort high · cap 3',
				'  src/lib/store/publish.ts: declared src/lib/store/**',
			].join('\n'),
		},
		{
			title: 'declared file, effort medium -> the below line before the reason',
			changes: DECLARED_CHANGE,
			risk: effortLine({ effort: 'medium' }),
			expected: [
				'lot risk: class high · effort medium · cap 3',
				'! effort medium below risk class high (no go-ahead recorded)',
				'  src/lib/store/publish.ts: declared src/lib/store/**',
			].join('\n'),
		},
		{
			title: 'small change, no effort recorded -> class light, the size line with no file',
			changes: SMALL_CHANGE,
			expected: [
				'lot risk: class light · effort none recorded · cap 1',
				'  1 lines in 1 files',
			].join('\n'),
		},
		{
			title: 'rmSync added -> the reason line holds file, line and call',
			changes: DESTRUCTIVE_CHANGE,
			risk: effortLine({ effort: 'high' }),
			expected: ['lot risk: class high · effort high · cap 3', '  src/cleanup.ts:2: rmSync'].join(
				'\n',
			),
		},
		{
			title: 'effort line holding class high on a light change -> below the class of the line',
			changes: SMALL_CHANGE,
			risk: effortLine({ effort: 'medium', class: 'high' }),
			expected: [
				'lot risk: class light · effort medium · cap 3',
				'! effort medium below risk class high (no go-ahead recorded)',
				'  1 lines in 1 files',
			].join('\n'),
		},
	]

	for (const { title, changes, risk, expected } of READ_CASES)
		it(`${title}`, () => {
			const root = repositoryWith(changes)
			const folder = folderHolding(risk)
			const before = listing(folder)
			const text = riskTextOf(folder)

			expect(runLotRisk({ cwd: root, argv: [folder] })).toEqual({
				exitCode: 0,
				output: expected,
			})
			expect(listing(folder)).toEqual(before)
			expect(riskTextOf(folder)).toBe(text)
		})

	it('--json -> the whole object, class derived now, effort, below and cap', () => {
		const root = repositoryWith(DECLARED_CHANGE)
		const text = effortLine({ effort: 'medium' })
		const folder = folderHolding(text)
		const before = listing(folder)

		expect(JSON.parse(runLotRisk({ cwd: root, argv: [folder, '--json'] }).output)).toEqual({
			class: 'high',
			reasons: [DECLARED_REASON],
			effort: 'medium',
			below: true,
			cap: 3,
		})
		expect(listing(folder)).toEqual(before)
		expect(riskTextOf(folder)).toBe(text)
	})

	it('--json with no effort recorded -> effort null, below false', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const folder = folderHolding()
		const before = listing(folder)

		expect(JSON.parse(runLotRisk({ cwd: root, argv: [folder, '--json'] }).output)).toEqual({
			class: 'light',
			reasons: [{ kind: 'size', detail: '1 lines in 1 files' }],
			effort: null,
			below: false,
			cap: 1,
		})
		expect(listing(folder)).toEqual(before)
		expect(riskTextOf(folder)).toBeUndefined()
	})
})

describe('lot risk - exact declared entry', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a declared entry equal to the file -> the line holds the file and declared alone', () => {
		const root = createScratchRepository({
			'package.json':
				'{\n\t"name": "scratch",\n\t"version": "1.0.0",\n\t"bin": { "scratch": "scratch.js" },\n\t"dialecte": { "risk": { "high": ["src/lib/store/publish.ts"] } }\n}\n',
		})
		writeFiles({ root, files: DECLARED_CHANGE })
		const folder = folderHolding(effortLine({ effort: 'high' }))

		expect(runLotRisk({ cwd: root, argv: [folder] })).toEqual({
			exitCode: 0,
			output: [
				'lot risk: class high · effort high · cap 3',
				'  src/lib/store/publish.ts: declared',
			].join('\n'),
		})
	})
})

describe('lot risk - no commit to derive against', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a read -> exit 0, class unknown, the last line says the class is not derived', () => {
		const root = repositoryWithoutCommit(SMALL_CHANGE)
		const folder = folderHolding()

		const result = answerOrThrow({ cwd: root, argv: [folder] })
		const lines = result.output.split('\n')

		expect({
			exitCode: result.exitCode,
			head: lines[0],
			last: lines.at(-1)?.startsWith('! risk class not derived: '),
		}).toEqual({
			exitCode: 0,
			head: 'lot risk: class unknown · effort none recorded · cap 1',
			last: true,
		})
		expect(listing(folder)).toEqual([])
	})

	it('--effort low --by -> exit 0, the effort line recorded', () => {
		const root = repositoryWithoutCommit(SMALL_CHANGE)
		const folder = folderHolding()

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'low', '--by', 'person-a'],
				now: NOW,
			}),
		).toEqual({
			exitCode: 0,
			output: `lot risk: effort low recorded by person-a - ${join(folder, 'risk.jsonl')}`,
		})
		expect(jsonLinesOf(riskTextOf(folder))).toEqual([
			{
				schema: 1,
				kind: 'effort',
				at: '2026-11-13T09:00:00.000Z',
				effort: 'low',
				by: 'person-a',
			},
		])
	})
})

describe('lot risk - a damaged store lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** A working store lot whose first transition holds a time the store does not write. */
	function damagedLot(): StationLot {
		const lot = createStationLot()
		const path = join(lot.lotFolder, 'transitions', '000001.json')
		const transition = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		rewriteRecord({ path, text: JSON.stringify({ ...transition, at: 'not a time' }) })
		return lot
	}

	it('a read -> exit 2, damaged with its reason, nothing written', () => {
		const lot = damagedLot()
		const before = listing(lot.lotFolder)

		expect(runLotRisk({ cwd: lot.cwd, argv: [lot.lotFolder] })).toEqual({
			exitCode: 2,
			output: `lot risk: ${lot.name} damaged: ${RECORD_DAMAGE_REASONS.at}`,
		})
		expect(listing(lot.lotFolder)).toEqual(before)
	})

	it('--effort -> exit 2, damaged with its reason, nothing written', () => {
		const lot = damagedLot()
		const before = listing(lot.lotFolder)

		expect(
			runLotRisk({
				cwd: lot.cwd,
				argv: [lot.lotFolder, '--effort', 'high', '--by', 'person-a'],
				now: NOW,
			}),
		).toEqual({
			exitCode: 2,
			output: `lot risk: ${lot.name} damaged: ${RECORD_DAMAGE_REASONS.at}`,
		})
		expect(listing(lot.lotFolder)).toEqual(before)
	})
})

describe('lot risk - worktree gone', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a derived line present -> its class and reasons, the identity effort below', () => {
		const text = derivedLine()
		const lot = lotWithoutWorktree(text)
		const before = listing(lot.lotFolder)

		expect(runLotRisk({ cwd: lot.cwd, argv: [lot.lotFolder] })).toEqual({
			exitCode: 0,
			output: [
				'lot risk: class high · effort medium · cap 3',
				'! effort medium below risk class high (no go-ahead recorded)',
				'  src/lib/store/publish.ts: declared src/lib/store/**',
			].join('\n'),
		})
		expect(listing(lot.lotFolder)).toEqual(before)
		expect(riskTextOf(lot.lotFolder)).toBe(text)
	})

	it('no derived line -> class unknown, never a guess', () => {
		const lot = lotWithoutWorktree()
		const before = listing(lot.lotFolder)

		expect(runLotRisk({ cwd: lot.cwd, argv: [lot.lotFolder] })).toEqual({
			exitCode: 0,
			output: 'lot risk: class unknown · effort medium · cap 2',
		})
		expect(listing(lot.lotFolder)).toEqual(before)
	})

	it('--json with no derived line -> class null, no reasons', () => {
		const lot = lotWithoutWorktree()
		const before = listing(lot.lotFolder)

		expect(
			JSON.parse(runLotRisk({ cwd: lot.cwd, argv: [lot.lotFolder, '--json'] }).output),
		).toEqual({ class: null, reasons: [], effort: 'medium', below: false, cap: 2 })
		expect(listing(lot.lotFolder)).toEqual(before)
	})
})

describe('lot risk - --effort writes', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('light change, --effort low -> one effort line, the recorded line', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const folder = folderHolding()

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'low', '--by', 'person-a'],
				now: NOW,
			}),
		).toEqual({
			exitCode: 0,
			output: `lot risk: effort low recorded by person-a - ${join(folder, 'risk.jsonl')}`,
		})
		expect(jsonLinesOf(riskTextOf(folder))).toEqual([
			{
				schema: 1,
				kind: 'effort',
				at: '2026-11-13T09:00:00.000Z',
				effort: 'low',
				by: 'person-a',
			},
		])
	})

	it('declared change, --effort high --reason -> the line holds the reason', () => {
		const root = repositoryWith(DECLARED_CHANGE)
		const folder = folderHolding()

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'high', '--by', 'person-a', '--reason', 'writes the store'],
				now: NOW,
			}).exitCode,
		).toBe(0)
		expect(jsonLinesOf(riskTextOf(folder))).toEqual([
			{
				schema: 1,
				kind: 'effort',
				at: '2026-11-13T09:00:00.000Z',
				effort: 'high',
				by: 'person-a',
				reason: 'writes the store',
			},
		])
	})

	it('declared change, --effort medium --reason -> below the class, recorded with its reason', () => {
		const root = repositoryWith(DECLARED_CHANGE)
		const folder = folderHolding()

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'medium', '--by', 'person-a', '--reason', 'a rename only'],
				now: NOW,
			}),
		).toEqual({
			exitCode: 0,
			output: `lot risk: effort medium recorded by person-a - ${join(folder, 'risk.jsonl')}`,
		})
		expect(jsonLinesOf(riskTextOf(folder))).toEqual([
			{
				schema: 1,
				kind: 'effort',
				at: '2026-11-13T09:00:00.000Z',
				effort: 'medium',
				by: 'person-a',
				reason: 'a rename only',
			},
		])
	})

	it('light change, --class high raises the class: medium below without --reason, nothing written', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const folder = folderHolding()
		const before = listing(folder)

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'medium', '--class', 'high', '--by', 'person-a'],
				now: NOW,
			}),
		).toEqual({
			exitCode: 2,
			output: 'lot risk: effort medium is below risk class high: add --reason <text>',
		})
		expect(listing(folder)).toEqual(before)
		expect(riskTextOf(folder)).toBeUndefined()
	})

	it('light change, --class high with --reason -> the line holds class and reason', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const folder = folderHolding()

		expect(
			runLotRisk({
				cwd: root,
				argv: [
					folder,
					'--effort',
					'medium',
					'--class',
					'high',
					'--by',
					'person-a',
					'--reason',
					'touches the store by hand',
				],
				now: NOW,
			}).exitCode,
		).toBe(0)
		expect(jsonLinesOf(riskTextOf(folder))).toEqual([
			{
				schema: 1,
				kind: 'effort',
				at: '2026-11-13T09:00:00.000Z',
				effort: 'medium',
				class: 'high',
				by: 'person-a',
				reason: 'touches the store by hand',
			},
		])
	})

	it('the last effort line holds the same effort and class -> already, nothing appended', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const text = effortLine({ effort: 'low' })
		const folder = folderHolding(text)
		const before = listing(folder)

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'low', '--by', 'person-b'],
				now: NOW,
			}),
		).toEqual({
			exitCode: 0,
			output: `lot risk: effort low already recorded - ${join(folder, 'risk.jsonl')}`,
		})
		expect(listing(folder)).toEqual(before)
		expect(riskTextOf(folder)).toBe(text)
	})

	it('the same effort with another class -> a second line, the first kept', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const text = effortLine({ effort: 'medium' })
		const folder = folderHolding(text)

		expect(
			runLotRisk({
				cwd: root,
				argv: [folder, '--effort', 'medium', '--class', 'medium', '--by', 'person-a'],
				now: NOW,
			}).exitCode,
		).toBe(0)
		expect(jsonLinesOf(riskTextOf(folder))).toEqual([
			...jsonLinesOf(text),
			{
				schema: 1,
				kind: 'effort',
				at: '2026-11-13T09:00:00.000Z',
				effort: 'medium',
				class: 'medium',
				by: 'person-a',
			},
		])
	})
})

describe('lot risk - refused, nothing written', { timeout: STORE_CASE_TIMEOUT }, () => {
	type Refusal = { title: string; changes: Record<string, string>; extra: string[]; line: string }

	const WITH_FOLDER: string = 'FOLDER'

	const BELOW_HIGH = 'lot risk: effort medium is below risk class high: add --reason <text>'

	const REFUSALS: Refusal[] = [
		{ title: 'no folder word', changes: SMALL_CHANGE, extra: [], line: USAGE },
		{
			title: 'only an option, no folder word',
			changes: SMALL_CHANGE,
			extra: ['--json'],
			line: USAGE,
		},
		{
			title: 'two folder words',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, 'other', '--json'],
			line: USAGE,
		},
		{
			title: '--effort out of the three',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'ultra', '--by', 'person-a'],
			line: USAGE,
		},
		{
			title: '--class out of the three',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'high', '--class', 'urgent', '--by', 'person-a'],
			line: USAGE,
		},
		{
			title: '--class without --effort',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--class', 'high'],
			line: USAGE,
		},
		{
			title: '--reason without --effort',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--reason', 'because'],
			line: USAGE,
		},
		{
			title: '--by without --effort',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--by', 'person-a'],
			line: USAGE,
		},
		{
			title: '--effort without --by',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low'],
			line: USAGE,
		},
		{
			title: 'a blank --by',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low', '--by', '  '],
			line: USAGE,
		},
		{
			title: 'a line break in --by',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low', '--by', 'person\na'],
			line: USAGE,
		},
		{
			title: 'a blank --reason',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low', '--by', 'person-a', '--reason', ''],
			line: USAGE,
		},
		{
			title: 'a carriage return in --reason',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low', '--by', 'person-a', '--reason', 'one\rline'],
			line: USAGE,
		},
		{
			title: 'medium below a declared change, no --reason',
			changes: DECLARED_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'medium', '--by', 'person-a'],
			line: BELOW_HIGH,
		},
		{
			title: 'low below a declared change, no --reason',
			changes: DECLARED_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low', '--by', 'person-a'],
			line: 'lot risk: effort low is below risk class high: add --reason <text>',
		},
		{
			title: 'low below a medium --class, no --reason',
			changes: SMALL_CHANGE,
			extra: [WITH_FOLDER, '--effort', 'low', '--class', 'medium', '--by', 'person-a'],
			line: 'lot risk: effort low is below risk class medium: add --reason <text>',
		},
	]

	for (const { title, changes, extra, line } of REFUSALS)
		it(`${title} -> exit 2, one line`, () => {
			const root = repositoryWith(changes)
			const text = effortLine({ effort: 'low' })
			const folder = folderHolding(text)
			const before = listing(folder)
			const argv = extra.map((word) => (word === WITH_FOLDER ? folder : word))

			expect(runLotRisk({ cwd: root, argv, now: NOW })).toEqual({ exitCode: 2, output: line })
			expect(listing(folder)).toEqual(before)
			expect(riskTextOf(folder)).toBe(text)
		})

	for (const state of ['committed', 'canceled', 'failed'] as const)
		it(`a ${state} store lot -> exit 2, nothing to record`, () => {
			const lot = createStationLot({ state })
			const before = listing(lot.lotFolder)

			expect(
				runLotRisk({
					cwd: lot.cwd,
					argv: [lot.lotFolder, '--effort', 'high', '--by', 'person-a'],
					now: NOW,
				}),
			).toEqual({ exitCode: 2, output: `lot risk: ${lot.name} is ${state}: nothing to record` })
			expect(listing(lot.lotFolder)).toEqual(before)
		})

	for (const option of ['--by', '--reason'] as const)
		it(`${option} holding a forbidden word -> exit 2, nothing written`, () => {
			const root = repositoryWith(SMALL_CHANGE)
			configureMachine()
			git({ root, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
			const folder = folderHolding()
			const extra =
				option === '--by'
					? ['--by', FIRST_WORD, '--reason', 'one-line reason']
					: ['--by', 'person-a', '--reason', `needs ${FIRST_WORD} here`]

			expect(
				runLotRisk({ cwd: root, argv: [folder, '--effort', 'high', ...extra], now: NOW }),
			).toEqual({
				exitCode: 2,
				output: `lot risk: ${option} holds a forbidden word: nothing written`,
			})
			expect(listing(folder)).toEqual([])
		})
})

describe('lot risk - through lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot risk <name> --json on a store lot -> dispatched, the derived line read', () => {
		const text = derivedLine()
		const lot = lotWithoutWorktree(text)
		const before = listing(lot.lotFolder)

		expect(answerAsJson(runLot({ cwd: lot.cwd, argv: ['risk', lot.name, '--json'] }))).toEqual({
			exitCode: 0,
			json: {
				class: 'high',
				reasons: [DECLARED_REASON],
				effort: 'medium',
				below: true,
				cap: 3,
			},
		})
		expect(listing(lot.lotFolder)).toEqual(before)
		expect(riskTextOf(lot.lotFolder)).toBe(text)
	})

	it('a read of an unknown id -> exit 2, no lot', () => {
		const lot = lotWithoutWorktree()
		const before = listing(lot.lotFolder)

		expect(runLot({ cwd: lot.cwd, argv: ['risk', UNKNOWN_ID] })).toEqual({
			exitCode: 2,
			output: `no lot ${UNKNOWN_ID}`,
		})
		expect(listing(lot.lotFolder)).toEqual(before)
	})

	it('an unknown id -> exit 2, no lot, nothing written', () => {
		const lot = lotWithoutWorktree()
		const before = listing(lot.lotFolder)

		expect(
			runLot({ cwd: lot.cwd, argv: ['risk', UNKNOWN_ID, '--effort', 'low', '--by', 'person-a'] }),
		).toEqual({
			exitCode: 2,
			output: `no lot ${UNKNOWN_ID}`,
		})
		expect(listing(lot.lotFolder)).toEqual(before)
	})
})

describe('lot risk - the review fixes (D30)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the same effort recorded again after the class rose, now with a reason -> a second line, not already', () => {
		const root = repositoryWith(SMALL_CHANGE)
		const folder = folderHolding()
		const effortArguments = [folder, '--effort', 'medium', '--by', 'person-a']
		runLotRisk({ cwd: root, argv: effortArguments, now: NOW })
		writeFiles({ root, files: { 'src/removal.ts': 'unlinkSync(target)\n' } })

		const result = runLotRisk({ cwd: root, argv: [...effortArguments, '--reason', 'x'], now: NOW })

		expect({ exitCode: result.exitCode, lines: jsonLinesOf(riskTextOf(folder)) }).toEqual({
			exitCode: 0,
			lines: [
				{
					schema: 1,
					kind: 'effort',
					at: '2026-11-13T09:00:00.000Z',
					effort: 'medium',
					by: 'person-a',
				},
				{
					schema: 1,
					kind: 'effort',
					at: '2026-11-13T09:00:00.000Z',
					effort: 'medium',
					by: 'person-a',
					reason: 'x',
				},
			],
		})
	})

	it('a change to a declared file whose diff also removes the glob from package.json -> still high, declared', () => {
		const root = createScratchRepository({
			'package.json': PACKAGE_JSON,
			'src/lib/store/publish.ts': 'export const published = 1\n',
		})
		writeFiles({
			root,
			files: {
				'package.json':
					'{\n\t"name": "scratch",\n\t"version": "1.0.0",\n\t"bin": { "scratch": "scratch.js" }\n}\n',
				'src/lib/store/publish.ts': 'export const published = 2\n',
			},
		})
		const folder = folderHolding()

		expect(JSON.parse(runLotRisk({ cwd: root, argv: [folder, '--json'] }).output)).toMatchObject({
			class: 'high',
			reasons: expect.arrayContaining([DECLARED_REASON]),
		})
	})

	it('an rmSync added in a file whose path holds a space -> high, naming that file and line', () => {
		const root = createScratchRepository({
			'package.json': PACKAGE_JSON,
			'src/my file.ts': 'export const one = 1\n',
		})
		writeFiles({ root, files: { 'src/my file.ts': 'export const one = 1\nrmSync(one)\n' } })
		const folder = folderHolding()

		expect(JSON.parse(runLotRisk({ cwd: root, argv: [folder, '--json'] }).output)).toMatchObject({
			class: 'high',
			reasons: [{ kind: 'destructive', file: 'src/my file.ts', line: 2, detail: 'rmSync' }],
		})
	})
})
