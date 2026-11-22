/**
 * A lot kept on purpose (KEEP 3.1, 3.2): `keep.jsonl` read by one reader, its last line the decision, anything that does
 * not read kept (fail closed, never damaged); the one lot reader carrying the keep on both its variants, the state never
 * changed; the one text, the one next and the move-time re-read every consumer calls.
 */
import { chmodSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../../test/brief-workspace.ts'
import {
	KEEP_AT,
	KEEP_BY,
	KEEP_REASON,
	OTHER_KEEP_REASON,
	UNKEEP_REASON,
} from '../../../test/keep-decision-workspace.constants.ts'
import {
	damageLot,
	damagedTextOf,
	goneTextOf,
	keepFileOf,
	keepLineOf,
	keptTextOf,
	makeKeepFolder,
	unkeepNextOf,
	writeKeepDocument,
	writeKeepLine,
} from '../../../test/keep-decision-workspace.ts'
import { KEEP_SCOPE } from '../../../test/lot-keep-workspace.constants.ts'
import { addLotWithoutWorktree, addLotWorktree } from '../../../test/lot-keep-workspace.ts'
import { heldWorktreesOf } from '../../../test/lot-stop-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readKeepDecision } from './keep-decisions.ts'
import { lotItemOf, readLotItems } from './lot-items.ts'
import { keepNextOf, keptByDecision, keptByDecisionOf } from './lot-keep.ts'
import { isOpenRealLot, overlappingOpenLots, readCheckedLotState } from './lot-records.ts'
import { lotState } from './lot-state.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'
import type { LotKeepState } from '../../../test/lot-keep-workspace.types.ts'
import type { KeepDecision } from './keep-decisions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The files a case made unreadable: given their mode back after it, so the scratch folders can be removed. */
const UNREADABLE: string[] = []

afterEach(function restoreModes() {
	for (const path of UNREADABLE.splice(0)) chmodSync(path, 0o644)
})

/** A line as JSON with its line feed. */
function lineText(value: unknown): string {
	return `${JSON.stringify(value)}\n`
}

/** A lot folder of its own (the reader reads files only: no store needed). */
function lotFolderOf(): string {
	return realpathSync(temporaryFolder('dialecte-keep-lot-'))
}

const KEEP_A = keepLineOf()
const KEEP_B = keepLineOf({ reason: OTHER_KEEP_REASON, at: '2026-11-21T09:00:00.000Z' })
const UNKEEP = keepLineOf({ op: 'unkeep', reason: UNKEEP_REASON, at: '2026-11-20T10:00:00.000Z' })

type RecordRow = { title: string; text: string; expected: KeepDecision | undefined }

const RECORD_ROWS: RecordRow[] = [
	{ title: 'one keep line', text: lineText(KEEP_A), expected: { kept: KEEP_A } },
	{ title: 'keep, then unkeep', text: lineText(KEEP_A) + lineText(UNKEEP), expected: undefined },
	{
		title: 'keep, unkeep, then keep with another reason',
		text: lineText(KEEP_A) + lineText(UNKEEP) + lineText(KEEP_B),
		expected: { kept: KEEP_B },
	},
	{
		title: 'keep A, then keep B',
		text: lineText(KEEP_A) + lineText(KEEP_B),
		expected: { kept: KEEP_B },
	},
	{
		title: 'a line of another schema',
		text: lineText({ ...KEEP_A, schema: 2 }),
		expected: { unreadable: 1 },
	},
	{
		title: 'a line of an unknown op',
		text: lineText({ ...KEEP_A, op: 'hold' }),
		expected: { unreadable: 1 },
	},
	{
		title: 'a line with a key the schema does not name',
		text: lineText({ ...KEEP_A, until: KEEP_AT }),
		expected: { unreadable: 1 },
	},
	{
		title: 'a line with a blank by',
		text: lineText({ ...KEEP_A, by: ' ' }),
		expected: { unreadable: 1 },
	},
	{
		title: 'a line with a blank reason',
		text: lineText({ ...KEEP_A, reason: '' }),
		expected: { unreadable: 1 },
	},
	{
		title: 'a line without its reason',
		text: lineText({ schema: 1, at: KEEP_AT, op: 'keep', by: KEEP_BY }),
		expected: { unreadable: 1 },
	},
	{ title: 'a line that is no JSON', text: '{"schema":1,\n', expected: { unreadable: 1 } },
	{
		title: 'a good line, then a torn last line (no line feed)',
		text: lineText(KEEP_A) + JSON.stringify(UNKEEP),
		expected: { unreadable: 1 },
	},
	{
		title: 'a line that does not read, then an unkeep (fail closed: never not kept)',
		text: lineText({ ...KEEP_A, op: 'hold' }) + lineText(UNKEEP),
		expected: { unreadable: 1 },
	},
]

describe('readKeepDecision: the last line decides, anything unreadable reads kept', () => {
	it('no file → not kept', () => {
		expect(readKeepDecision({ lotFolder: lotFolderOf() })).toBeUndefined()
	})

	it.each(RECORD_ROWS)('$title', ({ text, expected }) => {
		const lotFolder = lotFolderOf()
		writeFileSync(keepFileOf(lotFolder), text)

		expect(readKeepDecision({ lotFolder })).toEqual(expected)
	})

	it('keep.jsonl is a folder (EISDIR) → kept, the code named', () => {
		const lotFolder = lotFolderOf()
		makeKeepFolder({ lotFolder })

		expect(readKeepDecision({ lotFolder })).toEqual({ unreadableFile: 'EISDIR' })
	})

	it.skipIf(process.getuid?.() === 0)(
		'keep.jsonl with mode 000 (EACCES; not run as root) → kept, the code named',
		() => {
			const lotFolder = lotFolderOf()
			writeKeepLine({ lotFolder })
			chmodSync(keepFileOf(lotFolder), 0o000)
			UNREADABLE.push(keepFileOf(lotFolder))

			expect(readKeepDecision({ lotFolder })).toEqual({ unreadableFile: 'EACCES' })
		},
	)
})

/** A schema of one object: the keywords keep-decision.schema.json uses. */
type LineSchema = {
	type?: string
	required?: string[]
	additionalProperties?: boolean
	properties?: Record<
		string,
		{ type?: string; const?: unknown; enum?: unknown[]; minLength?: number; pattern?: string }
	>
}

/** What `line` breaks of keep-decision.schema.json; what the file's read threw when it does not read. */
function schemaViolationsOf(line: Record<string, unknown>): string[] {
	let schema: LineSchema
	try {
		schema = JSON.parse(
			readFileSync(join(import.meta.dirname, 'keep-decision.schema.json'), 'utf8'),
		) as LineSchema
	} catch (error) {
		return [String(error)]
	}
	const properties = schema.properties ?? {}
	const keys = Object.keys(line)
	return [
		...(schema.type === 'object' ? [] : ['not an object schema']),
		...(schema.additionalProperties === false ? [] : ['additional properties allowed']),
		...(schema.required ?? []).filter((key) => !keys.includes(key)).map((key) => `missing ${key}`),
		...keys.filter((key) => !(key in properties)).map((key) => `unnamed ${key}`),
		...keys.flatMap(function valueViolations(key): string[] {
			const property = properties[key]
			const value = line[key]
			if (property === undefined) return []
			if (property.type !== undefined && typeof value !== property.type) return [`${key} type`]
			if ('const' in property && value !== property.const) return [`${key} const`]
			if (property.enum !== undefined && !property.enum.includes(value)) return [`${key} enum`]
			if (typeof value !== 'string') return []
			if (property.minLength !== undefined && value.length < property.minLength)
				return [`${key} minLength`]
			if (property.pattern !== undefined && !new RegExp(property.pattern).test(value))
				return [`${key} pattern`]
			return []
		}),
	]
}

/**
 * The verdict of the schema and of the reader on one line alone in a keep file: accepted or not, or what the read
 * threw.
 */
function verdictsOf(line: Record<string, unknown>): { schema: boolean; parser: boolean | string } {
	const lotFolder = lotFolderOf()
	writeFileSync(keepFileOf(lotFolder), lineText(line))
	return { schema: schemaViolationsOf(line).length === 0, parser: parserVerdictOf({ lotFolder }) }
}

/** Whether the reader reads the lot folder's one line (kept by it or released by it); what it threw when it throws. */
function parserVerdictOf(params: { lotFolder: string }): boolean | string {
	try {
		const read = readKeepDecision(params)
		return read === undefined || !('unreadable' in read)
	} catch (error) {
		return String(error)
	}
}

const PARITY_ROWS: { title: string; line: Record<string, unknown>; accepted: boolean }[] = [
	{ title: 'a keep line', line: KEEP_A, accepted: true },
	{ title: 'an unkeep line', line: UNKEEP, accepted: true },
	{ title: 'another schema', line: { ...KEEP_A, schema: 2 }, accepted: false },
	{ title: 'an unknown op', line: { ...KEEP_A, op: 'hold' }, accepted: false },
	{ title: 'a key the schema does not name', line: { ...KEEP_A, until: KEEP_AT }, accepted: false },
	{
		title: 'no reason',
		line: { schema: 1, at: KEEP_AT, op: 'keep', by: KEEP_BY },
		accepted: false,
	},
	{
		title: 'no at',
		line: { schema: 1, op: 'keep', by: KEEP_BY, reason: KEEP_REASON },
		accepted: false,
	},
	{ title: 'a blank by', line: { ...KEEP_A, by: '' }, accepted: false },
	{ title: 'a by of spaces', line: { ...KEEP_A, by: '   ' }, accepted: false },
	{ title: 'a blank reason', line: { ...KEEP_A, reason: '' }, accepted: false },
	{ title: 'a by that is no text', line: { ...KEEP_A, by: 7 }, accepted: false },
]

describe('keep-decision.schema.json and the reader agree on every line', () => {
	it.each(PARITY_ROWS)('$title', ({ line, accepted }) => {
		expect(verdictsOf(line)).toEqual({ schema: accepted, parser: accepted })
	})
})

/** The state the lot reads before and after its keep line, and the keep the one reader carries. */
function stateAroundKeep(params: { workspace: BriefWorkspace; state: LotKeepState }): {
	before: string | undefined
	after: string | undefined
	keep: KeepDecision | undefined
} {
	const { workspace } = params
	const lotFolder = addLotWithoutWorktree({
		workspace,
		name: '0001-repo-kept',
		state: params.state,
	})
	const before = stateOfLot({ lotFolder, registry: workspace.registry })
	writeKeepLine({ lotFolder })
	const checked = readCheckedLotState({ lotFolder, registry: workspace.registry })
	return {
		before,
		after: stateOfLot({ lotFolder, registry: workspace.registry }),
		keep: checked?.keep,
	}
}

/** The state of a lot whose records hold; undefined for a damaged lot. */
function stateOfLot(params: { lotFolder: string; registry: string }): string | undefined {
	const checked = readCheckedLotState(params)
	return checked !== undefined && 'input' in checked ? lotState(checked.input).state : undefined
}

const STATES: LotKeepState[] = [
	'working',
	'input-required',
	'ready',
	'failed',
	'canceled',
	'committed',
]

describe(
	'readCheckedLotState: the one lot reader carries the keep',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each(STATES)(
			'a lot %s with a keep line → the keep on the input, the state unchanged',
			(state) => {
				const workspace = createBriefWorkspace()

				expect(stateAroundKeep({ workspace, state })).toEqual({
					before: state,
					after: state,
					keep: { kept: keepLineOf() },
				})
			},
		)

		it('a damaged lot (a transition file that does not hold) with a keep line → the damaged variant, kept', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({
				workspace,
				name: '0001-repo-kept',
				state: 'committed',
			})
			const damage = damageLot({ lotFolder })
			writeKeepLine({ lotFolder })

			expect(readCheckedLotState({ lotFolder, registry: workspace.registry })).toEqual({
				damage,
				identity: expect.objectContaining({ name: '0001-repo-kept' }),
				keep: { kept: keepLineOf() },
			})
		})

		it('a lot whose identity names another folder, with a keep line → the damaged variant, kept', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({
				workspace,
				name: '0001-repo-kept',
				state: 'working',
			})
			const identityPath = join(lotFolder, 'identity.json')
			const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as Record<string, unknown>
			rmSync(identityPath, { force: true })
			writeFileSync(identityPath, lineText({ ...identity, name: '0001-repo-other' }))
			writeKeepLine({ lotFolder })

			expect(readCheckedLotState({ lotFolder, registry: workspace.registry })).toEqual({
				damage: expect.any(String),
				identity: expect.objectContaining({ name: '0001-repo-other' }),
				keep: { kept: keepLineOf() },
			})
		})

		it('a lot whose identity.json does not read, with a keep line → the damaged variant, no identity, kept', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({
				workspace,
				name: '0001-repo-kept',
				state: 'working',
			})
			const identityPath = join(lotFolder, 'identity.json')
			rmSync(identityPath, { force: true })
			writeFileSync(identityPath, '{ not json\n')
			writeKeepLine({ lotFolder })

			expect(readCheckedLotState({ lotFolder, registry: workspace.registry })).toEqual({
				damage: expect.any(String),
				identity: undefined,
				keep: { kept: keepLineOf() },
			})
		})

		it('a lot with an unreadable keep line → kept with the count, never damaged', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({
				workspace,
				name: '0001-repo-kept',
				state: 'committed',
			})
			writeKeepDocument({ lotFolder, text: JSON.stringify(keepLineOf()) })

			expect(readCheckedLotState({ lotFolder, registry: workspace.registry })).toEqual({
				input: expect.objectContaining({
					identity: expect.objectContaining({ name: '0001-repo-kept' }),
				}),
				keep: { unreadable: 1 },
			})
		})
	},
)

const NAME = '0001-repo-kept'

const NEXT_ROWS: { title: string; keep: KeepDecision; expected: string }[] = [
	{ title: 'a readable keep', keep: { kept: keepLineOf() }, expected: unkeepNextOf(NAME) },
	{
		title: 'a keep line that does not read',
		keep: { unreadable: 1 },
		expected: `repair keep.jsonl by hand (1 line(s) do not read), then: ${unkeepNextOf(NAME)}`,
	},
	{
		title: 'a keep file that cannot be read',
		keep: { unreadableFile: 'EISDIR' },
		expected: `repair keep.jsonl by hand (EISDIR), then: ${unkeepNextOf(NAME)}`,
	},
]

describe('keepNextOf: the one next of a kept lot', () => {
	it.each(NEXT_ROWS)('$title → $expected', ({ keep, expected }) => {
		expect(keepNextOf({ name: NAME, keep })).toBe(expected)
	})
})

const TEXT_ROWS: { title: string; keep: KeepDecision | undefined; expected: string | undefined }[] =
	[
		{ title: 'a readable keep', keep: { kept: keepLineOf() }, expected: keptTextOf() },
		{
			title: 'a readable keep of another day and signer',
			keep: { kept: keepLineOf({ by: 'orchestrator', at: '2026-12-01T23:59:59.000Z' }) },
			expected: `kept by decision: ${KEEP_REASON} (by orchestrator, 2026-12-01)`,
		},
		{
			title: 'two lines that do not read',
			keep: { unreadable: 2 },
			expected: 'kept: keep.jsonl holds 2 line(s) that do not read',
		},
		{
			title: 'a keep file that cannot be read',
			keep: { unreadableFile: 'EACCES' },
			expected: 'kept: keep.jsonl cannot be read (EACCES)',
		},
		{ title: 'no keep', keep: undefined, expected: undefined },
	]

describe('keptByDecision: the one text of a keep', () => {
	it.each(TEXT_ROWS)('$title', ({ keep, expected }) => {
		expect(keptByDecision({ keep })).toBe(expected)
	})
})

describe(
	'keptByDecisionOf: one lot read again at the move',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a kept lot → the kept text', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			writeKeepLine({ lotFolder })

			expect(keptByDecisionOf({ lotFolder })).toBe(keptTextOf())
		})

		it('a damaged kept lot → the kept text, not the damaged one', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			damageLot({ lotFolder })
			writeKeepLine({ lotFolder })

			expect(keptByDecisionOf({ lotFolder })).toBe(keptTextOf())
		})

		it('a damaged lot not kept → the damaged text (fail closed)', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			const damage = damageLot({ lotFolder })

			expect(keptByDecisionOf({ lotFolder })).toBe(damagedTextOf({ name: NAME, damage }))
		})

		it('a lot folder gone from the store → no longer in the store (fail closed)', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			renameSync(lotFolder, join(temporaryFolder('dialecte-moved-lot-'), NAME))

			expect(keptByDecisionOf({ lotFolder })).toBe(goneTextOf(NAME))
		})

		it('a lot not kept whose records hold → undefined', () => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })

			expect(keptByDecisionOf({ lotFolder })).toBeUndefined()
		})
	},
)

describe('a kept lot holds no scope', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a committed kept lot → not an open real lot, a new lot meeting its scope meets no overlap, its keep read', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder })

		expect(
			((checked) => ({
				open:
					checked !== undefined && 'input' in checked ? isOpenRealLot(checked.input) : undefined,
				keep: checked?.keep,
				overlaps: overlappingOpenLots({
					store: workspace.store,
					registry: workspace.registry,
					scope: KEEP_SCOPE,
					caseInsensitive: false,
				}),
			}))(readCheckedLotState({ lotFolder, registry: workspace.registry })),
		).toEqual({ open: false, keep: { kept: keepLineOf() }, overlaps: [] })
	})
})

const OPEN_FIRST = { open: '0001-repo-open', kept: '0002-repo-kept' }
const KEPT_FIRST = { open: '0002-repo-open', kept: '0001-repo-kept' }

describe(
	'the held items of readLotItems: a kept closed lot holds its worktree, an open lot wins a shared one',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each([
			{ title: 'the open lot first', names: OPEN_FIRST },
			{ title: 'the kept lot first', names: KEPT_FIRST },
		])(
			'$title → the shared worktree with the open lot’s reason, a kept lot’s own with the kept text',
			({ names }) => {
				const workspace = createBriefWorkspace()
				const open = addLotWorktree({
					workspace,
					name: names.open,
					state: 'working',
					merged: false,
				})
				const sharing = addLotWithoutWorktree({
					workspace,
					name: names.kept,
					state: 'committed',
					worktree: open.worktree,
				})
				writeKeepLine({ lotFolder: sharing })
				const alone = addLotWorktree({ workspace, name: '0003-repo-alone', state: 'committed' })
				writeKeepLine({ lotFolder: alone.lotFolder })

				expect(heldWorktreesOf(readLotItems({ repository: workspace.repository }))).toEqual({
					[open.worktree]: `lot ${names.open} working`,
					[alone.worktree]: keptTextOf(),
				})
			},
		)

		it('a damaged lot kept on purpose → its worktree held with its kept text, not lot <name> damaged', () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: '0001-repo-damaged', state: 'working' })
			damageLot({ lotFolder: lot.lotFolder })
			writeKeepLine({ lotFolder: lot.lotFolder })

			expect(
				lotItemOf({
					items: readLotItems({ repository: workspace.repository }),
					worktree: lot.worktree,
				}),
			).toMatchObject({ held: true, reason: keptTextOf() })
		})
	},
)
