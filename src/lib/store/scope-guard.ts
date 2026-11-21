/**
 * The scope guard (SAFE 3.2): the paths a lot's work holds that its effective scope does not cover, read fail-closed
 * (`lotScopeOf`), the store's `.dialecte/` records left out; the refusal names every such path and the add to run.
 */
import { basename } from 'node:path'

import { STATE_EXCLUDED_PATTERN } from '../gate-records/gate-records.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { shellQuote } from '../shell-quote.ts'
import { literalPartOf } from './brief-scope.ts'
import {
	briefEntriesOf,
	lotScopeOf,
	readCheckedLotState,
	registryOfLotFolder,
} from './lot-records.ts'
import { isCoveredBy } from './scope-changes.ts'
import { SCOPE_GUARD_TEXTS, SCOPE_REFUSAL_LINES } from './scope-guard.constants.ts'
import { LOT_SESSION_SIGNER } from './signer-rules.constants.ts'
import { RECORD_DAMAGE_REASONS } from './store.constants.ts'

import type { ScopeGuard, ScopeRefusal } from './scope-guard.types.ts'

/** The paths no entry of `scope` covers, `.dialecte/` records left out (no entry can name them), sorted once. Pure. */
export function pathsOutsideScope(params: {
	paths: readonly string[]
	scope: readonly string[]
}): string[] {
	const { scope } = params
	return heldPathsOf(params.paths).filter(
		(path) => !scope.some((entry) => isCoveredBy({ path, entry })),
	)
}

/** The paths a scope holds of `paths`: the store's `.dialecte/` records left out, each once, sorted. Pure. */
export function heldPathsOf(paths: readonly string[]): string[] {
	return [...new Set(paths.filter((path) => !STATE_EXCLUDED_PATTERN.test(path)))].sort()
}

/** The lot's guard over `paths`: its refusal, or undefined when every path is covered. */
export function scopeGuardOf(params: { lotFolder: string; paths: readonly string[] }): ScopeGuard {
	const { lotFolder } = params
	const lot = basename(lotFolder)
	const damage = damageOf({ lotFolder })
	if (damage !== undefined)
		return {
			reason: fillMessage({ template: SCOPE_GUARD_TEXTS.damaged, values: { lot, reason: damage } }),
		}
	const scope = lotScopeOf({ lotFolder })
	if (scope.effective === null)
		return {
			reason: fillMessage({
				template: SCOPE_GUARD_TEXTS.unreadable,
				values: { lot, count: String(scope.unreadable ?? 0) },
			}),
		}
	const outside = pathsOutsideScope({ paths: params.paths, scope: scope.effective })
	if (outside.length === 0) return undefined
	return refusalOf({ lot, outside })
}

/** The lines of a refusal outside a gate step (`lot land`, the hand-over guards): its reason, the add, the glob lines. */
export function scopeRefusalLinesOf(refusal: ScopeRefusal): string[] {
	return [
		fillMessage({ template: SCOPE_REFUSAL_LINES.reason, values: { reason: refusal.reason } }),
		...(refusal.next === undefined
			? []
			: [fillMessage({ template: SCOPE_REFUSAL_LINES.next, values: { next: refusal.next } })]),
		...(refusal.globPaths ?? []).map((line) =>
			fillMessage({ template: SCOPE_REFUSAL_LINES.globPath, values: { line } }),
		),
	]
}

/** The refusal naming every outside path: one `--add` per literal path, the glob guidance for the others. */
function refusalOf(params: { lot: string; outside: string[] }): ScopeGuard {
	const { lot, outside } = params
	// an add reads a glob character as a glob: such a path is no literal entry
	const literal = outside.filter((path) => literalPartOf(path) === path)
	const globbed = outside.filter((path) => literalPartOf(path) !== path)
	const reason = fillMessage({
		template: SCOPE_GUARD_TEXTS.outside,
		values: { lot, count: String(outside.length), paths: outside.join(', ') },
	})
	return {
		reason,
		...(literal.length > 0 && {
			next: fillMessage({
				template: SCOPE_GUARD_TEXTS.next,
				values: {
					lot,
					adds: literal.map((path) => `--add ${shellQuote(path)}`).join(' '),
					signer: LOT_SESSION_SIGNER,
				},
			}),
		}),
		...(globbed.length > 0 && {
			globPaths: globbed.map((path) =>
				fillMessage({ template: SCOPE_GUARD_TEXTS.globPath, values: { path } }),
			),
		}),
	}
}

/**
 * Why the lot cannot be held to a scope `lot scope` could fix: its records damaged (the lot reader's check, as
 * `lot scope` makes it), or its brief's scope no list of texts; undefined when it reads.
 */
function damageOf(params: { lotFolder: string }): string | undefined {
	const { lotFolder } = params
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined) return RECORD_DAMAGE_REASONS.identityUnreadable
	if ('damage' in checked) return checked.damage
	return briefEntriesOf({ lotFolder }) === undefined ? SCOPE_GUARD_TEXTS.briefScope : undefined
}
