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
		workflow_call?: {
			inputs?: Record<string, { required?: boolean; type?: string }>
			outputs?: Record<string, { description?: string }>
		}
	}
	jobs: Record<
		string,
		{
			uses?: string
			'runs-on'?: string
			needs?: string[]
			if?: string
			with?: Record<string, string>
			permissions?: Record<string, string>
			steps?: { run?: string; env?: Record<string, string> }[]
		}
	>
	concurrency?: unknown
} {
	const path = join(WORKFLOWS, file)
	return existsSync(path) ? parse(readFileSync(path, 'utf8')) : { on: {}, jobs: {} }
}

describe('the cli workflows', () => {
	it.each([
		{
			file: 'ci.yml',
			triggers: ['merge_group', 'pull_request', 'workflow_dispatch'],
			jobs: ['build', 'check', 'ci-ok', 'install', 'test'],
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

	it('publish.yml → no concurrency group, so a pending run (maybe the version-changing push) is never replaced by a later one', () => {
		expect(readWorkflow('publish.yml').concurrency).toBeUndefined()
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

	it('publish.yml → deploy needs build and version and runs on publish; the tag job needs deploy and runs on tag, never after a failure', () => {
		const { deploy, 'create-release-tag': tag } = readWorkflow('publish.yml').jobs

		expect({
			deployNeeds: [...(deploy?.needs ?? [])].sort(),
			deployIf: deploy?.if,
			deployDistTag: deploy?.with?.['dist-tag'],
			tagNeedsDeploy: tag?.needs?.includes('deploy'),
			tagIf: tag?.if,
		}).toEqual({
			deployNeeds: ['build', 'version'],
			deployIf: "needs.version.outputs.publish == 'true'",
			deployDistTag: '${{ needs.version.outputs.dist_tag }}',
			tagNeedsDeploy: true,
			tagIf: "${{ !cancelled() && !failure() && needs.version.outputs.tag == 'true' }}",
		})
	})

	it('_publish.yml → id-token write, publishes under the dist-tag it is given, passed through env', () => {
		const workflow = readWorkflow('_publish.yml')
		const publishStep = (workflow.jobs.publish?.steps ?? []).find((step) =>
			step.run?.startsWith('npm publish'),
		)

		expect({
			idToken: workflow.jobs.publish?.permissions?.['id-token'],
			distTagInput: workflow.on.workflow_call?.inputs?.['dist-tag'],
			run: publishStep?.run?.trim(),
			env: publishStep?.env,
		}).toEqual({
			idToken: 'write',
			distTagInput: { required: true, type: 'string' },
			run: 'npm publish --access public --tag "$DIST_TAG"',
			env: { DIST_TAG: '${{ inputs.dist-tag }}' },
		})
	})

	it.each(['_publish.yml', '_tag-release.yml'])(
		'_publish.yml and _tag-release.yml → workflow_call only, no workflow_dispatch: %s',
		(file) => {
			expect(Object.keys(readWorkflow(file).on)).toEqual(['workflow_call'])
		},
	)

	it('_check-npm-version.yml → runs the decision through the cli from its sources, no 2>/dev/null', () => {
		const script = (readWorkflow('_check-npm-version.yml').jobs.check?.steps ?? [])
			.map((step) => step.run ?? '')
			.join('\n')

		expect({
			runsDecision: script.includes('node src/cli.ts ci publish-decision'),
			hidesErrors: script.includes('2>/dev/null'),
		}).toEqual({ runsDecision: true, hidesErrors: false })
	})

	it('publish.yml → its header says npm trusted publishing names the file: never renamed, its trigger kept', () => {
		const header = readFileSync(join(WORKFLOWS, 'publish.yml'), 'utf8')
			.split('\n')
			.filter((line) => line.startsWith('#'))
			.join(' ')

		expect({
			namesTrustedPublishing: header.includes('npm trusted publishing names this file'),
			neverRenamed: header.includes('never rename it'),
		}).toEqual({ namesTrustedPublishing: true, neverRenamed: true })
	})

	it('_check.yml → runs the package check, the released changelog check and the code rules against the base the change goes onto, the skills check, then ci check through the cli from its sources', () => {
		const runs = (readWorkflow('_check.yml').jobs.check?.steps ?? []).flatMap((step) =>
			step.run === undefined ? [] : [step.run.trim()],
		)

		expect(runs).toEqual([
			'npm run check',
			'git fetch --depth=1 origin "$BASE"',
			'node src/cli.ts changelog check --base "$BASE"',
			'node src/cli.ts rules --base "$BASE"',
			'npm run skills:check',
			'node src/cli.ts ci check',
		])
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
