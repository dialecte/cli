/**
 * Whether a repository is CI-first: its lots land through a pull request and the merge queue, never a hand-over.
 * Read from what the repository already has, no config key: its `ci.yml` runs on the queue's trigger and holds the
 * job the queue's ruleset requires. A `ci.yml` without the queue's trigger (the workflow before the queue) is not.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CI_WORKFLOW_PATH, MERGE_QUEUE_TRIGGER, REQUIRED_CHECK_JOB } from './ci-first.constants.ts'

import { parse } from 'yaml'

/** True when `root`'s ci.yml is readable YAML whose triggers hold the queue's and whose jobs hold the required one. */
export function isCiFirstRepository(root: string): boolean {
	const file = join(root, CI_WORKFLOW_PATH)
	if (!existsSync(file)) return false
	const workflow = recordOf(parsedYaml(readFileSync(file, 'utf8')))
	if (workflow === undefined) return false
	return (
		triggersOf(workflow.on).includes(MERGE_QUEUE_TRIGGER) &&
		REQUIRED_CHECK_JOB in (recordOf(workflow.jobs) ?? {})
	)
}

/** The trigger names of a workflow's `on`: one word, a list of words, or a map keyed by trigger. */
function triggersOf(on: unknown): string[] {
	if (typeof on === 'string') return [on]
	if (Array.isArray(on)) return on.filter((trigger) => typeof trigger === 'string')
	return Object.keys(recordOf(on) ?? {})
}

/** YAML text parsed, or undefined when it is not YAML. */
function parsedYaml(text: string): unknown {
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
