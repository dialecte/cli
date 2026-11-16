/**
 * The cli's workflows: `ci.yml` runs the checks of pull requests and the merge queue, `publish.yml` publishes on the
 * push to main (the workflow file npm trusted publishing names). Both call the same reusables.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows')

/**
 * The triggers and jobs of a workflow file: what it listens to, and each job with the reusable it calls. A file that
 * does not exist has neither.
 */
function readWorkflow(file: string): {
	on: Record<string, unknown> & {
		workflow_call?: { outputs?: Record<string, { description?: string }> }
	}
	jobs: Record<string, { uses?: string; 'runs-on'?: string; steps?: { run?: string }[] }>
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

	describe('_check-npm-version.yml', () => {
		const workflow = readWorkflow('_check-npm-version.yml')
		const script = (workflow.jobs.check?.steps ?? []).map((step) => step.run ?? '').join('\n')

		it('→ reads the version before the push from the commit the push started from, not npm latest', () => {
			expect({
				fetchesBefore: script.includes('git fetch --depth=1 origin "${{ github.event.before }}"'),
				readsBeforePackage: script.includes('git show "${{ github.event.before }}:package.json"'),
				readsNpmLatest: script.includes('npm view "$PACKAGE_NAME" version'),
			}).toEqual({ fetchesBefore: true, readsBeforePackage: true, readsNpmLatest: false })
		})

		it('→ asks npm for the exact current version, so a version npm has is never published again', () => {
			expect(script).toContain('npm view "$PACKAGE_NAME@$CURRENT_VERSION" version')
		})

		it('→ version_changed=true only when the push changed the version and npm lacks it, and its description says so', () => {
			expect({
				condition: script.includes(
					'if [ "$PREVIOUS_VERSION" != "$CURRENT_VERSION" ] && [ "$PUBLISHED_VERSION" != "$CURRENT_VERSION" ]; then',
				),
				description: workflow.on.workflow_call?.outputs?.version_changed?.description,
			}).toEqual({
				condition: true,
				description: 'Whether this push changed the package version and npm does not have it yet',
			})
		})
	})

	it('every job of every workflow file → a pinned runner image, never *-latest', () => {
		const files = readdirSync(WORKFLOWS).filter((file) => file.endsWith('.yml'))
		const unpinned = files.flatMap((file) =>
			Object.entries(readWorkflow(file).jobs)
				.filter(
					([, job]) =>
						job['runs-on'] !== undefined && !/^(ubuntu|windows)-\d+(\.\d+)?$/.test(job['runs-on']),
				)
				.map(([name, job]) => `${file} ${name}: ${job['runs-on']}`),
		)

		expect({ files: files.length > 0, unpinned }).toEqual({ files: true, unpinned: [] })
	})
})
