/**
 * The cli's own CI wiring of the live host check: `_test.yml` runs `doctor --host` in a job that cannot be skipped
 * by a tolerated failure, and `ci.yml` makes that workflow part of the one required check.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = { name?: string; run?: string; uses?: string }
type Job = {
	'continue-on-error'?: unknown
	needs?: string | string[]
	uses?: string
	steps?: Step[]
}
type Workflow = { jobs: Record<string, Job> }

const WORKFLOWS = join(import.meta.dirname, '..', '..', '..', '.github', 'workflows')

function workflowOf(file: string): Workflow {
	return parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
}

describe('the live host check in CI', () => {
	it('_test.yml has a host-live job that may not fail silently and runs `doctor --host`', () => {
		const job = workflowOf('_test.yml').jobs['host-live']

		expect(job).toBeDefined()
		expect(job).not.toHaveProperty('continue-on-error')
		expect(
			(job?.steps ?? []).some((step) => step.run?.includes('node src/cli.ts doctor --host')),
		).toBe(true)
	})

	it('ci.yml runs _test.yml as `test`, and `ci-ok` needs `test`', () => {
		const { jobs } = workflowOf('ci.yml')
		const needs = jobs['ci-ok']?.needs

		expect(jobs['test']?.uses).toBe('./.github/workflows/_test.yml')
		expect([needs].flat()).toContain('test')
	})
})
