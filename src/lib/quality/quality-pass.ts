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
import type { QualityBase, QualityResult } from './quality.types.ts'

/**
 * The base-aware findings of the change at `root` against `base` (silenced ones counted), on `givenFiles` only when
 * some are given (then nothing is recorded), recorded when `record` holds.
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
	const all = findingsOf(result)
	const given = new Set(params.givenFiles)
	const kept = given.size ? all.filter((finding) => given.has(finding.file)) : all
	const ran = new Set<RuleName>(BASE_AWARE_RULES)
	const files = [...new Set([...result.examined, ...kept.map((finding) => finding.file)])].filter(
		(file) => !given.size || given.has(file),
	)
	const applied = files.map((file) => {
		const full = join(root, file)
		const findings = kept.filter((finding) => finding.file === file)
		if (!existsSync(full)) return { findings, allowed: {} }
		const pass = applyAllowComments({
			file,
			text: readFileSync(full, 'utf8'),
			findings,
			ranRules: ran,
		})
		// a malformed opt-out is the per-file pass's to report: never twice
		return {
			...pass,
			findings: pass.findings.filter((finding) => finding.rule !== 'invalid-allow'),
		}
	})
	const findings = applied.flatMap((pass) => pass.findings)
	const allowed = sumOf(applied.map((pass) => pass.allowed))
	if (params.record && !given.size) recordQuality({ root, result, allowed, now: new Date() })
	return { findings, allowed, result, notes: notesOf(result) }
}

/**
 * The notes under the quality line: each removed public entry a page still names (no source line to sit on, the fix
 * is the page), an unknown public API (the docs rule did not run), aliases read in the tree for the base edges.
 */
function notesOf(result: QualityResult): string[] {
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

/** The findings of `result` as rule findings: each at its place, a warning. */
function findingsOf(result: QualityResult): RuleFinding[] {
	return [
		...result.duplicates.map((duplicate): RuleFinding => ({
			file: duplicate.file,
			line: duplicate.line,
			column: 1,
			functionLine: duplicate.line,
			rule: 'duplicate-read',
			severity: 'warning',
			message: QUALITY_MESSAGES.duplicateRead
				.replace('{name}', () => duplicate.name)
				.replace('{existing}', () => duplicate.existing.name)
				.replace('{at}', () => `${duplicate.existing.file}:${duplicate.existing.line}`),
		})),
		...result.sharedExports.map((shared): RuleFinding => ({
			file: shared.file,
			line: shared.line,
			column: 1,
			functionLine: shared.line,
			rule: 'shared-export-changed',
			severity: 'warning',
			message: QUALITY_MESSAGES.sharedExport
				.replace('{name}', () => shared.name)
				.replace('{folder}', () => shared.folder)
				.replace('{importers}', () => shared.importers.join(', '))
				.replace('{changes}', () => shared.changes.join(', ')),
		})),
		// a removed entry is a note: its declaration is gone from the tree
		...result.docs.flatMap((docs): RuleFinding[] => {
			if (docs.change === 'removed') return []
			const place = placeOf(docs.declaredAt)
			if (place === undefined) return []
			return [
				{
					...place,
					column: 1,
					functionLine: place.line,
					rule: 'docs-not-updated',
					severity: 'warning',
					message: QUALITY_MESSAGES.docs
						.replace('{route}', () => docs.route)
						.replace('{change}', () => docs.change)
						.replace('{pages}', () =>
							docs.pages.length ? docs.pages.join(', ') : QUALITY_MESSAGES.noPage,
						),
				},
			]
		}),
	]
}

/** `src/x.ts:4` as a file and a line; undefined when absent or not of that form. */
function placeOf(declaredAt: string | undefined): { file: string; line: number } | undefined {
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
