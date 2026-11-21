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
import {
	declaredPlaceOf,
	docsMessageOf,
	duplicateMessageOf,
	isDocsFinding,
	qualityNotesOf,
	sharedExportMessageOf,
} from './quality-wording.ts'

import type { AllowedCounts } from '../rules/allow-comments.types.ts'
import type { RuleFinding, RuleName } from '../rules/check-code-rules.types.ts'
import type { QualityBase, QualityResult, RecordedQuality } from './quality.types.ts'

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

/** The per-rule counts of every examined file added up. */
function sumOf(counts: readonly AllowedCounts[]): AllowedCounts {
	const total: AllowedCounts = {}
	for (const count of counts)
		for (const [rule, silenced] of Object.entries(count) as [RuleName, number][])
			total[rule] = (total[rule] ?? 0) + silenced
	return total
}
