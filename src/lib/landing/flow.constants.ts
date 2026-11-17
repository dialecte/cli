/** How a repository's lots land, and what each flow decides: the one place the two flows differ. */
import { WORKFLOWS_FOLDER } from '../ci/ci-template.constants.ts'

/** The workflow the merge queue runs: the template's `ci.yml`, the path `dialecte ci sync` manages. */
export const CI_WORKFLOW_PATH = `${WORKFLOWS_FOLDER}/ci.yml`

/** The trigger the merge queue runs the workflow on. */
export const MERGE_QUEUE_TRIGGER = 'merge_group'

/** The job the queue's ruleset requires. */
export const REQUIRED_CHECK_JOB = 'ci-ok'

/**
 * Per flow, a working lot's manual next line (`{name}` the lot's full name) and the verbs it refuses (`<command>
 * <verb>`): a CI-first repository lands through `lot land`, never a hand-over; a hand-over repository the reverse.
 */
export const LANDING_FLOWS = {
	'ci-first': {
		manualNext: 'run the stations, then dialecte lot land {name} --draft',
		refused: ['handover write', 'handover run'],
	},
	'hand-over': {
		manualNext: 'run the stations, then dialecte handover write <lots.json> --out {name}',
		refused: ['lot land', 'lot approve'],
	},
} as const

/** A verb a flow refuses: `{command}` and `{verb}` the refused call, `{root}` the repository, `{why}` the flow's reason. */
export const FLOW_REFUSAL = '{command} {verb}: {root} {why}; nothing written'

/** Why each flow refuses its verbs. */
export const FLOW_REFUSAL_WHY = {
	'ci-first': `is CI-first (${CI_WORKFLOW_PATH} runs on ${MERGE_QUEUE_TRIGGER} and holds the ${REQUIRED_CHECK_JOB} job): a lot lands through its pull request, never a hand-over; commit on the lot branch through the hook, then lot land <id> --draft`,
	'hand-over': `lands through a hand-over (no ${CI_WORKFLOW_PATH} running on ${MERGE_QUEUE_TRIGGER} with a ${REQUIRED_CHECK_JOB} job): run the stations, then handover write <lots.json>`,
} as const
