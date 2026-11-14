/**
 * A damaged `identity.effort.level` (33K rev 5: a level other than `low`, `medium`, `high` is refused as damaged;
 * FIX-effort-damaged): `effectiveEffort` throws one refusal naming the lot and the field, and its readers end on it
 * with nothing written; a store lot holding such a level reads damaged (user B', 2026-11-14: the store's identity
 * check), so the store's verbs answer it as a damaged lot. A valid level, an effort line, a missing effort and a
 * folder with no identity read as before.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { RUNG_ONE_QUESTION } from '../../../test/ask-command-workspace.constants.ts'
import { createLotAskWorkspace } from '../../../test/ask-command-workspace.ts'
import { createStationLot } from '../../../test/lot-station-workspace.ts'
import { LOT_NAME as LOT_NAME_OF_ASK } from '../../../test/lot-stores.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { rewriteRecord } from '../../../test/station-records-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runAsk } from '../../commands/ask.ts'
import { runLotRisk } from '../../commands/lot-risk.ts'
import { runLot } from '../../commands/lot.ts'
import { runRecordVerb } from '../../commands/record.ts'
import { buildEffortLine } from '../gate-records/card-gates.ts'
import { readCheckedLotState, registryOfLotFolder } from '../store/lot-records.ts'
import { identityDamageOf } from '../store/record-checks.ts'
import { effectiveEffort, riskCapOf, riskStandingOf } from './risk-records.ts'
import { RISK_FILE } from './risk.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lot every library case names. */
const LOT_NAME = '0086-cli-effort-damaged'

/** The damaged forms of the level, each as it is printed in the refusal (JSON). */
const DAMAGED_LEVELS: { title: string; level: unknown; shown: string }[] = [
	{ title: 'an unknown word', level: 'urgent', shown: '"urgent"' },
	{ title: 'a level in capitals', level: 'HIGH', shown: '"HIGH"' },
	{ title: 'an empty level', level: '', shown: '""' },
	{ title: 'a number', level: 3, shown: '3' },
	{ title: 'null', level: null, shown: 'null' },
	{ title: 'a list', level: ['high'], shown: '["high"]' },
]

/** The refusal of a damaged level of the lot `name`. */
function refusalOf(params: { name: string; shown: string }): string {
	return `lot ${params.name}: identity.effort.level ${params.shown} is damaged: expected low, medium or high`
}

/** An identity of `LOT_NAME` whose `effort` is `effort` (left out when undefined). */
function identityText(effort: unknown): string {
	return JSON.stringify({
		schema: 1,
		name: LOT_NAME,
		index: '0086',
		repository: '/repo',
		store: '/repo/.git/dialecte-lots',
		worktree: `/repo/.worktrees/${LOT_NAME}`,
		branch: 'fix/effort-damaged',
		base: { ref: 'main', commit: '02e63db' },
		feature: 'effort-damaged',
		...(effort === undefined ? {} : { effort }),
		simulated: false,
		scenario: null,
		cli: '0.6.0',
		briefHash: 'sha256:aaaa',
		planHash: 'sha256:bbbb',
		created: '2026-11-14T08:00:00.000Z',
	})
}

/** A folder holding `files`. */
function folderWith(files: Record<string, string>): string {
	const folder = temporaryFolder('dialecte-effort-damaged-')
	for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text)
	return folder
}

/** A `risk.jsonl` holding one effort line `high`. */
const EFFORT_LINE_HIGH = `${JSON.stringify({
	schema: 1,
	kind: 'effort',
	at: '2026-11-14T09:00:00.000Z',
	effort: 'high',
	by: 'person-a',
})}\n`

describe('effectiveEffort - a damaged identity effort level', () => {
	const READERS: { name: string; read: (folder: string) => unknown }[] = [
		{ name: 'effectiveEffort', read: (folder) => effectiveEffort({ folder }) },
		{ name: 'riskStandingOf', read: (folder) => riskStandingOf({ folder }) },
		{ name: 'riskCapOf', read: (folder) => riskCapOf({ folder }) },
	]

	for (const reader of READERS)
		for (const { title, level, shown } of DAMAGED_LEVELS)
			it(`${reader.name}, ${title} -> throws the refusal naming the lot and the field`, () => {
				const folder = folderWith({
					'identity.json': identityText({ level, source: 'default' }),
				})

				expect(() => reader.read(folder)).toThrow(refusalOf({ name: LOT_NAME, shown }))
			})

	const UNCHANGED: { title: string; files: Record<string, string>; effort: string | undefined }[] =
		[
			{
				title: 'a valid level',
				files: { 'identity.json': identityText({ level: 'medium', source: 'default' }) },
				effort: 'medium',
			},
			{
				title: 'a damaged level under an effort line (the line wins, the identity is not read)',
				files: {
					'identity.json': identityText({ level: 'urgent', source: 'default' }),
					[RISK_FILE]: EFFORT_LINE_HIGH,
				},
				effort: 'high',
			},
			{
				title: 'an identity with no effort',
				files: { 'identity.json': identityText(undefined) },
				effort: undefined,
			},
			{ title: 'a folder with no identity', files: {}, effort: undefined },
		]

	for (const { title, files, effort } of UNCHANGED)
		it(`${title} -> ${effort ?? 'no effort'}, as before`, () => {
			expect(effectiveEffort({ folder: folderWith(files) })).toBe(effort)
		})
})

describe("identityDamageOf - the effort level (user B', 2026-11-14)", () => {
	/** A parsed identity of `LOT_NAME` whose `effort` is `effort`. */
	function identityWith(effort: unknown): Parameters<typeof identityDamageOf>[0] {
		return JSON.parse(identityText(effort)) as Parameters<typeof identityDamageOf>[0]
	}

	for (const { title, level } of DAMAGED_LEVELS)
		it(`${title} -> the effort level damage`, () => {
			expect(identityDamageOf(identityWith({ level, source: 'default' }))).toBe(
				'identity.json holds an effort level other than low, medium or high',
			)
		})

	const HOLDING: { title: string; effort: unknown }[] = [
		{ title: 'a valid level', effort: { level: 'high', source: 'default' } },
		{ title: 'no effort', effort: undefined },
		{ title: 'an effort with no level', effort: { source: 'default' } },
	]
	for (const { title, effort } of HOLDING)
		it(`${title} -> no damage`, () => {
			expect(identityDamageOf(identityWith(effort))).toBeUndefined()
		})
})

describe('every reader of the effort - a damaged level', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** The level every reader case writes. */
	const LEVEL = 'urgent'

	/** Rewrites the identity of the lot at `lotFolder` with `LEVEL` as its effort level. */
	function damageLevel(lotFolder: string): void {
		const path = join(lotFolder, 'identity.json')
		const identity = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		rewriteRecord({
			path,
			text: JSON.stringify({ ...identity, effort: { level: LEVEL, source: 'default' } }),
		})
	}

	/** A store lot whose identity's effort level is damaged. */
	function damagedStationLot(): StationLot {
		const lot = createStationLot()
		damageLevel(lot.lotFolder)
		return lot
	}

	/** The names a folder holds, with each file's text: what a call may write. */
	function writtenOf(folder: string): string {
		return JSON.stringify(
			readdirSync(folder, { recursive: true, encoding: 'utf8' })
				.sort()
				.map((name) => {
					try {
						return [name, readFileSync(join(folder, name), 'utf8')]
					} catch {
						return [name]
					}
				}),
		)
	}

	/** What a reader case runs: the lot's folder and name, and the read. */
	type ArrangedReader = { lotFolder: string; name: string; read: () => unknown }

	/** A reader of a store lot made by `createStationLot`. */
	function onStationLot(read: (lot: StationLot) => unknown): () => ArrangedReader {
		return function arrangeStationLot() {
			const lot = damagedStationLot()
			return { lotFolder: lot.lotFolder, name: lot.name, read: () => read(lot) }
		}
	}

	/** What a store lot with such a level reads as: damaged, for this reason (the user's B', 2026-11-14). */
	const DAMAGE_REASON = 'identity.json holds an effort level other than low, medium or high'

	/**
	 * How a reader ends, settled into one value: `{ threw }` the refusal (a command's caller prints it, exit 1), or
	 * `{ answered }` what it returned - a verb that catches its own errors, or a store reader that reads the lot damaged
	 * first - for the lot named `name`.
	 */
	type Settled = { threw: string } | { answered: unknown }

	/** How a case title names each end. */
	const REFUSAL_END = 'the refusal naming the lot and the field'
	const DAMAGED_END = 'the lot damaged'

	/** What the read settles to: its value, or the message it threw. */
	async function settledOf(read: () => unknown): Promise<Settled> {
		try {
			return { answered: await read() }
		} catch (error) {
			return { threw: (error as Error).message }
		}
	}

	const READERS: {
		title: string
		arrange: () => ArrangedReader
		/** How the case title names the end. */
		ends: string
		settles: (params: { name: string; refusal: string }) => Settled
	}[] = [
		{
			title: 'ask --lot',
			arrange: function arrangeAsk() {
				const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })
				damageLevel(lotFolder)
				return {
					lotFolder,
					name: LOT_NAME_OF_ASK,
					read: () =>
						runAsk({
							argv: [RUNG_ONE_QUESTION, '--lot', lotFolder, '--json'],
							cwd: workspace.cwd,
							environment: workspace.environment,
						}),
				}
			},
			ends: REFUSAL_END,
			settles: ({ refusal }) => ({ threw: refusal }),
		},
		{
			title: 'lot snapshot',
			arrange: onStationLot((lot) =>
				runRecordVerb({
					verb: 'snapshot',
					cwd: lot.cwd,
					argv: [lot.lotFolder, '--round', '1'],
				}),
			),
			ends: REFUSAL_END,
			settles: ({ refusal }) => ({
				answered: { exitCode: 1, output: `lot snapshot: ${refusal}` },
			}),
		},
		{
			title: "the card's effort line",
			arrange: onStationLot((lot) => buildEffortLine({ folder: lot.lotFolder })),
			ends: REFUSAL_END,
			settles: ({ refusal }) => ({ threw: refusal }),
		},
		{
			title: 'lot risk (a store lot: read damaged)',
			arrange: onStationLot((lot) => runLotRisk({ cwd: lot.cwd, argv: [lot.lotFolder] })),
			ends: DAMAGED_END,
			settles: ({ name }) => ({
				answered: { exitCode: 2, output: `lot risk: ${name} damaged: ${DAMAGE_REASON}` },
			}),
		},
		{
			title: 'lot status (a store lot: read damaged)',
			arrange: onStationLot((lot) => runLot({ cwd: lot.cwd, argv: ['status', lot.name] })),
			ends: DAMAGED_END,
			settles: ({ name }) => ({
				answered: {
					exitCode: 6,
					output: `${name} damaged: ${DAMAGE_REASON}\nnext: dialecte lot stop ${name} --reason <text>`,
				},
			}),
		},
		{
			title: 'lot status --json (a store lot: read damaged)',
			arrange: onStationLot((lot) =>
				runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] }),
			),
			ends: DAMAGED_END,
			settles: ({ name }) => ({
				answered: {
					exitCode: 6,
					output: JSON.stringify(
						{
							lot: name,
							state: 'damaged',
							reason: DAMAGE_REASON,
							next: `dialecte lot stop ${name} --reason <text>`,
						},
						null,
						2,
					),
				},
			}),
		},
		{
			title: 'the lot reader before the next-station walk (a store lot: read damaged)',
			arrange: onStationLot((lot) =>
				readCheckedLotState({
					lotFolder: lot.lotFolder,
					registry: registryOfLotFolder(lot.lotFolder),
				}),
			),
			ends: DAMAGED_END,
			settles: () => ({ answered: { damage: DAMAGE_REASON, identity: expect.anything() } }),
		},
	]

	for (const reader of READERS)
		it(`${reader.title}, an unknown word as the level -> ${reader.ends}, nothing written`, async () => {
			const { lotFolder, name, read } = reader.arrange()
			const refusal = refusalOf({ name, shown: JSON.stringify(LEVEL) })
			const before = writtenOf(lotFolder)

			const settled = await settledOf(read)

			expect(settled).toEqual(reader.settles({ name, refusal }))
			expect(writtenOf(lotFolder)).toBe(before)
		})
})
