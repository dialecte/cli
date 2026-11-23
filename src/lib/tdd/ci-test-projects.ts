/**
 * The vitest projects the package's CI runs, read from its own test workflow (`.github/workflows/_test.yml`) and
 * the npm scripts its steps reach; every project (`all`, with the reason) whenever the reader cannot tell. Every step
 * `run` of every job counts, whatever its `if:`. A `run` (and a script) is split into commands quote-aware; a command
 * of no known form that may run vitest makes the answer `all`: never a guessed subset.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { OWN_TEST_PATH } from '../ci/ci-template.constants.ts'
import { firstLine } from './classify-failure.ts'
import { fillTemplate } from './moved-cases.ts'
import { shellCommands } from './shell-words.ts'
import {
	ARGUMENTS_SEPARATOR,
	CI_PROJECTS_REASONS,
	CI_PROJECTS_SOURCE_WITH_SCRIPTS,
	LOCAL_PATH_PREFIX,
	NODE_COMMAND,
	NODE_EVAL_FLAGS,
	NPM_COMMAND,
	NPM_EXEC_SUBCOMMAND,
	NPM_INSTALL_COMMANDS,
	NPM_OTHER_PACKAGE_FLAGS,
	NPM_RUN_SUBCOMMANDS,
	NPM_TEST_SCRIPT,
	NPM_TEST_SUBCOMMANDS,
	NPX_COMMAND,
	OTHER_PACKAGE_MANAGERS,
	PLAYWRIGHT_INSTALL,
	SAME_FOLDERS,
	SHELL_ASSIGNMENT_PATTERN,
	SHELL_BUILTINS,
	SHELL_CD_COMMAND,
	SHELL_DUPLICATION_PATTERN,
	SHELL_EXPANSION_MARK,
	SHELL_REDIRECTION_PATTERN,
	VITEST_EXECUTABLES,
	VITEST_NON_RUN_SUBCOMMANDS,
	VITEST_OTHER_CONFIG_FLAGS,
	VITEST_PROJECT_FLAG,
	VITEST_RUN_SUBCOMMANDS,
	VITEST_VALUE_FLAGS,
} from './tdd.constants.ts'

import { parse } from 'yaml'

import type { PackageJson } from '../package-json.types.ts'
import type { CiCommandsRead, CiTestProjects } from './tdd.types.ts'

/** The projects CI runs, read from the package's own test workflow and the npm scripts it reaches; `all` when unsure. */
export function readCiTestProjects(params: {
	root: string
	packageJson: PackageJson
}): CiTestProjects {
	const path = join(params.root, OWN_TEST_PATH)
	if (!existsSync(path)) return allOf({ template: CI_PROJECTS_REASONS.noWorkflow })
	let workflow: unknown
	try {
		workflow = parse(readFileSync(path, 'utf8'))
	} catch (error) {
		return allOf({
			template: CI_PROJECTS_REASONS.yaml,
			values: { message: firstLine(error instanceof Error ? error.message : String(error)) },
		})
	}
	const document = recordOf(workflow)
	const jobs = recordOf(document?.jobs)
	if (!jobs) return allOf({ template: CI_PROJECTS_REASONS.notAWorkflow })
	// the workflow's own default folder holds for every job
	const directory = otherDirectory(document?.defaults)
	if (directory !== undefined) return { kind: 'all', reason: directory }
	const read = readJobs({ jobs: Object.values(jobs), scripts: params.packageJson.scripts ?? {} })
	if ('reason' in read) return { kind: 'all', reason: read.reason }
	if (read.names.length === 0) return allOf({ template: CI_PROJECTS_REASONS.noVitestRun })
	return {
		kind: 'projects',
		names: read.names,
		source: read.scripts.length
			? fillTemplate({
					template: CI_PROJECTS_SOURCE_WITH_SCRIPTS,
					values: { path: OWN_TEST_PATH, scripts: read.scripts.join(', ') },
				})
			: OWN_TEST_PATH,
	}
}

/** Every step command of every job, read in order; the first reason it cannot tell ends the read. */
function readJobs(params: {
	jobs: readonly unknown[]
	scripts: Readonly<Record<string, string>>
}): CiCommandsRead {
	let read: CiCommandsRead = { names: [], scripts: [] }
	for (const job of params.jobs) {
		const record = recordOf(job)
		if (!record) continue
		// a job calling a reusable workflow, local or remote, runs what the reader does not see
		if (typeof record.uses === 'string') return { reason: usesReason(record.uses) }
		const jobDirectory = otherDirectory(record.defaults)
		if (jobDirectory !== undefined) return { reason: jobDirectory }
		const steps = Array.isArray(record.steps) ? record.steps : []
		for (const step of steps) {
			read = joinReads([read, readStep({ step, scripts: params.scripts })])
			if ('reason' in read) return read
		}
	}
	return read
}

/** One step: a local action, another working directory, or its `run` commands. */
function readStep(params: {
	step: unknown
	scripts: Readonly<Record<string, string>>
}): CiCommandsRead {
	const step = recordOf(params.step)
	if (!step) return { names: [], scripts: [] }
	if (typeof step.uses === 'string' && step.uses.startsWith(LOCAL_PATH_PREFIX))
		return { reason: usesReason(step.uses) }
	const directory = folderReason(step['working-directory'])
	if (directory !== undefined) return { reason: directory }
	if (typeof step.run !== 'string') return { names: [], scripts: [] }
	return readCommands({
		commands: shellCommands(step.run),
		scripts: params.scripts,
		path: [],
		script: undefined,
	})
}

/** The commands of a step (`script` undefined) or of a script, read in order. */
function readCommands(params: {
	commands: readonly string[][]
	scripts: Readonly<Record<string, string>>
	/** The scripts being read, outermost first: one of them named again is read once. */
	path: readonly string[]
	script: string | undefined
}): CiCommandsRead {
	return joinReads(
		params.commands.map((words) =>
			readCommand({
				words: wordsPastAssignments(wordsPastRedirections(words)),
				scripts: params.scripts,
				path: params.path,
				script: params.script,
			}),
		),
	)
}

/** One command: an npm script, a vitest run, a known non-runner; any other may run vitest (`all`). */
function readCommand(params: {
	words: readonly string[]
	scripts: Readonly<Record<string, string>>
	path: readonly string[]
	script: string | undefined
}): CiCommandsRead {
	const { words, script } = params
	const none: CiCommandsRead = { names: [], scripts: [] }
	const [first, second] = words
	const command = words.join(' ')
	if (first === undefined) return none
	if (SHELL_BUILTINS.includes(first)) return none
	// `cd .` stays in the package; any other folder is another package's
	if (first === SHELL_CD_COMMAND && second !== undefined && SAME_FOLDERS.includes(second))
		return none
	if (first === NODE_COMMAND && second !== undefined && NODE_EVAL_FLAGS.includes(second))
		return none
	if (OTHER_PACKAGE_MANAGERS.includes(first))
		return {
			reason: fillTemplate({
				template: CI_PROJECTS_REASONS.otherManager,
				values: { command, manager: first },
			}),
		}
	if (VITEST_EXECUTABLES.includes(first)) return readVitest({ words: words.slice(1), command })
	if (first === NPX_COMMAND) {
		const rest = wordsPastOptions(words.slice(1))
		if (PLAYWRIGHT_INSTALL.every((word, index) => rest[index] === word)) return none
		if (rest[0] !== undefined && VITEST_EXECUTABLES.includes(rest[0]))
			return readVitest({ words: rest.slice(1), command })
	}
	if (first === NPM_COMMAND) {
		const npm = readNpm({ ...params, command })
		if (npm !== undefined) return npm
	}
	return {
		reason:
			script === undefined
				? fillTemplate({
						template: CI_PROJECTS_REASONS.unreadStep,
						values: { path: OWN_TEST_PATH, command },
					})
				: fillTemplate({ template: CI_PROJECTS_REASONS.unreadScript, values: { script, command } }),
	}
}

/** An npm command the reader follows (a script, `exec`, an install in a step); undefined for any other. */
function readNpm(params: {
	words: readonly string[]
	command: string
	scripts: Readonly<Record<string, string>>
	path: readonly string[]
	script: string | undefined
}): CiCommandsRead | undefined {
	const { words, command } = params
	const [, second, third] = words
	// npm's own options stand before `--`: what follows goes to the script
	const dashes = words.indexOf(ARGUMENTS_SEPARATOR)
	const npmWords = dashes < 0 ? words : words.slice(0, dashes)
	const otherPackage = npmWords.find((word) =>
		NPM_OTHER_PACKAGE_FLAGS.some((flag) => word === flag || word.startsWith(`${flag}=`)),
	)
	if (otherPackage !== undefined)
		return {
			reason: fillTemplate({
				template: CI_PROJECTS_REASONS.otherPackage,
				values: { command, flag: otherPackage.split('=')[0] ?? otherPackage },
			}),
		}
	if (second !== undefined && NPM_RUN_SUBCOMMANDS.includes(second))
		return third === undefined
			? { reason: fillTemplate({ template: CI_PROJECTS_REASONS.noScript, values: { command } }) }
			: readScript({ ...params, name: third, extra: argumentsAfterDashes(words.slice(3)) })
	if (second !== undefined && NPM_TEST_SUBCOMMANDS.includes(second))
		return readScript({
			...params,
			name: NPM_TEST_SCRIPT,
			extra: argumentsAfterDashes(words.slice(2)),
		})
	if (second === NPM_EXEC_SUBCOMMAND) {
		const executed = words[2] === ARGUMENTS_SEPARATOR ? words.slice(3) : words.slice(2)
		return readCommand({ ...params, words: executed })
	}
	if (params.script === undefined && second !== undefined && NPM_INSTALL_COMMANDS.includes(second))
		return { names: [], scripts: [] }
	return undefined
}

/**
 * An npm script with its `pre` and `post` scripts, as npm runs them: the arguments after `--` appended to the
 * script's text, so they join its last command only. A script already on the read path is read once.
 */
function readScript(params: {
	name: string
	extra: readonly string[]
	command: string
	scripts: Readonly<Record<string, string>>
	path: readonly string[]
}): CiCommandsRead {
	const { name, scripts } = params
	if (params.path.includes(name)) return { names: [], scripts: [] }
	const text = scripts[name]
	if (text === undefined)
		return {
			reason: fillTemplate({
				template: CI_PROJECTS_REASONS.noScript,
				values: { command: params.command },
			}),
		}
	const path = [...params.path, name]
	const commands = shellCommands(text)
	const last = commands.length - 1
	const withExtra = commands.map((words, index) =>
		index === last ? [...words, ...params.extra] : words,
	)
	const hookNames = [`pre${name}`, `post${name}`].filter((hook) => scripts[hook] !== undefined)
	function readHook(hook: string): CiCommandsRead {
		const hookText = scripts[hook]
		return hookText === undefined || path.includes(hook)
			? { names: [], scripts: [] }
			: readCommands({
					commands: shellCommands(hookText),
					scripts,
					path: [...path, hook],
					script: hook,
				})
	}
	const read = joinReads([
		readHook(`pre${name}`),
		readCommands({ commands: withExtra, scripts, path, script: name }),
		readHook(`post${name}`),
	])
	if ('reason' in read) return read
	return { names: read.names, scripts: unique([name, ...hookNames, ...read.scripts]) }
}

/**
 * The arguments of a vitest command: another subcommand runs nothing; a run names its projects, or none (`all`); a
 * project named through an expansion, another config or a file filter is not read (`all`).
 */
function readVitest(params: { words: readonly string[]; command: string }): CiCommandsRead {
	const { command } = params
	const [first] = params.words
	if (first !== undefined && VITEST_NON_RUN_SUBCOMMANDS.includes(first))
		return { names: [], scripts: [] }
	const runWords =
		first !== undefined && VITEST_RUN_SUBCOMMANDS.includes(first)
			? params.words.slice(1)
			: params.words
	const otherConfig = runWords.find((word) =>
		VITEST_OTHER_CONFIG_FLAGS.some((flag) => word === flag || word.startsWith(`${flag}=`)),
	)
	if (otherConfig !== undefined)
		return {
			reason: fillTemplate({
				template: CI_PROJECTS_REASONS.otherConfig,
				values: { command, flag: otherConfig.split('=')[0] ?? otherConfig },
			}),
		}
	// a word neither an option nor an option's value filters the run's files: CI runs only part of a project
	const filter = runWords.find(
		(word, index) =>
			!word.startsWith('-') && !VITEST_VALUE_FLAGS.includes(runWords[index - 1] ?? ''),
	)
	if (filter !== undefined)
		return {
			reason: fillTemplate({
				template: CI_PROJECTS_REASONS.fileFilter,
				values: { command, word: filter },
			}),
		}
	const names = runWords.flatMap((word, index) => {
		if (word.startsWith(`${VITEST_PROJECT_FLAG}=`))
			return [word.slice(VITEST_PROJECT_FLAG.length + 1)]
		const next = runWords[index + 1]
		return word === VITEST_PROJECT_FLAG && next !== undefined ? [next] : []
	})
	const expanded = names.find((name) => name.includes(SHELL_EXPANSION_MARK))
	if (expanded !== undefined)
		return {
			reason: fillTemplate({
				template: CI_PROJECTS_REASONS.expansion,
				values: { command, word: expanded },
			}),
		}
	if (names.length === 0)
		return {
			reason: fillTemplate({ template: CI_PROJECTS_REASONS.noProject, values: { command } }),
		}
	return { names, scripts: [] }
}

/** The reads joined in order: the first reason wins; names and scripts in first-seen order. */
function joinReads(reads: readonly CiCommandsRead[]): CiCommandsRead {
	const names: string[] = []
	const scripts: string[] = []
	for (const read of reads) {
		if ('reason' in read) return read
		names.push(...read.names)
		scripts.push(...read.scripts)
	}
	return { names: unique(names), scripts: unique(scripts) }
}

/** A command's words without its redirections and their targets (`> out.log`, `2>&1`, `<in`). */
function wordsPastRedirections(words: readonly string[]): string[] {
	const kept: string[] = []
	for (let index = 0; index < words.length; index++) {
		const word = words[index] as string
		const operator = SHELL_REDIRECTION_PATTERN.exec(word)?.[0]
		if (operator === undefined) kept.push(word)
		// the target is the next word when none is attached and the redirection duplicates no stream
		else if (operator === word && !SHELL_DUPLICATION_PATTERN.test(word)) index++
	}
	return kept
}

/** A command's words past its leading `NAME=value` assignments. */
function wordsPastAssignments(words: readonly string[]): string[] {
	const start = words.findIndex((word) => !SHELL_ASSIGNMENT_PATTERN.test(word))
	return start < 0 ? [] : words.slice(start)
}

/** npx's words past its own options (`--no-install`, `--yes`). */
function wordsPastOptions(words: readonly string[]): string[] {
	const start = words.findIndex((word) => !word.startsWith('-'))
	return start < 0 ? [] : words.slice(start)
}

/** The arguments an npm command passes its script: those after `--`. */
function argumentsAfterDashes(words: readonly string[]): string[] {
	const dashes = words.indexOf(ARGUMENTS_SEPARATOR)
	return dashes < 0 ? [] : words.slice(dashes + 1)
}

/** The reason of a `uses:` the reader does not follow. */
function usesReason(uses: string): string {
	return fillTemplate({ template: CI_PROJECTS_REASONS.uses, values: { path: OWN_TEST_PATH, uses } })
}

/** The reason of a `defaults.run.working-directory` other than the package's; undefined for none or `.`. */
function otherDirectory(defaults: unknown): string | undefined {
	return folderReason(recordOf(recordOf(defaults)?.run)?.['working-directory'])
}

/** The reason of a working directory other than the package's; undefined for none or `.`. */
function folderReason(directory: unknown): string | undefined {
	if (directory === undefined || SAME_FOLDERS.includes(String(directory))) return undefined
	return fillTemplate({
		template: CI_PROJECTS_REASONS.workingDirectory,
		values: { path: OWN_TEST_PATH, directory: String(directory) },
	})
}

/** `all`, its reason filled with the workflow's path and `values`. */
function allOf(params: {
	template: string
	values?: Readonly<Record<string, string>>
}): CiTestProjects {
	return {
		kind: 'all',
		reason: fillTemplate({
			template: params.template,
			values: { path: OWN_TEST_PATH, ...params.values },
		}),
	}
}

/** The value as a plain object, else undefined. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)]
}
