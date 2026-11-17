/** The CI template shipped in the package (`templates/ci/`): read, rendered for a package's facts, compared. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findPackageFolder } from '../read-cli-version.ts'
import {
	CI_TEMPLATE_FOLDER,
	CLI_INVOCATIONS,
	CLI_SLOT,
	CONDITION_END_PATTERN,
	CONDITION_START_PATTERN,
	RETIRED_PATHS,
	SELECTED_FILES,
	TEST_CONTRACT_FINDINGS,
	TEST_MODE_INPUT,
	WORKFLOWS_FOLDER,
} from './ci-template.constants.ts'

import { parse } from 'yaml'

import type { CiChange, CiFacts, CiFiles, CiPlan, TestContract } from './ci-template.types.ts'

/** The template files as shipped, by path: read from the cli's own package folder, sources or bundle alike. */
export function readCiTemplate(): CiFiles {
	const root = join(
		findPackageFolder({ startFolder: dirname(fileURLToPath(import.meta.url)) }),
		CI_TEMPLATE_FOLDER,
	)
	return new Map(
		filesUnder(root).map((file) => [
			relative(root, file).split('\\').join('/'),
			readFileSync(file, 'utf8'),
		]),
	)
}

/** Every file under a folder, dot files included, sorted. */
function filesUnder(folder: string): string[] {
	return readdirSync(folder, { withFileTypes: true })
		.flatMap((entry) =>
			entry.isDirectory() ? filesUnder(join(folder, entry.name)) : [join(folder, entry.name)],
		)
		.sort()
}

/** The files a package with these facts gets: the selected ones, conditional blocks kept or dropped, slots filled. */
export function renderCiFiles(params: { facts: CiFacts; template: CiFiles }): CiFiles {
	const { facts } = params
	return new Map(
		[...params.template]
			.filter(([path]) => {
				const fact = SELECTED_FILES[path]
				return fact === undefined || facts[fact] === true
			})
			.map(([path, text]) => [path, renderText({ facts, text })]),
	)
}

/** A template text for the facts: each `#{{if fact}}` block kept when the fact holds, the cli slot filled. */
function renderText(params: { facts: CiFacts; text: string }): string {
	const kept = params.text.split('\n').reduce<{ lines: string[]; skipping: boolean }>(
		function keepLine(state, line) {
			const condition = CONDITION_START_PATTERN.exec(line)?.[1]
			if (condition !== undefined)
				return { lines: state.lines, skipping: !isFact({ facts: params.facts, name: condition }) }
			if (CONDITION_END_PATTERN.test(line)) return { lines: state.lines, skipping: false }
			return state.skipping ? state : { lines: [...state.lines, line], skipping: false }
		},
		{ lines: [], skipping: false },
	)
	return kept.lines.join('\n').split(CLI_SLOT).join(CLI_INVOCATIONS[params.facts.cli])
}

/** Whether the fact a condition names holds; a name that is no fact is a template bug. */
function isFact(params: { facts: CiFacts; name: string }): boolean {
	const value: unknown = Object.entries(params.facts).find(([key]) => key === params.name)?.[1]
	if (typeof value !== 'boolean')
		throw new Error(`the CI template names no fact ${params.name} in a condition`)
	return value
}

/** The repository's own `_test.yml` text (undefined: missing) against what ci.yml needs of it. */
export function testContractOf(text: string | undefined): TestContract {
	if (text === undefined)
		return { present: false, mode: false, findings: [TEST_CONTRACT_FINDINGS.missing] }
	const workflow = parseYaml(text)
	if (workflow === undefined)
		return { present: true, mode: false, findings: [TEST_CONTRACT_FINDINGS.unreadable] }
	const triggers = recordOf(recordOf(workflow)?.on)
	if (triggers === undefined || !('workflow_call' in triggers))
		return { present: true, mode: false, findings: [TEST_CONTRACT_FINDINGS.noWorkflowCall] }
	const mode = recordOf(recordOf(recordOf(triggers.workflow_call)?.inputs)?.[TEST_MODE_INPUT])
	if (mode === undefined) return { present: true, mode: false, findings: [] }
	if (mode.type === 'string') return { present: true, mode: true, findings: [] }
	return {
		present: true,
		mode: false,
		findings: [TEST_CONTRACT_FINDINGS.modeType.replace('{type}', String(mode.type ?? 'no type'))],
	}
}

/** YAML text parsed, or undefined when it is not YAML. */
function parseYaml(text: string): unknown {
	try {
		return parse(text)
	} catch {
		return undefined
	}
}

/** A value as a plain object, or undefined. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined
}

/**
 * What a sync would change in `root`: each managed path (`managed`: the template's paths and the retired ones) that
 * differs from `wanted`, created, updated or deleted; the workflow files no managed path names are the repository's own.
 */
export function planCiSync(params: {
	root: string
	wanted: CiFiles
	managed: readonly string[]
}): CiPlan {
	const { root, wanted } = params
	const managed = new Set([...params.managed, ...RETIRED_PATHS, ...wanted.keys()])
	const changes = [...managed].sort().flatMap((path): CiChange[] => {
		const file = join(root, path)
		const after = wanted.get(path)
		const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined
		if (after === undefined) return before === undefined ? [] : [{ kind: 'delete', path }]
		if (before === undefined) return [{ kind: 'create', path, after }]
		return before === after ? [] : [{ kind: 'update', path, before, after }]
	})
	const workflows = join(root, WORKFLOWS_FOLDER)
	const own = existsSync(workflows)
		? readdirSync(workflows, { withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => `${WORKFLOWS_FOLDER}/${entry.name}`)
				.filter((path) => !managed.has(path))
				.sort()
		: []
	return { changes, own }
}
