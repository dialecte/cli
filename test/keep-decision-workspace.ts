/**
 * The keep decisions of the KEEP cases: a lot's `keep.jsonl` written as whole lines (a good line, a document that does
 * not read, a folder in its place), a lot made damaged by a whole transition file that does not hold, and the reads
 * the cases compare (the file, the `keep.changed` events, a `worktree prune --json` plan).
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import {
	KEEP_AT,
	KEEP_BY,
	KEEP_REASON,
	KEEP_VERB_NOW,
	TRANSITION_DAMAGE,
	UNKEEP_NEXT,
} from './keep-decision-workspace.constants.ts'
import { writeRecordFile } from './store-records.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { KeepLine } from '../src/lib/store/keep-decisions.types.ts'
import type { KeepLineSpec, WorktreePruneItems } from './keep-decision-workspace.types.ts'

/** The keep line of `spec`: a `keep` by the cases' signer, with their reason and time, unless said. */
export function keepLineOf(spec: KeepLineSpec = {}): KeepLine {
	return {
		schema: 1,
		at: spec.at ?? KEEP_AT,
		op: spec.op ?? 'keep',
		by: spec.by ?? KEEP_BY,
		reason: spec.reason ?? KEEP_REASON,
	}
}

/** The lot folder's `keep.jsonl`. */
export function keepFileOf(lotFolder: string): string {
	return join(lotFolder, STORE_FILES.keep)
}

/** Appends the keep line of `spec` to the lot folder's `keep.jsonl`, whole, with its line feed; the line. */
export function writeKeepLine(params: { lotFolder: string } & KeepLineSpec): KeepLine {
	const line = keepLineOf(params)
	appendFileSync(keepFileOf(params.lotFolder), `${JSON.stringify(line)}\n`)
	return line
}

/** Writes the lot folder's `keep.jsonl` as the whole document `text` (lines that do not read included). */
export function writeKeepDocument(params: { lotFolder: string; text: string }): void {
	writeRecordFile({ folder: params.lotFolder, name: STORE_FILES.keep, text: params.text })
}

/** A folder where the lot's `keep.jsonl` would be: the file cannot be read (`EISDIR`). */
export function makeKeepFolder(params: { lotFolder: string }): void {
	mkdirSync(keepFileOf(params.lotFolder), { recursive: true })
}

/** The text of the lot folder's `keep.jsonl`; undefined when there is none. */
export function keepTextOf(lotFolder: string): string | undefined {
	const file = keepFileOf(lotFolder)
	return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

/** The text every reader shows for a kept lot: `kept by decision: <why> (by <who>, <day>)`. */
export function keptTextOf(spec: KeepLineSpec = {}): string {
	const line = keepLineOf(spec)
	return `kept by decision: ${line.reason} (by ${line.by}, ${line.at.slice(0, 10)})`
}

/** The keep a JSON output carries for a kept lot: `{ reason, by, at }`. */
export function keptJsonOf(spec: KeepLineSpec = {}): { reason: string; by: string; at: string } {
	const line = keepLineOf(spec)
	return { reason: line.reason, by: line.by, at: line.at }
}

/** The `lot unkeep` command a kept lot's next names. */
export function unkeepNextOf(name: string): string {
	return UNKEEP_NEXT.replace('{name}', name)
}

/** The text a lot damaged at the move is kept with (`keptByDecisionOf`). */
export function damagedTextOf(params: { name: string; damage: string }): string {
	return `kept: lot ${params.name} damaged (${params.damage})`
}

/** The text a lot whose folder left the store is kept with (`keptByDecisionOf`). */
export function goneTextOf(name: string): string {
	return `kept: lot ${name} no longer in the store`
}

/**
 * The lot made damaged by hand: one more transition file, a whole document whose time the store never writes (the
 * last transition's fields otherwise). Its readers' reason.
 */
export function damageLot(params: { lotFolder: string }): string {
	const folder = join(params.lotFolder, 'transitions')
	const [last] = readdirSync(folder)
		.filter((name) => /^\d+\.json$/.test(name))
		.sort()
		.reverse()
	if (last === undefined) throw new Error(`no transition in ${params.lotFolder}`)
	const seq = Number(basename(last, '.json')) + 1
	const transition = JSON.parse(readFileSync(join(folder, last), 'utf8')) as Record<string, unknown>
	writeRecordFile({
		folder,
		name: `${String(seq).padStart(6, '0')}.json`,
		text: `${JSON.stringify({ ...transition, seq, at: 'yesterday' })}\n`,
	})
	return TRANSITION_DAMAGE
}

/** The lot's `keep.changed` events: their op, reason and lot. */
export function keepEventsOf(lotFolder: string): { op: unknown; reason: unknown; lot: unknown }[] {
	const path = join(lotFolder, 'events.jsonl')
	if (!existsSync(path)) return []
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.kind === 'keep.changed')
		.map((event) => ({ op: event.op, reason: event.reason, lot: event.lot }))
}

/** `lot <verb> <words>` run from `cwd` at the cases' time. */
export function keepVerb(params: { cwd: string; verb: string; words: string[] }): CommandResult {
	return runLot({ cwd: params.cwd, argv: [params.verb, ...params.words], now: KEEP_VERB_NOW })
}

/** The JSON an output holds; `{ notJson: <output> }` when it holds none (a usage, a refusal in words). */
export function jsonOrText(output: string): unknown {
	try {
		return JSON.parse(output) as unknown
	} catch {
		return { notJson: output }
	}
}

/** `--by <signer> --reason <why>`: the signature of a keep verb. */
export function signedBy(params: { by?: string; reason?: string } = {}): string[] {
	return ['--by', params.by ?? KEEP_BY, '--reason', params.reason ?? KEEP_REASON]
}

/**
 * The items of a `worktree prune --json` plan, keyed `<kind> <name>` (a worktree by its folder name): the reason it is
 * kept, or the command it is offered for.
 */
export function worktreePruneItemsOf(result: CommandResult): WorktreePruneItems {
	const plan = JSON.parse(result.output) as {
		repositories: { items: { kind: string; name: string; kept?: string; command?: string }[] }[]
	}
	return Object.fromEntries(
		plan.repositories
			.flatMap((repository) => repository.items)
			.map((item) => [
				`${item.kind} ${item.kind === 'branch' ? item.name : basename(item.name)}`,
				item.kept ?? item.command ?? '',
			]),
	)
}
