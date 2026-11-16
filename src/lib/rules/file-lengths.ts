/**
 * The file length rules of a run of `rules`: a test file's length, and the length of each fixture file the checked
 * tests read, judged against the base (every file over its limit read there in one git call).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { readFilesAtRevision } from '../git.ts'
import { applyXmlAllowComment } from './allow-comments.ts'
import { checkFixtureFileLength, checkTestFileLength, lineCountOf } from './check-length-rules.ts'

import type { AllowedCounts } from './allow-comments.types.ts'
import type { RuleFinding } from './check-code-rules.types.ts'
import type { OverLimitFile } from './file-lengths.types.ts'

/**
 * The `test-file-long` finding of a test file's text, as if the base had no such file, with the file's length when
 * it is over the limit (`judgedAtBase` settles it).
 */
export function testFileLengthOf(params: { file: string; text: string }): {
	finding?: RuleFinding
	overLimit?: OverLimitFile
} {
	const { file } = params
	const lineCount = lineCountOf(params.text)
	const finding = checkTestFileLength({ file, lineCount, baseLineCount: undefined })
	return finding ? { finding: { file, ...finding }, overLimit: { file, lineCount } } : {}
}

/**
 * The `fixture-file-long` findings of the fixture files (each once), as if the base had none of them, with the opt-out
 * of each file's first line applied, the counts it silenced, and the files over the limit (`judgedAtBase` settles
 * them). A fixture that cannot be read is left to the test that imports it.
 */
export function checkFixtureFiles(params: { root: string; fixtures: readonly string[] }): {
	findings: RuleFinding[]
	allowed: AllowedCounts[]
	overLimit: OverLimitFile[]
} {
	const findings: RuleFinding[] = []
	const allowed: AllowedCounts[] = []
	const overLimit: OverLimitFile[] = []
	for (const file of new Set(params.fixtures)) {
		const text = readTextOf({ root: params.root, file })
		if (text === undefined) continue
		const lineCount = lineCountOf(text)
		const over = checkFixtureFileLength({ file, lineCount, baseLineCount: undefined })
		if (over) overLimit.push({ file, lineCount })
		const applied = applyXmlAllowComment({ file, text, findings: over ? [{ file, ...over }] : [] })
		findings.push(...applied.findings)
		allowed.push(applied.allowed)
	}
	return { findings, allowed, overLimit }
}

/**
 * The findings with each length finding judged against its file at the base: every file over its limit read there
 * in one git call; without a base, or for a file the base does not hold, a finding stays as it is.
 */
export function judgedAtBase(params: {
	root: string
	base: string | undefined
	findings: readonly RuleFinding[]
	overLimit: readonly OverLimitFile[]
}): RuleFinding[] {
	const { root, base, findings } = params
	if (base === undefined || params.overLimit.length === 0) return [...findings]
	const lineCounts = new Map(params.overLimit.map((over) => [over.file, over.lineCount]))
	const atBase = readFilesAtRevision({ root, revision: base, files: [...lineCounts.keys()] })
	return findings.map(function judgedFinding(finding) {
		const check =
			finding.rule === 'test-file-long'
				? checkTestFileLength
				: finding.rule === 'fixture-file-long'
					? checkFixtureFileLength
					: undefined
		const lineCount = lineCounts.get(finding.file)
		const baseText = atBase.get(finding.file)
		if (check === undefined || lineCount === undefined || baseText === undefined) return finding
		const judged = check({ file: finding.file, lineCount, baseLineCount: lineCountOf(baseText) })
		return judged ? { ...finding, ...judged } : finding
	})
}

function readTextOf(params: { root: string; file: string }): string | undefined {
	try {
		return readFileSync(resolve(params.root, params.file), 'utf8')
	} catch {
		return undefined
	}
}
