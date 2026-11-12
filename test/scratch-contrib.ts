/** Scratch packages and runs for the tests of `dialecte contrib`: steps that count their runs, a contributor package. */
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runContrib } from '../src/commands/contrib.ts'
import { CHECK_STORE_FOLDER } from '../src/lib/gate-records/gate-records.constants.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { WIRED_DEFAULT_SCRIPTS } from './rule-gaps-unwired.constants.ts'
import { SOURCE_FILE, SOURCE_TEXT } from './scratch-contrib.constants.ts'
import { createScratchRepository } from './scratch-repository.ts'
import { commonGitDirOf } from './scratch-tree.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { ContribJson, ContribPackageParams } from './scratch-contrib.types.ts'

/** A step that appends a line to `counter` per run, then exits with `exitCode`. */
export function counterStep(params: {
	counter: string
	name: string
	exitCode?: number
	/** More shell, run first (`printf x > file`). */
	before?: string
	restoresGeneratedDocs?: boolean
}): GateStep {
	return {
		name: params.name,
		run: [
			...(params.before ? [params.before] : []),
			`echo run >> ${shellQuote(params.counter)}`,
			...(params.exitCode ? [`exit ${params.exitCode}`] : []),
		].join(' && '),
		...(params.restoresGeneratedDocs && { restoresGeneratedDocs: true }),
	}
}

/** A repository on `main` whose package declares what `params` says (a contributor with the default steps by default). */
export function createContribPackage(params: ContribPackageParams = {}): string {
	const { profile = 'contributor' } = params
	const dialecte = {
		...(profile !== null && { profile }),
		...((params.steps || params.contribSkip) && {
			contrib: {
				...(params.steps && { steps: params.steps }),
				...(params.contribSkip && { skip: params.contribSkip }),
			},
		}),
		...((params.gateFull || params.gateFast) && {
			gate: {
				...(params.gateFast && { fast: params.gateFast }),
				...(params.gateFull && { full: params.gateFull }),
			},
		}),
		...(params.mutation && { mutation: params.mutation }),
		...(params.standard && { standard: params.standard }),
		...(params.allowReferences && { allowReferences: params.allowReferences }),
		...(params.generatedDocs && { generatedDocs: params.generatedDocs }),
	}
	return createScratchRepository({
		// the default steps (docs, type-bench) are wired unless the package declares its own steps
		'package.json': `${JSON.stringify({ name: 'demo', scripts: params.steps ? {} : WIRED_DEFAULT_SCRIPTS, ...params.packageJson, dialecte })}\n`,
		'.gitignore': 'node_modules\n',
		[SOURCE_FILE]: SOURCE_TEXT,
		...params.files,
	})
}

/** `dialecte contrib` in `cwd`. */
export function runContribIn(params: { cwd: string; argv?: string[] }): Promise<CommandResult> {
	return runContrib({ cwd: params.cwd, argv: params.argv ?? [] })
}

/** What `--json` printed, parsed. */
export function parseContribJson(output: string): ContribJson {
	return JSON.parse(output) as ContribJson
}

/** The shared store of records by tree, removed: only the worktree's own records are left to read. */
export function removeCheckStore(root: string): void {
	rmSync(join(commonGitDirOf(root), CHECK_STORE_FOLDER), { recursive: true, force: true })
}

/** A file of the package as it is on disk. */
export function readPackageFile(params: { root: string; path: string }): string {
	return readFileSync(join(params.root, params.path), 'utf8')
}
