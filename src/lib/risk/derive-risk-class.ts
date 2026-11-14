/**
 * The risk class of a lot, pure: high for a declared file, a destructive call added to a source file or an api
 * change; light for docs only or a small diff; medium otherwise. No file system, no git.
 */
import { posix } from 'node:path'

import { matchesGlob } from '../tdd/match-glob.ts'
import { DESTRUCTIVE_PATTERNS } from './destructive-calls.constants.ts'
import {
	RISK_API_DETAILS,
	RISK_COMMENT_LINE_PATTERN,
	RISK_DOCS_FILE_PATTERN,
	RISK_LIGHT_FILE_LIMIT,
	RISK_LIGHT_LINE_LIMIT,
	RISK_LOCK_FILE,
	RISK_PACKAGE_FILE,
	RISK_SCANNED_EXTENSIONS,
	RISK_TEST_FILE_PATTERN,
} from './risk.constants.ts'

import type { ApiChange, RiskDerivation, RiskDiffFile, RiskReason } from './risk.types.ts'

/** The risk class of a diff: high, medium or light, with every reason for high in file order. */
export function deriveRiskClass(params: {
	declaredHigh: string[]
	files: RiskDiffFile[]
	apiChange: ApiChange
}): RiskDerivation {
	const highReasons = [
		...params.files.flatMap(function reasonsOfFile(file) {
			return highReasonsOf({ file, declaredHigh: params.declaredHigh })
		}),
		...apiReasonsOf(params.apiChange),
	]
	if (highReasons.length > 0) return { class: 'high', reasons: highReasons }
	const otherFiles = params.files.filter(function isNotLightKind(file) {
		return !isLightKind(file)
	})
	if (otherFiles.length === 0)
		return {
			class: 'light',
			reasons: [{ kind: 'docs', detail: `docs only: ${params.files.length} files` }],
		}
	const lineCount = otherFiles.reduce(function sumLines(total, file) {
		return total + file.addedCount + file.removedCount
	}, 0)
	if (lineCount <= RISK_LIGHT_LINE_LIMIT && otherFiles.length <= RISK_LIGHT_FILE_LIMIT)
		return {
			class: 'light',
			reasons: [{ kind: 'size', detail: `${lineCount} lines in ${otherFiles.length} files` }],
		}
	return { class: 'medium', reasons: [] }
}

/** The risk class of a brief's scope at `lot start`, before any diff: high or medium, never light. */
export function deriveStartRiskClass(params: {
	declaredHigh: string[]
	scope: string[]
}): RiskDerivation {
	const reasons = params.scope.flatMap(function reasonsOfScope(entry): RiskReason[] {
		// an entry that is a declared glob's own folder (`src/lib/store` for `src/lib/store/**`) is declared too
		const declared = params.declaredHigh.find(function holdsEntry(glob) {
			return (
				entry === glob ||
				matchesGlob({ path: entry, glob }) ||
				matchesGlob({ path: `${entry}/`, glob })
			)
		})
		if (declared !== undefined) return [{ kind: 'declared', file: entry, detail: declared }]
		const entryLiteral = literalPartOf(entry)
		return params.declaredHigh
			.filter(function mayBeTouched(glob) {
				return literalPartOf(glob).startsWith(entryLiteral)
			})
			.map(function broadReason(glob): RiskReason {
				return { kind: 'broad-scope', detail: `broad scope: may touch ${glob}` }
			})
	})
	return reasons.length > 0 ? { class: 'high', reasons } : { class: 'medium', reasons: [] }
}

/**
 * The declared reason of a file, then one destructive reason per added line holding a destructive call; a line that is
 * a comment alone is skipped.
 */
function highReasonsOf(params: { file: RiskDiffFile; declaredHigh: string[] }): RiskReason[] {
	const { file } = params
	const declared = params.declaredHigh.find(function matchesFile(glob) {
		return matchesGlob({ path: file.path, glob })
	})
	const declaredReasons: RiskReason[] =
		declared === undefined ? [] : [{ kind: 'declared', file: file.path, detail: declared }]
	if (!isScannedSource(file.path)) return declaredReasons
	const destructiveReasons = file.added.flatMap(function destructiveReasonOf(added): RiskReason[] {
		if (RISK_COMMENT_LINE_PATTERN.test(added.text)) return []
		const detail = destructiveCallOf(added.text)
		return detail === undefined
			? []
			: [{ kind: 'destructive', file: file.path, line: added.line, detail }]
	})
	return [...declaredReasons, ...destructiveReasons]
}

function apiReasonsOf(apiChange: ApiChange): RiskReason[] {
	if (apiChange === 'changed' || apiChange === 'unknown')
		return [{ kind: 'api', detail: RISK_API_DETAILS[apiChange] }]
	return []
}

/** A source file that is not a test file. */
function isScannedSource(path: string): boolean {
	return RISK_SCANNED_EXTENSIONS.includes(posix.extname(path)) && !RISK_TEST_FILE_PATTERN.test(path)
}

/** A file light whatever its size: Markdown, the lockfile, a `package.json` whose only change is `version`. */
function isLightKind(file: RiskDiffFile): boolean {
	const name = posix.basename(file.path)
	if (RISK_DOCS_FILE_PATTERN.test(name) || name === RISK_LOCK_FILE) return true
	return name === RISK_PACKAGE_FILE && file.versionOnly === true
}

/** The text of a glob before its first wildcard. */
function literalPartOf(glob: string): string {
	const wildcard = glob.search(/[*?]/)
	return wildcard === -1 ? glob : glob.slice(0, wildcard)
}

/** The first destructive call or git argument a line holds, as a reason names it. */
function destructiveCallOf(text: string): string | undefined {
	return DESTRUCTIVE_PATTERNS.find(function holdsPattern(pattern) {
		return pattern.expressions.some(function matchesLine(expression) {
			return expression.test(text)
		})
	})?.detail
}
