/**
 * `dialecte lot brief <id> --from <brief.json> --by <who> --reason <text>`: a started lot's public text rewritten - the
 * summary, the issue, step titles and behaviours, each lot's commit message, which its change request shows - and nothing
 * else (scope, the steps' and lots' count and order, specs, a lot's paths, branch, plan... stay as started). The new brief passes the start's field and
 * public-text checks; it replaces the stored one whole, and a `brief` transition records the old and new hashes, who
 * and why, the lot's state and position kept.
 */
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { stableJson } from '../lib/stable-json.ts'
import { briefTextFaults, checkBriefFields } from '../lib/store/brief.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { folderPlanEntryIds } from '../lib/store/public-text.ts'
import { replaceWhole } from '../lib/store/publish.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { NEXT_BRIEF_SUFFIX, STORE_FILES } from '../lib/store/store.constants.ts'
import { appendTransition } from '../lib/store/transitions.ts'
import {
	LOT_BRIEF_LINES,
	LOT_BRIEF_VALUE_OPTIONS,
	PUBLIC_LIST_FIELDS,
	PUBLIC_TEXT_FIELDS,
} from './lot-brief.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'

export function runLotBrief(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	// read as every signing verb reads its line: the last value wins, every word after `--` is no option
	const read = readArguments({ argv: params.argv, valueOptions: LOT_BRIEF_VALUE_OPTIONS })
	if (typeof read === 'string') return { exitCode: 2, output: renderLotUsage() }
	const ids = read.words
	const [from, by, reason] = LOT_BRIEF_VALUE_OPTIONS.map((name) => read.values.get(name))
	if (ids.length !== 1 || !from || !by || !reason) return { exitCode: 2, output: renderLotUsage() }
	const required = requiredLotOf({ argument: ids[0], cwd: params.cwd, mode: 'write' })
	if (!('lot' in required)) return { exitCode: 2, output: textOf(required.lines) }
	const lotFolder = required.lot
	const lot = basename(lotFolder)
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined || !('input' in checked))
		return refused(LOT_BRIEF_LINES.damaged.replaceAll('{lot}', () => lot))
	if (checked.input.identity.simulated)
		return refused(LOT_BRIEF_LINES.simulated.replace('{lot}', () => lot))
	const { state } = lotState(checked.input)
	if (state !== 'working' && state !== 'ready')
		return refused(LOT_BRIEF_LINES.notWorking.replace('{lot}', () => lot).replace('{state}', state))
	const briefPath = join(lotFolder, STORE_FILES.brief)
	const oldText = readFileSync(briefPath, 'utf8')
	const newText = readTextOf(resolve(params.cwd, from))
	if (newText === undefined)
		return refused(LOT_BRIEF_LINES.unreadable.replace('{path}', () => from))
	const parsed = parsedOf(newText)
	if (parsed === undefined) return refused(LOT_BRIEF_LINES.unread.replace('{path}', () => from))
	const fault = briefFaultLine({
		old: JSON.parse(oldText) as unknown,
		next: parsed,
		root: checked.input.identity.repository,
		lotFolder,
	})
	if (fault !== undefined) return refused(fault)
	const changed = publicFieldsChanged({ old: JSON.parse(oldText) as unknown, next: parsed })
	if (changed.length === 0)
		return { exitCode: 0, output: textOf([LOT_BRIEF_LINES.unchanged.replace('{lot}', () => lot)]) }
	const unwritten = writeBrief({
		lotFolder,
		briefPath,
		by,
		reason,
		oldText,
		newText,
		now: params.now ?? new Date(),
	})
	if (unwritten !== undefined)
		return refused(LOT_BRIEF_LINES.transitionUnwritten.replace('{reason}', () => unwritten))
	return {
		exitCode: 0,
		output: textOf([
			LOT_BRIEF_LINES.rewritten
				.replace('{lot}', () => lot)
				.replace('{fields}', () => changed.join(', '))
				.replace('{by}', () => by),
		]),
	}
}

/**
 * Why the new brief is refused: a field only the start sets changed, a field check, or a public-text check of the
 * start (`briefTextFaults`); undefined when it passes.
 */
function briefFaultLine(params: {
	old: unknown
	next: Record<string, unknown>
	root: string
	lotFolder: string
}): string | undefined {
	const fixed = fixedFieldChanged({ old: params.old, next: params.next })
	if (fixed !== undefined) return LOT_BRIEF_LINES.fixedField.replace('{field}', () => fixed)
	const fields = checkBriefFields({ value: params.next })
	const faults =
		fields.brief === undefined
			? fields.refused
			: briefTextFaults({
					brief: fields.brief,
					root: params.root,
					ids: folderPlanEntryIds({ folder: params.lotFolder }),
				})
	const [first] = faults
	if (first === undefined) return undefined
	return LOT_BRIEF_LINES.refused.replace('{detail}', () =>
		first.detail.startsWith(first.field) ? first.detail : `${first.field}: ${first.detail}`,
	)
}

/**
 * The new brief written beside the stored one (`brief.json.next`), its transition appended, then moved into place:
 * a kill between the two leaves the old brief and a pending next one, which the damage check reads as consistent (the
 * next verb's write replaces it). A transition that cannot be written takes the next brief back: nothing changed. The
 * reason it could not be written; undefined once written.
 */
function writeBrief(params: {
	lotFolder: string
	briefPath: string
	by: string
	reason: string
	oldText: string
	newText: string
	now: Date
}): string | undefined {
	const nextPath = `${params.briefPath}${NEXT_BRIEF_SUFFIX}`
	writeFileSync(nextPath, params.newText)
	try {
		recordBriefTransition(params)
	} catch (error) {
		rmSync(nextPath, { force: true })
		return (error as Error).message
	}
	replaceWhole({ path: params.briefPath, text: params.newText })
	rmSync(nextPath, { force: true })
	return undefined
}

/** The `brief` transition: the last one's state and position kept, the old and new hashes, who and why. */
function recordBriefTransition(params: {
	lotFolder: string
	by: string
	reason: string
	oldText: string
	newText: string
	now: Date
}): void {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	appendTransition({
		lotFolder: params.lotFolder,
		next: function briefTransition({ last }) {
			return {
				at: params.now.toISOString(),
				lot: identity?.name ?? '',
				state: last?.state ?? 'working',
				position: last?.position ?? { step: 0, of: 0, station: null, round: null },
				cause: { kind: 'brief', by: params.by, reason: params.reason },
				question: null,
				simulated: identity?.simulated ?? false,
				brief: { from: sha256(params.oldText), to: sha256(params.newText) },
			}
		},
	})
}

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** The text of the file at `path`; undefined when it cannot be read. */
function readTextOf(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

function parsedOf(text: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(text)
		return value !== null && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: undefined
	} catch {
		return undefined
	}
}

/**
 * The first field the new brief changes that only the start sets: any top-level field but the public ones, then a
 * public list's length, then an item's field but its public ones; undefined when it changes none.
 */
function fixedFieldChanged(params: {
	old: unknown
	next: Record<string, unknown>
}): string | undefined {
	const old = (params.old ?? {}) as Record<string, unknown>
	const publicKeys = [...PUBLIC_TEXT_FIELDS, ...Object.keys(PUBLIC_LIST_FIELDS)]
	const keys = [...new Set([...Object.keys(old), ...Object.keys(params.next)])]
	const top = keys.find(
		(key) => !publicKeys.includes(key) && stableJson(old[key]) !== stableJson(params.next[key]),
	)
	if (top !== undefined) return top
	for (const [list, fields] of Object.entries(PUBLIC_LIST_FIELDS)) {
		const before = itemsOf(old[list])
		const after = itemsOf(params.next[list])
		if (before.length !== after.length) return list
		for (const [index, item] of before.entries()) {
			const next = after[index] ?? {}
			const field = [...new Set([...Object.keys(item), ...Object.keys(next)])].find(
				(key) => !fields.includes(key) && stableJson(item[key]) !== stableJson(next[key]),
			)
			if (field !== undefined) return `${list}[${index}].${field}`
		}
	}
	return undefined
}

/** The public fields the new brief changes, as their refusals would name them: the text fields, then each list's. */
function publicFieldsChanged(params: { old: unknown; next: Record<string, unknown> }): string[] {
	const old = (params.old ?? {}) as Record<string, unknown>
	const top = PUBLIC_TEXT_FIELDS.filter(
		(key) => stableJson(old[key]) !== stableJson(params.next[key]),
	)
	const lists = Object.entries(PUBLIC_LIST_FIELDS).flatMap(function listFields([list, fields]) {
		const after = itemsOf(params.next[list])
		return itemsOf(old[list]).flatMap((item, index) =>
			fields.flatMap((field) =>
				fieldChanges({
					path: `${list}[${index}].${field}`,
					before: item[field],
					after: after[index]?.[field],
				}),
			),
		)
	})
	return [...top, ...lists]
}

// dialecte-allow duplicate-read: it compares one public field's values, the callers walk the brief's fields
/** How a public field changed: a list field per element when its length holds, else the field whole; [] unchanged. */
function fieldChanges(params: { path: string; before: unknown; after: unknown }): string[] {
	const { path, before, after } = params
	if (Array.isArray(before) && Array.isArray(after) && before.length === after.length)
		return before.flatMap((value: unknown, index) =>
			stableJson(value) === stableJson(after[index]) ? [] : [`${path}[${index}]`],
		)
	return stableJson(before) === stableJson(after) ? [] : [path]
}

/** The items of a brief list, each an object (a malformed one read as empty). */
function itemsOf(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.map((item: unknown) =>
				item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {},
			)
		: []
}

function refused(line: string): CommandResult {
	return { exitCode: 1, output: textOf([line]) }
}
