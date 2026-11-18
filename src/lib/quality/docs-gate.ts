/**
 * `docs-not-updated`: a public entry the change adds, re-signs or removes whose doc pages the change did not touch.
 * Contributor packages with a runtime API only: a tool's pages are generated and checked fresh by `doc:check`.
 */
import { CONTRIBUTOR_PROFILE, ROUTE_NAMING_SEGMENTS, ROUTE_SEPARATOR } from './quality.constants.ts'

import type { ApiEntryChange } from '../risk/risk.types.ts'
import type { DocPage, DocsNotUpdated } from './quality.types.ts'

/**
 * Whether the docs gate judges the package: a contributor's package that is no tool (no `bin`).
 *
 * @intent tell which packages must keep their doc pages in step with their public API
 * @internal
 */
export function docsGateApplies(params: { profile: string | undefined; tool: boolean }): boolean {
	return params.profile === CONTRIBUTOR_PROFILE && !params.tool
}

/**
 * The entries of `entries` whose pages the change left behind: an added entry no touched page names (none naming it
 * at all included); a re-signed entry pages name, none touched; a removed entry a page still names. A page names an
 * entry by its route's last two segments as a whole word (`info.of`), or by its full route in a code span.
 *
 * @intent ask for the doc page a public API change needs
 * @internal
 */
export function findDocsNotUpdated(params: {
	entries: readonly ApiEntryChange[]
	pages: readonly DocPage[]
}): DocsNotUpdated[] {
	return params.entries.flatMap(function findingOf(entry): DocsNotUpdated[] {
		const naming = params.pages.filter((page) => namesRoute({ text: page.text, route: entry.path }))
		const fires =
			entry.change === 'added'
				? !naming.some((page) => page.touched)
				: entry.change === 'signature'
					? naming.length > 0 && !naming.some((page) => page.touched)
					: naming.length > 0
		if (!fires) return []
		return [
			{
				route: entry.path,
				change: entry.change,
				...(entry.declaredAt !== undefined && { declaredAt: entry.declaredAt }),
				pages: naming
					.filter((page) => entry.change === 'removed' || !page.touched)
					.map((page) => page.path),
			},
		]
	})
}

/** Whether `text` names `route`: its last two segments as a whole word, or the full route in a code span. */
function namesRoute(params: { text: string; route: string }): boolean {
	const segments = params.route.split(ROUTE_SEPARATOR)
	const short = segments.slice(-ROUTE_NAMING_SEGMENTS).join(ROUTE_SEPARATOR)
	const shortPattern = new RegExp(`(?<![\\w.])${escapedOf(short)}(?![\\w])`)
	return shortPattern.test(params.text) || params.text.includes(`\`${params.route}\``)
}

/** `text` with every regular-expression character escaped. */
function escapedOf(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
