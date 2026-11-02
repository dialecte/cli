/**
 * `dialecte lot exempt <reason>` / `lot accept <case> <reason>` / `lot revised <case|file|glob> <reason>` /
 * `lot gone <file|glob> <reason>` / `lot mutation <off|changed|audit|gate>`: writes the lot declaration `.dialecte/lot.json` of the package in the
 * current folder, formatted, keeping what it already holds. An acceptance names one case; a revision a
 * case, a file or a glob; a gone entry a file or a glob, never a case.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { MUTATION_MODES } from '../lib/mutation/mutation.constants.ts'
import { packageRootOf } from '../lib/package-root.ts'
import { namesOneCase } from '../lib/tdd/lot-declaration.ts'
import { LOT_VERBS, LOT_USAGE } from '../lib/tdd/tdd.constants.ts'
import { LOT_FILE } from '../lib/worktree/worktree.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LotCaseEntry, LotCaseList, LotGoneEntry } from '../lib/tdd/tdd.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runLot({ cwd: process.cwd(), argv })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runLot(params: { cwd: string; argv: string[] }): CommandResult {
	const [verb, ...words] = params.argv
	const mutationRefusal = verb === 'mutation' ? refuseMutationWords(words) : undefined
	if (mutationRefusal) return { exitCode: 2, output: `lot: ${mutationRefusal}` }
	const list: LotCaseList | undefined = verb === 'accept' || verb === 'revised' ? verb : undefined
	const gone = verb === 'gone'
	if (!LOT_VERBS.includes(verb ?? '') || words.length !== (list || gone ? 2 : 1))
		return { exitCode: 2, output: `lot: ${LOT_USAGE}` }
	if (list === 'accept' && !namesOneCase(words[0]))
		return {
			exitCode: 2,
			output: `lot: a case is <file>::<name> (the file, then the full name vitest prints), not ${JSON.stringify(words[0])}`,
		}
	if ((list || gone) && words[0].trim() === '')
		return { exitCode: 2, output: `lot: ${verb} needs a case, a file or a glob first` }
	if (gone && namesOneCase(words[0]))
		return {
			exitCode: 2,
			output: `lot: gone names a test file or a glob over test files, not a case: ${JSON.stringify(words[0])}`,
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
	} else if (gone) {
		const [file, reason] = words
		const entries = Array.isArray(declaration.gone) ? (declaration.gone as LotGoneEntry[]) : []
		const known = entries.some((entry) => entry.file === file)
		declaration.gone = known
			? entries.map((entry) => (entry.file === file ? { file, reason } : entry))
			: [...entries, { file, reason }]
	} else if (verb === 'mutation') declaration.mutation = words[0]
	else declaration.tdd = `exempt: ${words[0]}`
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(declaration, null, '\t')}\n`)
	return { exitCode: 0, output: `lot: ${path} written` }
}

/** Why `lot mutation <mode>` refuses its words: no mode, a mode it does not know, or a reason after it. */
function refuseMutationWords(words: readonly string[]): string | undefined {
	const modes = MUTATION_MODES.join(' | ')
	if (words.length === 0) return `mutation needs a mode: mutation <${modes}>`
	if (!MUTATION_MODES.some((mode) => mode === words[0]))
		return `mutation takes one of ${MUTATION_MODES.join(', ')}, not ${JSON.stringify(words[0])}`
	if (words.length > 1)
		return `mutation takes no reason: lot mutation <${modes}>, nothing after the mode`
	return undefined
}
