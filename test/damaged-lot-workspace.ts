/** Damaged lots written into a start workspace's store by a hand: plain file edits, no code of the store under test. */
import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { startLot } from '../src/commands/lot-start.ts'
import { HANDOVER_RUN_MARKER_FILE } from '../src/lib/handover/handover.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import {
	ASIDE_FOLDER,
	BAD_INDEX,
	BAD_STEP,
	DAMAGED_NAME,
	DAMAGES,
	OTHER_LOT_NAME,
	OVERLAPPING_SCOPE,
	RUNNING_REFUSAL,
	STOPPED_FILE,
} from './damaged-lot-workspace.constants.ts'
import { withJson } from './lot-start-workspace.ts'
import { START_NOW } from './lot-start.constants.ts'
import { RUN_STARTED_AT } from './lot-stop-workspace.constants.ts'
import { RECORD_TIME } from './store-records.constants.ts'
import { transitionOf, writeRecordFile } from './store-records.ts'

import type { StartSeams } from '../src/commands/lot-start.types.ts'
import type { BriefDamage, DamageKind, DamagedLot } from './damaged-lot-workspace.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** Replaces the file `name` of the folder with `text`: a published file is read-only, a hand replaces it. */
export function replaceRecord(params: { folder: string; name: string; text: string }): void {
	const path = join(params.folder, params.name)
	rmSync(path, { force: true })
	writeFileSync(path, params.text)
}

/** The row of the damage table for `kind`. */
function rowOf(kind: DamageKind): (typeof DAMAGES)[number] {
	const row = DAMAGES.find((candidate) => candidate.kind === kind)
	if (row === undefined) throw new Error(`no damage row for ${kind}`)
	return row
}

/** A lot of the workspace's store (a working real lot) with `kind` done to its records; its readers' reason. */
export function damagedLotIn(params: {
	start: StartWorkspace
	kind: DamageKind
	name?: string
	scope?: string[]
	/** A simulated lot: its identity says so, and a simulated lot holds no scope. */
	simulated?: boolean
}): DamagedLot {
	const { start, kind } = params
	const name = params.name ?? DAMAGED_NAME
	const written = writeStoreLot({
		workspace: start.workspace,
		name,
		simulated: params.simulated,
		scope: params.scope ?? OVERLAPPING_SCOPE,
		repository: start.workspace.repository,
		registry: kind === 'unknownEntryState' ? 'pending' : undefined,
	})
	const lotFolder = realpathSync(written)
	applyDamage({ start, lotFolder, name, kind })
	return { start, name, lotFolder, reason: rowOf(kind).reason }
}

/** A lot with no identity whose `brief.json` cannot give its scope as `brief` says. */
export function briefDamagedLotIn(params: {
	start: StartWorkspace
	brief: BriefDamage
	name?: string
}): DamagedLot {
	const { start } = params
	const name = params.name ?? DAMAGED_NAME
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace: start.workspace,
			name,
			scope: OVERLAPPING_SCOPE,
			repository: start.workspace.repository,
		}),
	)
	rmSync(join(lotFolder, 'identity.json'))
	if (params.brief === 'missing') rmSync(join(lotFolder, 'brief.json'))
	if (params.brief === 'unparsable')
		replaceRecord({ folder: lotFolder, name: 'brief.json', text: '{ "scope": [' })
	if (params.brief === 'scopeNotList')
		replaceRecord({
			folder: lotFolder,
			name: 'brief.json',
			text: JSON.stringify({ scope: OVERLAPPING_SCOPE[0] }),
		})
	return { start, name, lotFolder, reason: rowOf('identityMissing').reason }
}

/** Does to the lot's records what `kind` says. */
function applyDamage(params: {
	start: StartWorkspace
	lotFolder: string
	name: string
	kind: DamageKind
}): void {
	const { start, lotFolder, name, kind } = params
	const identityPath = join(lotFolder, 'identity.json')
	if (kind === 'identityMissing') rmSync(identityPath)
	if (kind === 'identityUnparsable')
		replaceRecord({ folder: lotFolder, name: 'identity.json', text: '{ "schema": 1, ' })
	if (kind === 'identityOtherName' || kind === 'identityIndex') {
		const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as Record<string, unknown>
		replaceRecord({
			folder: lotFolder,
			name: 'identity.json',
			text: JSON.stringify(
				kind === 'identityOtherName'
					? { ...identity, name: OTHER_LOT_NAME }
					: { ...identity, index: BAD_INDEX },
			),
		})
	}
	if (kind === 'badTransition') {
		const forged = transitionOf({ seq: 2 })
		writeRecordFile({
			folder: lotFolder,
			name: 'transitions/000002.json',
			text: JSON.stringify({
				...forged,
				lot: name,
				position: { ...forged.position, step: BAD_STEP },
			}),
		})
	}
	if (kind === 'strayAnswer')
		writeRecordFile({
			folder: lotFolder,
			name: 'answers/zz.json',
			text: JSON.stringify({ question: 'zz', answer: 'keep', by: 'caller', at: RECORD_TIME }),
		})
	if (kind === 'unknownEntryState') {
		const path = join(start.workspace.registry, `${name}.json`)
		const entry = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		rmSync(path)
		writeFileSync(path, JSON.stringify({ ...entry, state: 'bogus' }))
	}
}

/** `lot start` of the workspace's default brief, as JSON, at `START_NOW`. */
export function startDefaultBrief(params: { start: StartWorkspace; seams?: StartSeams }): {
	exitCode: number
	json: unknown
} {
	const { start } = params
	return withJson(
		startLot({
			cwd: start.cwd,
			argv: [start.workspace.briefPath, '--json'],
			now: START_NOW,
			seams: params.seams,
		}),
	)
}

/** The refusals of a `lot start --json` that was refused: `<field>: <rule>` and the detail of each. */
export function refusalsOf(params: {
	json: unknown
}): { field: string; rule: string; detail: string }[] {
	return (
		(params.json as { refused?: { field: string; rule: string; detail: string }[] }).refused ?? []
	)
}

/** The refusal of a stop while a live run (this process) holds the folder, as the abandon words it. */
export function runningRefusalOf(params: { folder: string }): string {
	return RUNNING_REFUSAL.replace('{folder}', params.folder)
		.replace('{pid}', String(process.pid))
		.replace('{startedAt}', RUN_STARTED_AT)
		.replace('{marker}', join(params.folder, HANDOVER_RUN_MARKER_FILE))
}

/** The device and inode of the folder or link itself (never what a link points to): equal before and after a rename. */
export function fileIdentityOf(params: { path: string }): string {
	const status = lstatSync(params.path, { bigint: true })
	return `${status.dev}:${status.ino}`
}

/** The two lines a reader prints of a damaged lot: its state with the reason, then the stop command. */
export function damagedLines(lot: Pick<DamagedLot, 'name' | 'reason'>): string[] {
	return [
		`${lot.name} damaged: ${lot.reason}`,
		`next: dialecte lot stop ${lot.name} --reason <text>`,
	]
}

/** What the JSON of a damaged lot holds: its name, the state, the reason and the stop command. */
export function damagedJson(lot: Pick<DamagedLot, 'name' | 'reason'>): Record<string, unknown> {
	return {
		lot: lot.name,
		state: 'damaged',
		reason: lot.reason,
		next: `dialecte lot stop ${lot.name} --reason <text>`,
	}
}

/** The folder that holds the lots of the lot's store moved aside: `<git common folder>/dialecte-lots-aside`. */
export function asideFolderOf(lot: Pick<DamagedLot, 'lotFolder'>): string {
	return join(dirname(dirname(lot.lotFolder)), ASIDE_FOLDER)
}

/** The names in the aside folder, sorted; none when it does not exist. */
export function asideNamesOf(lot: Pick<DamagedLot, 'lotFolder'>): string[] {
	const folder = asideFolderOf(lot)
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** `stopped.json` of the moved folder at `folder`, parsed. */
export function stoppedRecordOf(params: { folder: string }): unknown {
	return JSON.parse(readFileSync(join(params.folder, STOPPED_FILE), 'utf8'))
}
