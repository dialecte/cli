/**
 * `dialecte lot exempt <reason>` / `lot accept <case> <reason>` / `lot revised <case> <reason>`: writes the
 * lot declaration `.dialecte/lot.json` of the package in the current folder, formatted, keeping what it
 * already holds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { CASE_ARGUMENT_SEPARATOR, LOT_VERBS, LOT_USAGE } from '../lib/tdd/tdd.constants.ts'
import { LOT_FILE } from '../lib/worktree/worktree.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LotCaseEntry, LotCaseList } from '../lib/tdd/tdd.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runLot({ cwd: process.cwd(), argv })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runLot(params: { cwd: string; argv: string[] }): CommandResult {
	const [verb, ...words] = params.argv
	const list: LotCaseList | undefined = verb === 'accept' || verb === 'revised' ? verb : undefined
	if (!LOT_VERBS.includes(verb ?? '') || words.length !== (list ? 2 : 1))
		return { exitCode: 2, output: `lot: ${LOT_USAGE}` }
	if (list && !words[0].includes(CASE_ARGUMENT_SEPARATOR))
		return {
			exitCode: 2,
			output: `lot: a case is <file>::<name> (the file, then the full name vitest prints), not ${JSON.stringify(words[0])}`,
		}
	const root = packageRootOf(params.cwd)
	if (!root) return { exitCode: 1, output: `lot: no package.json at or above ${params.cwd}` }
	const path = join(root, LOT_FILE)
	let read: unknown = {}
	if (existsSync(path))
		try {
			read = JSON.parse(readFileSync(path, 'utf8'))
		} catch (error) {
			return {
				exitCode: 1,
				output: `lot: ${path} is not JSON (${(error as Error).message}); fix or remove it first`,
			}
		}
	if (typeof read !== 'object' || read === null || Array.isArray(read))
		return {
			exitCode: 1,
			output: `lot: ${path} holds no object (${JSON.stringify(read)}); fix or remove it first`,
		}
	const declaration = read as Record<string, unknown>
	if (list) {
		const [testCase, reason] = words
		const entries = Array.isArray(declaration[list]) ? (declaration[list] as LotCaseEntry[]) : []
		const known = entries.some((entry) => entry.case === testCase)
		declaration[list] = known
			? entries.map((entry) => (entry.case === testCase ? { case: testCase, reason } : entry))
			: [...entries, { case: testCase, reason }]
	} else declaration.tdd = `exempt: ${words[0]}`
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(declaration, null, '\t')}\n`)
	return { exitCode: 0, output: `lot: ${path} written` }
}

/** The nearest folder at or above `cwd` holding a package.json. */
function packageRootOf(cwd: string): string | undefined {
	for (let folder = cwd; ; folder = dirname(folder)) {
		if (existsSync(join(folder, 'package.json'))) return folder
		if (dirname(folder) === folder) return undefined
	}
}
