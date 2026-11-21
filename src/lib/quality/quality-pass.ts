/**
 * The base-aware pass of a `rules` run: the three rules on the change against the quality base, their findings as
 * rule findings, the opt-outs of the files it examined (judged unused there only), and the record of a run that
 * judged the whole change.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { applyAllowComments } from '../rules/allow-comments.ts'
import { BASE_AWARE_RULES } from '../rules/check-code-rules.constants.ts'
import { checkBaseAware } from './check-base-aware.ts'
import { recordQuality } from './quality-record.ts'
import { QUALITY_MESSAGES, QUALITY_NOTES } from './quality.constants.ts'

import type { AllowedCounts } from '../rules/allow-comments.types.ts'
import type { RuleFinding, RuleName } from '../rules/check-code-rules.types.ts'
import type {
	DocsNotUpdated,
	DuplicateRead,
	QualityBase,
	QualityResult,
	RecordedQuality,
	SharedExportChange,
} from './quality.types.ts'

/**
 * The base-aware findings of the change at `root` against `base` (silenced ones counted), on `givenFiles` only when
 * some are given (then nothing is recorded), recorded when `record` holds, each finding with its opt-out.
 *
 * @intent judge the change against its lot base and keep what it found
 * @internal
 */
export function runQualityPass(params: {
	root: string
	base: QualityBase
	givenFiles: readonly string[]
	record: boolean
}): { findings: RuleFinding[]; allowed: AllowedCounts; result: QualityResult; notes: string[] } {
	const { root } = params
	const result = checkBaseAware({ root, base: params.base })
	const judged = applyQualityOptOuts({
		result,
		givenFiles: params.givenFiles,
		ranRules: new Set<RuleName>(BASE_AWARE_RULES),
		readTexts: function diskTextsOf(files) {
			return new Map(
				files.flatMap((file) => {
					const full = join(root, file)
					return existsSync(full) ? [[file, readFileSync(full, 'utf8')] as const] : []
				}),
			)
		},
	})
	if (params.record && !params.givenFiles.length)
		recordQuality({ root, recorded: judged.recorded, allowed: judged.allowed, now: new Date() })
	return {
		findings: judged.findings,
		allowed: judged.allowed,
		result,
		notes: qualityNotesOf(result),
	}
}

/**
 * The findings of `result` once the opt-outs of the files it examined and of the files holding them (their texts from
 * `readTexts`) have silenced what they cover, on `givenFiles` only when some are given; the silenced ones counted, and
 * every finding kept with whether an opt-out silenced it. An opt-out is judged unused only for a rule of `ranRules`.
 * The texts are read in one call of `readTexts` (a file it lacks holds no opt-out).
 *
 * @intent tell which base-aware findings an opt-out silenced, on the worktree or on a commit
 * @internal
 */
export function applyQualityOptOuts(params: {
	result: QualityResult
	givenFiles: readonly string[]
	ranRules: ReadonlySet<RuleName>
	readTexts: (files: readonly string[]) => ReadonlyMap<string, string>
}): { findings: RuleFinding[]; allowed: AllowedCounts; recorded: RecordedQuality } {
	const { result } = params
	const paired = ruleFindingsOf(result)
	const all = [...paired.duplicates, ...paired.sharedExports, ...paired.docs].filter(
		(finding): finding is RuleFinding => finding !== undefined,
	)
	const given = new Set(params.givenFiles)
	const kept = new Set(given.size ? all.filter((finding) => given.has(finding.file)) : all)
	const files = [
		...new Set([...result.examined, ...[...kept].map((finding) => finding.file)]),
	].filter((file) => !given.size || given.has(file))
	const texts = params.readTexts(files)
	const applied = files.map((file) => {
		const findings = [...kept].filter((finding) => finding.file === file)
		const text = texts.get(file)
		if (text === undefined) return { findings, allowed: {} }
		const pass = applyAllowComments({ file, text, findings, ranRules: params.ranRules })
		// a malformed opt-out is the per-file pass's to report: never twice
		return {
			...pass,
			findings: pass.findings.filter((finding) => finding.rule !== 'invalid-allow'),
		}
	})
	const findings = applied.flatMap((pass) => pass.findings)
	const left = new Set(findings)
	function silenced(finding: RuleFinding | undefined): boolean {
		return finding !== undefined && kept.has(finding) && !left.has(finding)
	}
	return {
		findings,
		allowed: sumOf(applied.map((pass) => pass.allowed)),
		recorded: {
			...result,
			duplicates: result.duplicates.map((duplicate, index) => ({
				...duplicate,
				allowed: silenced(paired.duplicates[index]),
			})),
			sharedExports: result.sharedExports.map((shared, index) => ({
				...shared,
				allowed: silenced(paired.sharedExports[index]),
			})),
			docs: result.docs.map((docs, index) => ({ ...docs, allowed: silenced(paired.docs[index]) })),
		},
	}
}

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
 * The findings of `result` as rule findings, each list in the order of its own (a warning at its place); a docs
 * finding with no source line (a removed entry: a note, its declaration gone) is undefined.
 */
function ruleFindingsOf(result: QualityResult): {
	duplicates: RuleFinding[]
	sharedExports: RuleFinding[]
	docs: (RuleFinding | undefined)[]
} {
	return {
		duplicates: result.duplicates.map((duplicate): RuleFinding => ({
			file: duplicate.file,
			line: duplicate.line,
			column: 1,
			functionLine: duplicate.line,
			rule: 'duplicate-read',
			severity: 'warning',
			message: duplicateMessageOf(duplicate),
		})),
		sharedExports: result.sharedExports.map((shared): RuleFinding => ({
			file: shared.file,
			line: shared.line,
			column: 1,
			functionLine: shared.line,
			rule: 'shared-export-changed',
			severity: 'warning',
			message: sharedExportMessageOf(shared),
		})),
		docs: result.docs.map(function docsFindingOf(docs): RuleFinding | undefined {
			const place = isDocsFinding(docs) ? declaredPlaceOf(docs.declaredAt) : undefined
			if (place === undefined) return undefined
			return {
				...place,
				column: 1,
				functionLine: place.line,
				rule: 'docs-not-updated',
				severity: 'warning',
				message: docsMessageOf(docs),
			}
		}),
	}
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

/** The per-rule counts of every examined file added up. */
function sumOf(counts: readonly AllowedCounts[]): AllowedCounts {
	const total: AllowedCounts = {}
	for (const count of counts)
		for (const [rule, silenced] of Object.entries(count) as [RuleName, number][])
			total[rule] = (total[rule] ?? 0) + silenced
	return total
}
