/**
 * The cli's workflows: `ci.yml` runs the checks of pull requests and the merge queue, `publish.yml` publishes on the
 * push to main (the workflow file npm trusted publishing names). Both call the same reusables.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows')

/**
 * The triggers and jobs of a workflow file: what it listens to, and each job with the reusable it calls. A file that
 * does not exist has neither.
 */
function readWorkflow(file: string): {
	on: Record<string, unknown>
	jobs: Record<string, { uses?: string }>
} {
	const path = join(WORKFLOWS, file)
	return existsSync(path) ? parse(readFileSync(path, 'utf8')) : { on: {}, jobs: {} }
}

describe('the cli workflows', () => {
	it.each([
		{
			file: 'ci.yml',
			triggers: ['merge_group', 'pull_request', 'workflow_dispatch'],
			jobs: ['build', 'ci-ok', 'install', 'lint', 'test'],
		},
		{
			file: 'publish.yml',
			triggers: ['push'],
			jobs: ['build', 'create-release-tag', 'deploy', 'extract-version', 'install', 'version'],
		},
	])('$file → its triggers and jobs', ({ file, triggers, jobs }) => {
		const workflow = readWorkflow(file)

		expect({
			triggers: Object.keys(workflow.on).sort(),
			jobs: Object.keys(workflow.jobs).sort(),
		}).toEqual({ triggers, jobs })
	})

	it('publish.yml → listens to the push to main only', () => {
		expect(readWorkflow('publish.yml').on).toEqual({ push: { branches: ['main'] } })
	})

	it.each(['ci.yml', 'publish.yml'])(
		'%s → it has jobs, and every one but ci-ok calls a reusable of .github/workflows',
		(file) => {
			const called = Object.entries(readWorkflow(file).jobs).filter(([name]) => name !== 'ci-ok')

			expect({
				jobs: called.length > 0,
				notReusable: called
					.filter(([, job]) => !job.uses?.startsWith('./.github/workflows/_'))
					.map(([name]) => name),
			}).toEqual({ jobs: true, notReusable: [] })
		},
	)
})
