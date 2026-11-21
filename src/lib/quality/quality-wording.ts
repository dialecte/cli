/**
 * How the base-aware findings and notes are worded, the same in `rules`, on the card and in the pull request body;
 * which docs entries are findings at a source line. Pure: no file, git or process read here.
 */
import { QUALITY_MESSAGES, QUALITY_NOTES } from './quality.constants.ts'

import type {
	DocsNotUpdated,
	DuplicateRead,
	QualityResult,
	SharedExportChange,
} from './quality.types.ts'

/**
 * The notes under the quality line: each removed public entry a page still names (no source line to sit on, the fix
 * is the page), an unknown public API (the docs rule did not run), aliases read in the tree for the base edges.
 *
 * @intent word the notes of a base-aware run the same way wherever they are shown
 * @internal
 */
export function qualityNotesOf(
	result: Pick<QualityResult, 'docs' | 'publicApi' | 'aliasesChanged'>,
): string[] {
	const { publicApi } = result
	return [
		...result.docs
			.filter((docs) => docs.change === 'removed')
			.map((docs) =>
				QUALITY_NOTES.removed
					.replace('{route}', () => docs.route)
					.replace('{pages}', () => docs.pages.join(', ')),
			),
		...(publicApi.kind === 'unknown'
			? [QUALITY_NOTES.unknown.replace('{why}', () => publicApi.why)]
			: []),
		...(result.aliasesChanged ? [QUALITY_NOTES.aliases] : []),
	]
}

/**
 * The message of a `duplicate-read` finding, as `rules` prints it.
 *
 * @intent word a duplicate read the same way wherever it is shown
 * @internal
 */
export function duplicateMessageOf(duplicate: DuplicateRead): string {
	return QUALITY_MESSAGES.duplicateRead
		.replace('{name}', () => duplicate.name)
		.replace('{existing}', () => duplicate.existing.name)
		.replace('{at}', () => `${duplicate.existing.file}:${duplicate.existing.line}`)
}

// dialecte-allow duplicate-read: words one finding the rule found; findSharedExportChanges finds them
/**
 * The message of a `shared-export-changed` finding, as `rules` prints it.
 *
 * @intent word a shared export change the same way wherever it is shown
 * @internal
 */
export function sharedExportMessageOf(shared: SharedExportChange): string {
	return QUALITY_MESSAGES.sharedExport
		.replace('{name}', () => shared.name)
		.replace('{folder}', () => shared.folder)
		.replace('{importers}', () => shared.importers.join(', '))
		.replace('{changes}', () => shared.changes.join(', '))
}

/**
 * The message of a `docs-not-updated` finding, as `rules` prints it.
 *
 * @intent word a public export left without docs the same way wherever it is shown
 * @internal
 */
export function docsMessageOf(docs: DocsNotUpdated): string {
	return QUALITY_MESSAGES.docs
		.replace('{route}', () => docs.route)
		.replace('{change}', () => docs.change)
		.replace('{pages}', () => (docs.pages.length ? docs.pages.join(', ') : QUALITY_MESSAGES.noPage))
}

/**
 * Whether a `docs-not-updated` entry is a finding at a source line: never a removed entry (a note: its declaration is
 * gone, the fix is the page), nor one with no `declaredAt` of the `<file>:<line>` form (nowhere to sit or opt out).
 *
 * @intent tell a docs finding the card and the body list from an entry only noted or kept in the record
 * @internal
 */
export function isDocsFinding(docs: DocsNotUpdated): boolean {
	return docs.change !== 'removed' && declaredPlaceOf(docs.declaredAt) !== undefined
}

/**
 * `src/x.ts:4` (a public entry's `declaredAt`) as a file and a line; undefined when absent or not of that form.
 *
 * @intent read where a public entry is declared
 * @internal
 */
export function declaredPlaceOf(
	declaredAt: string | undefined,
): { file: string; line: number } | undefined {
	const match = declaredAt === undefined ? null : /^(?<file>.+):(?<line>\d+)$/.exec(declaredAt)
	if (match?.groups === undefined) return undefined
	return { file: match.groups.file ?? '', line: Number(match.groups.line) }
}
