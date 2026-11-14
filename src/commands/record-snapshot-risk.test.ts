/**
 * `lot snapshot` and the risk records (33L1 sections 5-6, cases 18, 20, 28; D3, D7): the effort read through
 * `effectiveEffort` (the brief's `effort` is no longer read), the cap through `riskCapOf`, and the class derived at
 * every snapshot, appended to `risk.jsonl` before the cap check. Hand-over folders sit beside a scratch repository;
 * store lots are scratch store lots.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { createStationLot } from '../../test/lot-station-workspace.ts'
import { CLEANUP_FILE, RMSYNC_REASON } from '../../test/risk-workspace.constants.ts'
import { derivedLineOf, effortLineOf, writeRiskLines } from '../../test/risk-workspace.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { setIdentityEffort } from '../../test/station-records-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readRiskRecords } from '../lib/risk/risk-records.ts'
import { runRecordVerb } from './record.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Effort, RiskClass } from '../lib/risk/risk.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The manifest of the scratch repository: a tool (a `bin`, so no api change is read). */
const MANIFEST = {
	'package.json': '{ "name": "scratch", "version": "1.0.0", "bin": { "scratch": "s.js" } }\n',
}

/** The whole line printed when the class derived now is above the effort's. */
const RAISED_LINE = '! risk class now high (src/cleanup.ts:2: rmSync): cap 3'

/** A scratch repository holding the manifest; its path. */
function repository(): string {
	return createScratchRepository(MANIFEST)
}

/** An empty hand-over folder outside every repository. */
function handoverFolder(): string {
	return temporaryFolder('dialecte-risk-handover-')
}

/** `lot snapshot <folder> --round <round>` run from `cwd`. */
function snapshotOf(params: { cwd: string; folder: string; round: number; extra?: string[] }) {
	return runRecordVerb({
		verb: 'snapshot',
		cwd: params.cwd,
		argv: [params.folder, '--round', String(params.round), ...(params.extra ?? [])],
		now: new Date('2026-11-13T09:00:00.000Z'),
	})
}

/** The whole refusal of a round beyond the cap when no effort is recorded (D3). */
function noEffortLine(params: { folder: string; round: number }): string {
	return `lot snapshot: round ${params.round} is beyond the cap of 1 (no effort recorded): dialecte lot risk ${params.folder} --effort low|medium|high --by <who>`
}

/** The whole refusal of a round beyond the cap of an effort (unchanged). */
function beyondCapLine(params: {
	folder: string
	round: number
	cap: number
	effort: Effort
	riskClass?: RiskClass
}): string {
	const named =
		params.riskClass === undefined
			? `effort ${params.effort}`
			: `effort ${params.effort}, risk class ${params.riskClass}`
	return `lot snapshot: round ${params.round} is beyond the cap of ${params.cap} (${named}): dialecte lot snapshot ${params.folder} --round ${params.round} --beyond-cap --by <who> --reason <text>`
}

/** The text of the folder's `risk.jsonl`; undefined when there is none. */
function riskTextOf(folder: string): string | undefined {
	return listing(folder).includes('risk.jsonl')
		? readFileSync(join(folder, 'risk.jsonl'), 'utf8')
		: undefined
}

/** The names a folder holds, sorted. */
function listing(folder: string): string[] {
	return readdirSync(folder).sort()
}

describe('lot snapshot - the swap', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a folder with only brief.json effort high -> the second round refused naming lot risk, nothing written', () => {
		const root = repository()
		const folder = handoverFolder()
		writeFileSync(join(folder, 'brief.json'), '{ "effort": "high" }\n')

		expect(snapshotOf({ cwd: root, folder, round: 2 })).toEqual({
			exitCode: 2,
			output: noEffortLine({ folder, round: 2 }),
		})
		// a refused snapshot writes nothing (D30)
		expect(listing(folder)).toEqual(['brief.json'])
	})

	it('an effort line high over an identity low -> the third round allowed (case 18), one line printed', () => {
		const lot = createStationLot()
		setIdentityEffort({ lot, level: 'low' })
		writeRiskLines({ folder: lot.lotFolder, lines: [effortLineOf({ effort: 'high' })] })

		const result = snapshotOf({ cwd: lot.cwd, folder: lot.lotFolder, round: 3 })

		expect(result).toEqual({
			exitCode: 0,
			output: expect.stringMatching(/^lot snapshot: round-3 - [^\n]*$/),
		})
		expect(existsSync(join(lot.lotFolder, 'round-3.state'))).toBe(true)
		// no work tree to read: no derived line
		expect(readRiskRecords({ folder: lot.lotFolder }).derived).toEqual([])
	})

	it('an effort line low over an identity high -> the second round refused at the cap of 1', () => {
		const lot = createStationLot()
		setIdentityEffort({ lot, level: 'high' })
		writeRiskLines({ folder: lot.lotFolder, lines: [effortLineOf({ effort: 'low' })] })
		const before = listing(lot.lotFolder)

		expect(snapshotOf({ cwd: lot.cwd, folder: lot.lotFolder, round: 2 })).toEqual({
			exitCode: 2,
			output: beyondCapLine({ folder: lot.lotFolder, round: 2, cap: 1, effort: 'low' }),
		})
		expect(listing(lot.lotFolder)).toEqual(before)
	})

	it('a derived line high over an effort medium -> the third round allowed, the fourth refused at the cap of 3', () => {
		const lot = createStationLot()
		writeRiskLines({
			folder: lot.lotFolder,
			lines: [
				effortLineOf({ effort: 'medium' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
			],
		})

		const third = snapshotOf({ cwd: lot.cwd, folder: lot.lotFolder, round: 3 })
		const fourth = snapshotOf({ cwd: lot.cwd, folder: lot.lotFolder, round: 4 })

		expect({ third: third.exitCode, fourth }).toEqual({
			third: 0,
			fourth: {
				exitCode: 2,
				output: beyondCapLine({
					folder: lot.lotFolder,
					round: 4,
					cap: 3,
					effort: 'medium',
					riskClass: 'high',
				}),
			},
		})
	})

	it('a derived line high and no effort at all -> the second round refused at the cap of 1 naming lot risk', () => {
		const lot = createStationLot()
		setIdentityEffort({ lot, level: undefined })
		writeRiskLines({
			folder: lot.lotFolder,
			lines: [derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] })],
		})

		expect(snapshotOf({ cwd: lot.cwd, folder: lot.lotFolder, round: 2 })).toEqual({
			exitCode: 2,
			output: noEffortLine({ folder: lot.lotFolder, round: 2 }),
		})
	})
})

describe(
	'lot snapshot - a derivation that cannot run (D26)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a store lot whose base commit does not exist -> the snapshot is taken, no derived line, a last warning line', () => {
			const lot = createStationLot({ repositoryIsWorktree: true })

			const result = snapshotOf({ cwd: lot.cwd, folder: lot.lotFolder, round: 1 })
			const lines = result.output.split('\n')

			expect({
				exitCode: result.exitCode,
				first: lines[0].startsWith('lot snapshot: round-1 - '),
				last: lines.at(-1)?.startsWith('! risk class not derived: '),
				lineCount: lines.length,
				derived: readRiskRecords({ folder: lot.lotFolder }).derived,
				taken: existsSync(join(lot.lotFolder, 'round-1.state')),
			}).toEqual({ exitCode: 0, first: true, last: true, lineCount: 2, derived: [], taken: true })
		})
	},
)

describe('lot snapshot - the declared reason text', { timeout: STORE_CASE_TIMEOUT }, () => {
	type DeclaredCase = {
		title: string
		manifest: string
		changes: Record<string, string>
		line: string
	}

	const DECLARED_CASES: DeclaredCase[] = [
		{
			title: 'a glob over the file -> the file, declared and the glob',
			manifest:
				'{ "name": "scratch", "version": "1.0.0", "bin": { "scratch": "s.js" }, "dialecte": { "risk": { "high": ["src/lib/store/**"] } } }\n',
			changes: { 'src/lib/store/publish.ts': 'export const published = 1\n' },
			line: '! risk class now high (src/lib/store/publish.ts: declared src/lib/store/**): cap 3',
		},
		{
			title: 'an entry equal to the file -> the file and declared alone',
			manifest:
				'{ "name": "scratch", "version": "1.0.0", "bin": { "scratch": "s.js" }, "dialecte": { "risk": { "high": ["src/lib/store/publish.ts"] } } }\n',
			changes: { 'src/lib/store/publish.ts': 'export const published = 1\n' },
			line: '! risk class now high (src/lib/store/publish.ts: declared): cap 3',
		},
	]

	for (const { title, manifest, changes, line } of DECLARED_CASES)
		it(`${title}`, () => {
			const root = createScratchRepository({ 'package.json': manifest })
			const folder = handoverFolder()
			writeRiskLines({ folder, lines: [effortLineOf({ effort: 'medium' })] })
			writeFiles({ root, files: changes })

			expect(snapshotOf({ cwd: root, folder, round: 2 }).output.split('\n')).toEqual([
				expect.stringMatching(/^lot snapshot: round-2 - /),
				line,
			])
		})
})

describe('lot snapshot - the re-derivation (D7, case 28)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('effort medium, the first round on a clean tree, an rmSync added, the second round -> the derived line, the cap line, the third round allowed', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRiskLines({ folder, lines: [effortLineOf({ effort: 'medium' })] })
		expect(snapshotOf({ cwd: root, folder, round: 1 }).output.split('\n')).toEqual([
			expect.stringMatching(/^lot snapshot: round-1 - /),
		])
		writeFiles({ root, files: CLEANUP_FILE })

		const second = snapshotOf({ cwd: root, folder, round: 2 })
		const third = snapshotOf({ cwd: root, folder, round: 3 })

		expect({ exitCode: second.exitCode, lines: second.output.split('\n') }).toEqual({
			exitCode: 0,
			lines: [expect.stringMatching(/^lot snapshot: round-2 - /), RAISED_LINE],
		})
		expect(third.exitCode).toBe(0)
		expect(readRiskRecords({ folder }).derived).toEqual([
			{
				schema: 1,
				kind: 'derived',
				at: expect.any(String),
				class: 'light',
				reasons: expect.any(Array),
				from: 'snapshot',
			},
			{
				schema: 1,
				kind: 'derived',
				at: expect.any(String),
				class: 'high',
				reasons: [RMSYNC_REASON],
				from: 'snapshot',
			},
			{
				schema: 1,
				kind: 'derived',
				at: expect.any(String),
				class: 'high',
				reasons: [RMSYNC_REASON],
				from: 'snapshot',
			},
		])
	})

	it('effort medium, rounds one and two taken, an rmSync added, the third round -> allowed in the same call, no --beyond-cap, the cap line', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRiskLines({ folder, lines: [effortLineOf({ effort: 'medium' })] })
		snapshotOf({ cwd: root, folder, round: 1 })
		snapshotOf({ cwd: root, folder, round: 2 })
		writeFiles({ root, files: CLEANUP_FILE })

		const third = snapshotOf({ cwd: root, folder, round: 3 })

		expect({ exitCode: third.exitCode, lines: third.output.split('\n') }).toEqual({
			exitCode: 0,
			lines: [expect.stringMatching(/^lot snapshot: round-3 - /), RAISED_LINE],
		})
	})

	it('effort medium, rounds one and two taken, a clean tree, the third round -> refused, the refused call writes nothing', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRiskLines({ folder, lines: [effortLineOf({ effort: 'medium' })] })
		snapshotOf({ cwd: root, folder, round: 1 })
		snapshotOf({ cwd: root, folder, round: 2 })
		const before = listing(folder)

		expect(snapshotOf({ cwd: root, folder, round: 3 })).toEqual({
			exitCode: 2,
			output: beyondCapLine({ folder, round: 3, cap: 2, effort: 'medium' }),
		})
		expect(listing(folder)).toEqual(before)
		expect(readRiskRecords({ folder }).derived.map((line) => [line.class, line.from])).toEqual([
			['light', 'snapshot'],
			['light', 'snapshot'],
		])
	})

	it('effort high, an rmSync added, the first round -> the class is not above the effort: one line printed', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRiskLines({ folder, lines: [effortLineOf({ effort: 'high' })] })
		writeFiles({ root, files: CLEANUP_FILE })

		const result = snapshotOf({ cwd: root, folder, round: 1 })

		expect(result.output.split('\n')).toEqual([expect.stringMatching(/^lot snapshot: round-1 - /)])
		expect(readRiskRecords({ folder }).derived.map((line) => line.class)).toEqual(['high'])
	})

	it('no effort recorded, an rmSync added, the first round -> the derived line is kept, one line printed', () => {
		const root = repository()
		const folder = handoverFolder()
		writeFiles({ root, files: CLEANUP_FILE })

		const result = snapshotOf({ cwd: root, folder, round: 1 })

		expect(result.output.split('\n')).toEqual([expect.stringMatching(/^lot snapshot: round-1 - /)])
		expect(readRiskRecords({ folder }).derived).toEqual([
			{
				schema: 1,
				kind: 'derived',
				at: expect.any(String),
				class: 'high',
				reasons: [RMSYNC_REASON],
				from: 'snapshot',
			},
		])
	})
})

describe('lot snapshot - a refusal writes nothing (D30)', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** A folder with effort medium, rounds one and two taken on a clean tree, then the destructive file added. */
	function folderPastTwoRounds(): { root: string; folder: string } {
		const root = repository()
		const folder = handoverFolder()
		writeRiskLines({ folder, lines: [effortLineOf({ effort: 'medium' })] })
		snapshotOf({ cwd: root, folder, round: 1 })
		snapshotOf({ cwd: root, folder, round: 2 })
		writeFiles({ root, files: CLEANUP_FILE })
		return { root, folder }
	}

	it('a fourth round past the cap raised by the class -> refused naming the class, risk.jsonl and the folder unchanged', () => {
		const { root, folder } = folderPastTwoRounds()
		snapshotOf({ cwd: root, folder, round: 3 })
		const before = { listing: listing(folder), risk: riskTextOf(folder) }

		expect(snapshotOf({ cwd: root, folder, round: 4 })).toEqual({
			exitCode: 2,
			output: beyondCapLine({ folder, round: 4, cap: 3, effort: 'medium', riskClass: 'high' }),
		})
		expect({ listing: listing(folder), risk: riskTextOf(folder) }).toEqual(before)
	})

	it('no effort recorded, the second round on a derivable change -> refused, risk.jsonl and the folder unchanged', () => {
		const root = repository()
		const folder = handoverFolder()
		writeFiles({ root, files: CLEANUP_FILE })
		snapshotOf({ cwd: root, folder, round: 1 })
		const before = { listing: listing(folder), risk: riskTextOf(folder) }

		expect(snapshotOf({ cwd: root, folder, round: 2 })).toEqual({
			exitCode: 2,
			output: noEffortLine({ folder, round: 2 }),
		})
		expect({ listing: listing(folder), risk: riskTextOf(folder) }).toEqual(before)
	})

	it('a go-ahead holding a forbidden word -> refused, risk.jsonl and the folder unchanged', () => {
		const { root, folder } = folderPastTwoRounds()
		snapshotOf({ cwd: root, folder, round: 3 })
		configureMachine()
		git({ root, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
		const before = { listing: listing(folder), risk: riskTextOf(folder) }

		expect(
			snapshotOf({
				cwd: root,
				folder,
				round: 4,
				extra: ['--beyond-cap', '--by', FIRST_WORD, '--reason', 'x'],
			}),
		).toEqual({
			exitCode: 2,
			output: 'lot snapshot: --by holds a forbidden word: nothing written',
		})
		expect({ listing: listing(folder), risk: riskTextOf(folder) }).toEqual(before)
	})

	it('a class raised by a file later removed, the third round -> the cap falls back to 2: refused naming the effort, nothing written', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRiskLines({
			folder,
			lines: [effortLineOf({ effort: 'medium', reason: 'a rerun is cheap' })],
		})
		writeFiles({ root, files: { 'src/removal.ts': 'unlinkSync(target)\n' } })
		snapshotOf({ cwd: root, folder, round: 1 })
		snapshotOf({ cwd: root, folder, round: 2 })
		writeFiles({ root, files: { 'src/removal.ts': 'export const kept = 1\n' } })
		const before = { listing: listing(folder), risk: riskTextOf(folder) }

		expect(snapshotOf({ cwd: root, folder, round: 3 })).toEqual({
			exitCode: 2,
			output: beyondCapLine({ folder, round: 3, cap: 2, effort: 'medium' }),
		})
		expect({ listing: listing(folder), risk: riskTextOf(folder) }).toEqual(before)
	})
})
