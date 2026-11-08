/** The plan every brief of the tests points to: one heading per step spec. */
export const PLAN_TEXT =
	'# The plan\n\n## 3. Subscribe\n\nSubscribe one data set.\n\n## 4. Unsubscribe\n\nDrop it.\n'

/** The heading line of the plan's first step. */
export const PLAN_HEADING = '## 3. Subscribe'

/** The brief folder, below the workspace's `_commit-plan/`, and the repository folder beside it. */
export const BRIEF_FOLDER = '_commit-plan/lot'
export const REPOSITORY_FOLDER = 'repo'
export const BRIEF_FILE = 'brief.json'
export const PLAN_FILE = 'plan.md'

/** The repository as a brief names it, relative to the brief file's folder. */
export const RELATIVE_REPOSITORY = '../../repo'

/** A brief that passes every check against the scratch workspace (fields as 33S section 5 writes them). */
export const VALID_BRIEF: Readonly<Record<string, unknown>> = {
	schema: 1,
	feature: 'dataflow-subscribe',
	repository: RELATIVE_REPOSITORY,
	branch: 'feat/dataflow-subscribe',
	base: 'main',
	goal: 'One sentence: what the lot delivers.',
	plan: PLAN_FILE,
	scope: ['src/dataflow/', 'src/dataflow/**/*.test.ts'],
	steps: [
		{
			title: 'subscribe one data set',
			spec: PLAN_HEADING,
			behaviours: [
				'a data set with no subscriber -> one ExtRef per attribute',
				'an existing ExtRef -> left as it is',
			],
		},
	],
	lots: [{ paths: ['src/dataflow/'], message: 'feat(dataflow): subscribe a data set' }],
}

/** The files of the scratch repository's one commit. */
export const REPOSITORY_FILES: Readonly<Record<string, string>> = {
	'src/dataflow/subscribe.ts': 'export function subscribe() {}\n',
	'src/index.ts': 'export {}\n',
}
