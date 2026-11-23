/**
 * How a repository's lots land (FIX-ci-loop design, section 3), decided in one place. CI-first: its lots land through
 * a change request and the queue, never a hand-over; read from what the repository already has, no config key:
 * its `ci.yml` runs on the queue's trigger and holds the job the queue's ruleset requires (a `ci.yml` without the
 * queue's trigger, the workflow before the queue, is not). Every other repository lands through a hand-over.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	CI_WORKFLOW_PATH,
	FLOW_REFUSAL,
	FLOW_REFUSAL_WHY,
	LANDING_FLOWS,
	MERGE_QUEUE_TRIGGER,
	REQUIRED_CHECK_JOB,
} from './flow.constants.ts'

import { parse } from 'yaml'

import type { HostNouns } from '../host/host.types.ts'
import type { LandingFlow, LandingFlowName } from './flow.types.ts'

/**
 * The flow the repository at `root` lands its lots through.
 *
 * @intent decide once whether a repository lands through change requests or hand-overs
 * @internal
 */
export function landingFlowOf(root: string): LandingFlowName {
	return isCiFirstRepository(root) ? 'ci-first' : 'hand-over'
}

/**
 * What the flow decides: its manual next line and the verbs it refuses.
 *
 * @intent read what a landing flow allows
 * @internal
 */
export function landingFlow(flow: LandingFlowName): LandingFlow {
	return { manualNext: LANDING_FLOWS[flow].manualNext, refused: [...LANDING_FLOWS[flow].refused] }
}

/**
 * The refusal of `<command> <verb>` in the repository at `root` when its flow refuses it; undefined when allowed.
 *
 * @intent refuse a landing verb of the other flow before it writes anything
 * @internal
 */
export function flowRefusalOf(params: {
	root: string
	command: string
	verb: string
	/** The host's change-request nouns for the refusal, from the caller (flow.ts resolves no host). */
	nouns: HostNouns
}): string | undefined {
	const { root, command, verb } = params
	const flow = landingFlowOf(root)
	if (!landingFlow(flow).refused.includes(`${command} ${verb}`)) return undefined
	return fillMessage({
		template: FLOW_REFUSAL,
		values: {
			command,
			verb,
			root,
			why: fillMessage({ template: FLOW_REFUSAL_WHY[flow], values: params.nouns }),
		},
	})
}

/** True when `root`'s ci.yml is readable YAML whose triggers hold the queue's and whose jobs hold the required one. */
function isCiFirstRepository(root: string): boolean {
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
