/**
 * A store lot's design need and standing (DESIGN-GATE sections 1-2), from its records: the plan entry it carries out,
 * its effective scope, the shared areas it is held to (given by the caller: a view's, read from files only, or a
 * refusing verb's, read through git), its `design.jsonl` and its recorded file as it is now. No process here.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readPlanBlock } from '../plan/plan-block.ts'
import { readLotScope } from '../store/lot-records.ts'
import { readPlanEntry } from '../store/plan-entry.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { viewDeclaredHighOf } from './declared-sources.ts'
import { designNeedOf } from './design-need.ts'
import { readDesignLines, sourceHashOf } from './design-records.ts'
import { designStateOf } from './design-state.ts'
import { DESIGN_SPEC_ENTRY_KINDS } from './design.constants.ts'

import type { PlanEntry } from '../plan/plan-block.types.ts'
import type { LotPlanEntry } from '../store/plan-entry.types.ts'
import type {
	DesignLine,
	DesignNeed,
	DesignRecordedLine,
	DesignStanding,
	HeldPlanEntry,
} from './design.types.ts'

/**
 * The lot's need: its plan entry's kind, its effective scope and `paths` (a commit's, when given), against the shared
 * areas `declaredHigh` it is held to.
 *
 * @intent decide from a lot's records whether it needs a design
 * @internal
 */
export function lotDesignNeedOf(params: {
	lotFolder: string
	declaredHigh: readonly string[]
	paths?: readonly string[]
}): DesignNeed {
	const { lotFolder } = params
	return designNeedOf({
		entryKind: lotPlanEntryOf({ lotFolder })?.entry.kind,
		declaredHigh: params.declaredHigh,
		paths: [...readLotScope({ lotFolder }), ...(params.paths ?? [])],
	})
}

/**
 * The lot's design standing now, against the shared areas `declaredHigh` it is held to.
 *
 * @intent tell from a lot's records whether its design lets it go on
 * @internal
 */
export function lotDesignStandingOf(params: {
	lotFolder: string
	declaredHigh: readonly string[]
	paths?: readonly string[]
}): DesignStanding {
	const lines = readDesignLines(params)
	const last = lines.filter(isRecorded).at(-1)
	return designStateOf({
		need: lotDesignNeedOf(params),
		lines,
		source: last === undefined ? undefined : sourceHashOf(last.file),
	})
}

/**
 * The lot's design standing when a view shows it, held to the view's shared areas (files only): the lot needs a design
 * or recorded anything about it; undefined for a lot that needs none and recorded none (no line).
 *
 * @intent tell whether a view names a lot's design, and how it stands
 * @internal
 */
export function shownDesignStandingOf(params: { lotFolder: string }): DesignStanding | undefined {
	const standing = lotDesignStandingOf({
		lotFolder: params.lotFolder,
		declaredHigh: viewDeclaredHighOf(params),
	})
	if (standing.state === 'not-required' && !existsSync(join(params.lotFolder, STORE_FILES.design)))
		return undefined
	return standing
}

/**
 * The plan entry the lot carries out, read from its `plan-entry.json` and that plan's block, and how many `lot` or
 * `fix` entries of the block name the same spec; undefined when the lot names none or the block does not read.
 *
 * @intent find the plan entry, and its spec, a lot carries out
 * @internal
 */
export function lotPlanEntryOf(params: { lotFolder: string }): HeldPlanEntry | undefined {
	const recorded = readPlanEntry({ folder: params.lotFolder })
	return recorded === undefined ? undefined : heldPlanEntryOf(recorded)
}

/**
 * A plan entry as its plan's block holds it, and how many `lot` or `fix` entries of the block name its spec;
 * undefined when the block does not read or holds no such entry.
 *
 * @intent read a plan entry's kind and spec from its plan
 * @internal
 */
export function heldPlanEntryOf(recorded: LotPlanEntry): HeldPlanEntry | undefined {
	const read = readPlanBlock({ planPath: recorded.plan })
	if ('faults' in read) return undefined
	const entry = read.block.lots.find(function isRecordedEntry(candidate) {
		return candidate.id === recorded.id
	})
	if (entry === undefined) return undefined
	const sharing = read.block.lots.filter(function namesTheSpec(candidate: PlanEntry) {
		return (
			entry.spec !== undefined &&
			candidate.spec === entry.spec &&
			DESIGN_SPEC_ENTRY_KINDS.includes(candidate.kind)
		)
	}).length
	return { entry, sharing }
}

function isRecorded(line: DesignLine): line is DesignRecordedLine {
	return line.kind === 'recorded'
}
