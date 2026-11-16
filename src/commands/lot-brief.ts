/**
 * `dialecte lot brief <id> --from <brief.json> --by <who> --reason <text>`: a started lot's public text rewritten - the
 * summary, the issue, step titles and behaviours, which its pull request shows - and nothing else (scope, steps' count
 * and order, specs, commit lots, branch, plan... stay as started). The new brief passes the start's field and
 * public-text checks; it replaces the stored one whole, and a `brief` transition records the old and new hashes, who
 * and why, the lot's state and position kept.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { getArg, positionalArguments } from '../lib/config.ts'
import { textOf } from '../lib/print/print.ts'
import { stableJson } from '../lib/stable-json.ts'
import { briefTextFaults, checkBriefFields } from '../lib/store/brief.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { folderPlanEntryIds } from '../lib/store/public-text.ts'
import { replaceWhole } from '../lib/store/publish.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { appendTransition } from '../lib/store/transitions.ts'
import {
	LOT_BRIEF_LINES,
	LOT_BRIEF_VALUE_OPTIONS,
	PUBLIC_BRIEF_FIELDS,
	PUBLIC_STEP_FIELDS,
} from './lot-brief.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'

export function runLotBrief(params: { cwd: string; argv: string[]; now?: Date }): CommandResult {
	const ids = positionalArguments({ argv: params.argv, valueOptions: LOT_BRIEF_VALUE_OPTIONS })
	const [from, by, reason] = LOT_BRIEF_VALUE_OPTIONS.map((name) => getArg(params.argv, name))
	if (ids.length !== 1 || !from || !by || !reason) return { exitCode: 2, output: renderLotUsage() }
	const required = requiredLotOf({ argument: ids[0], cwd: params.cwd, mode: 'write' })
	if (!('lot' in required)) return { exitCode: 2, output: textOf(required.lines) }
	const lotFolder = required.lot
	const lot = lotFolder.split(/[\\/]/).at(-1) ?? ids[0]
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined || !('input' in checked))
		return refused(LOT_BRIEF_LINES.damaged.replaceAll('{lot}', () => lot))
	const { state } = lotState(checked.input)
	if (state !== 'working' && state !== 'ready')
		return refused(LOT_BRIEF_LINES.notWorking.replace('{lot}', () => lot).replace('{state}', state))
	const briefPath = join(lotFolder, STORE_FILES.brief)
	const oldText = readFileSync(briefPath, 'utf8')
	const newText = readFileSync(from, 'utf8')
	const parsed = parsedOf(newText)
	if (parsed === undefined) return refused(LOT_BRIEF_LINES.unread.replace('{path}', () => from))
	const fixed = fixedFieldChanged({ old: JSON.parse(oldText) as unknown, next: parsed })
	if (fixed !== undefined) return refused(LOT_BRIEF_LINES.fixedField.replace('{field}', fixed))
	const fields = checkBriefFields({ value: parsed })
	const faults =
		fields.brief === undefined
			? fields.refused
			: briefTextFaults({
					brief: fields.brief,
					root: checked.input.identity.repository,
					ids: folderPlanEntryIds({ folder: lotFolder }),
				})
	if (faults.length > 0)
		return refused(
			LOT_BRIEF_LINES.refused.replace('{detail}', () =>
				faults[0].detail.startsWith(faults[0].field)
					? faults[0].detail
					: `${faults[0].field}: ${faults[0].detail}`,
			),
		)
	if (newText === oldText)
		return { exitCode: 0, output: textOf([LOT_BRIEF_LINES.unchanged.replace('{lot}', () => lot)]) }
	replaceWhole({ path: briefPath, text: newText })
	recordBriefTransition({ lotFolder, by, reason, oldText, newText, now: params.now ?? new Date() })
	const changed = publicFieldsChanged({ old: JSON.parse(oldText) as unknown, next: parsed })
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
 * The first field the new brief changes that only the start sets: any top-level field but the public ones, then the
 * number of steps, then a step's field but its title and behaviours; undefined when it changes none.
 */
function fixedFieldChanged(params: {
	old: unknown
	next: Record<string, unknown>
}): string | undefined {
	const old = (params.old ?? {}) as Record<string, unknown>
	const keys = [...new Set([...Object.keys(old), ...Object.keys(params.next)])]
	const top = keys.find(
		(key) =>
			!PUBLIC_BRIEF_FIELDS.includes(key) && stableJson(old[key]) !== stableJson(params.next[key]),
	)
	if (top !== undefined) return top
	const oldSteps = Array.isArray(old.steps) ? old.steps : []
	const newSteps = Array.isArray(params.next.steps) ? params.next.steps : []
	if (oldSteps.length !== newSteps.length) return 'steps'
	for (const [index, step] of oldSteps.entries()) {
		const before = (step ?? {}) as Record<string, unknown>
		const after = (newSteps[index] ?? {}) as Record<string, unknown>
		const field = [...new Set([...Object.keys(before), ...Object.keys(after)])].find(
			(key) =>
				!PUBLIC_STEP_FIELDS.includes(key) && stableJson(before[key]) !== stableJson(after[key]),
		)
		if (field !== undefined) return `steps[${index}].${field}`
	}
	return undefined
}

/** The public fields the new brief changes, as their refusals would name them. */
function publicFieldsChanged(params: { old: unknown; next: Record<string, unknown> }): string[] {
	const old = (params.old ?? {}) as Record<string, unknown>
	const top = ['summary', 'issue'].filter(
		(key) => stableJson(old[key]) !== stableJson(params.next[key]),
	)
	const oldSteps = (Array.isArray(old.steps) ? old.steps : []) as Record<string, unknown>[]
	const newSteps = (params.next.steps ?? []) as Record<string, unknown>[]
	const steps = oldSteps.flatMap(function stepFields(step, index) {
		const after = newSteps[index] ?? {}
		const title = step.title === after.title ? [] : [`steps[${index}].title`]
		const before = Array.isArray(step.behaviours) ? (step.behaviours as unknown[]) : []
		const now = Array.isArray(after.behaviours) ? (after.behaviours as unknown[]) : []
		const behaviours =
			before.length === now.length
				? before.flatMap((text, behaviour) =>
						text === now[behaviour] ? [] : [`steps[${index}].behaviours[${behaviour}]`],
					)
				: [`steps[${index}].behaviours`]
		return [...title, ...behaviours]
	})
	return [...top, ...steps]
}

function refused(line: string): CommandResult {
	return { exitCode: 1, output: textOf([line]) }
}
