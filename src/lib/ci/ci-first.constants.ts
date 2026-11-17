/** What makes a repository CI-first, and the refusal a hand-over verb answers there. */
import { WORKFLOWS_FOLDER } from './ci-template.constants.ts'

/** The workflow the merge queue runs: the template's `ci.yml`, the path `dialecte ci sync` manages. */
export const CI_WORKFLOW_PATH = `${WORKFLOWS_FOLDER}/ci.yml`

/** The trigger the merge queue runs the workflow on. */
export const MERGE_QUEUE_TRIGGER = 'merge_group'

/** The job the queue's ruleset requires. */
export const REQUIRED_CHECK_JOB = 'ci-ok'

/** `handover <verb>` in a CI-first repository: `{verb}` the verb, `{root}` the repository. */
export const CI_FIRST_HANDOVER_REFUSAL = `handover {verb}: {root} is CI-first (${CI_WORKFLOW_PATH} runs on ${MERGE_QUEUE_TRIGGER} and holds the ${REQUIRED_CHECK_JOB} job): a lot lands through its pull request, never a hand-over; commit on the lot branch through the hook, then lot land <id> --draft; nothing written`
