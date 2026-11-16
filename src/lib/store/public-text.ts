/**
 * The check of a text a public record holds (a brief's summary, a verify's `--by`, the free words a review row
 * copies): no path or link, no reference a committed text never holds - every generic pattern (none allowed, a tag
 * included), those the repository's package declares, a contributor's consumer names, the machine's forbidden words -
 * and no entry id of the plans that hold the lot.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { readPlanBlock } from '../plan/plan-block.ts'
import { listMarkedPlans } from '../plan/plan-marks.ts'
import { GENERIC_REFERENCE_PATTERNS } from '../rules/committed-text.constants.ts'
import { findReferences, readListedPatterns } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import {
	PATH_OR_LINK_LABEL,
	PATH_OR_LINK_PATTERN,
	PLAN_ENTRY_ID_LABEL,
	WORD_PART_SEPARATOR,
	WORD_PATTERN,
} from './public-text.constants.ts'
import { STORE_FILES } from './store.constants.ts'

import type { ReferencePattern } from '../rules/committed-text.types.ts'

/** Whether the text holds a path or a link. */
export function holdsPathOrLink(text: string): boolean {
	return PATH_OR_LINK_PATTERN.test(text)
}

/**
 * The label of the first reference of `root`'s lists the text holds; undefined when it holds none. Throws when the
 * package's lists or the machine's forbidden words cannot be read.
 */
export function referenceLabelIn(params: { text: string; root: string }): string | undefined {
	const patterns = [
		...GENERIC_REFERENCE_PATTERNS,
		...readListedPatterns(params.root),
		...forbiddenWordPatterns(readForbiddenWords({ root: params.root })),
	]
	return findReferences({ text: params.text, patterns })[0]?.label
}

/**
 * The label of what the text holds that a public record never holds: a path or a link first, then a reference of
 * `root`'s lists, then one of the plan entry `ids`. Throws when the lists cannot be read.
 */
export function publicTextLabel(params: {
	text: string
	root: string
	ids?: ReadonlySet<string>
}): string | undefined {
	if (holdsPathOrLink(params.text)) return PATH_OR_LINK_LABEL
	const reference = referenceLabelIn(params)
	if (reference !== undefined) return reference
	return params.ids !== undefined && holdsPlanEntryId({ text: params.text, ids: params.ids })
		? PLAN_ENTRY_ID_LABEL
		: undefined
}

/**
 * Whether a word may reach a public record, every list read once for all the words asked: no path, link, reference
 * or plan entry id; with no `root`, the generic references only. When a list cannot be read, no word may: a word
 * the check cannot clear is left out, never guessed.
 */
export function publicWordTestOf(params: {
	root: string | undefined
	ids: ReadonlySet<string>
}): (text: string) => boolean {
	let patterns: ReferencePattern[]
	try {
		patterns =
			params.root === undefined
				? [...GENERIC_REFERENCE_PATTERNS]
				: [
						...GENERIC_REFERENCE_PATTERNS,
						...readListedPatterns(params.root),
						...forbiddenWordPatterns(readForbiddenWords({ root: params.root })),
					]
	} catch {
		return function noWord() {
			return false
		}
	}
	return function isPublicWord(text) {
		return (
			!holdsPathOrLink(text) &&
			findReferences({ text, patterns }).length === 0 &&
			!holdsPlanEntryId({ text, ids: params.ids })
		)
	}
}

/**
 * The entry ids of the plans that hold a lot: the plan at `planPath` when its block reads (the brief's own plan), and
 * every plan marked on this machine one of whose entries matches `branch` - the plan whose lot block holds the lot,
 * when the brief names a lot-local plan. A plan whose block cannot be read names none.
 */
export function lotPlanEntryIds(params: {
	planPath: string | undefined
	branch: string | undefined
}): ReadonlySet<string> {
	const ids = new Set<string>()
	const own = params.planPath === undefined ? undefined : realPathOf(params.planPath)
	const plans = [...(own === undefined ? [] : [own]), ...listMarkedPlans()]
	for (const planPath of new Set(plans)) {
		const read = readPlanBlock({ planPath })
		if ('faults' in read) continue
		const { lots } = read.block
		const holdsLot =
			planPath === own ||
			lots.some(function isOfBranch(entry) {
				return params.branch !== undefined && entry.match?.branch === params.branch
			})
		if (holdsLot) for (const entry of lots) ids.add(entry.id)
	}
	return ids
}

/**
 * The entry ids of the plans that hold the lot of a store or hand-over folder: its stored plan and its brief's
 * branch (`lotPlanEntryIds`); none for what the folder does not hold.
 */
export function folderPlanEntryIds(params: { folder: string }): ReadonlySet<string> {
	const planPath = join(params.folder, STORE_FILES.plan)
	return lotPlanEntryIds({
		planPath: existsSync(planPath) ? planPath : undefined,
		branch: briefBranchOf(join(params.folder, STORE_FILES.brief)),
	})
}

/**
 * Whether the text holds one of the plan entry `ids` as a word, or as a part of a word split at `-` (`ci2a-lot`):
 * case-insensitive, except for a one-character id, matched as written (a lone `t` of prose is no entry `T`).
 */
export function holdsPlanEntryId(params: { text: string; ids: ReadonlySet<string> }): boolean {
	if (params.ids.size === 0) return false
	const words = (params.text.match(WORD_PATTERN) ?? []).flatMap(function wordAndParts(word) {
		return [word, ...word.split(WORD_PART_SEPARATOR)]
	})
	return [...params.ids].some(function isHeld(id) {
		return id.length === 1
			? words.includes(id)
			: words.some(function isId(word) {
					return word.toLowerCase() === id.toLowerCase()
				})
	})
}

/** The branch of the brief at `path`; undefined when it does not read or names none. */
function briefBranchOf(path: string): string | undefined {
	try {
		const brief: unknown = JSON.parse(readFileSync(path, 'utf8'))
		const branch = (brief as { branch?: unknown } | null)?.branch
		return typeof branch === 'string' ? branch : undefined
	} catch {
		return undefined
	}
}
