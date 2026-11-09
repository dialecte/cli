import type { QuestionRecord } from '../src/lib/store/store.types.ts'
import type { InboxLotKind } from './inbox-workspace.types.ts'

/** The repository folders of the two workspaces (the repository name `inbox` and `--repository` match). */
export const SCL_REPOSITORY = 'scl'
export const CORE_REPOSITORY = 'core'

/** The lots of the `scl` workspace by what they are; the index is the name's first four characters. */
export const SCL_LOTS = {
	person: '0171-scl-subscribe',
	caller: '0179-scl-entries',
	ready: '0166-scl-handover',
	failed: '0175-scl-failing',
	working: '0176-scl-busy',
	simulatedWorking: '0177-scl-played',
	committed: '0160-scl-done',
	canceled: '0161-scl-stopped',
} as const satisfies Partial<Record<InboxLotKind, string>>

/** The lots of the `core` workspace; its ready lot holds no registry entry. */
export const CORE_LOTS = {
	person: '0169-core-subscribe',
	caller: '0172-core-entries',
	readyWithoutEntry: '0168-core-result',
	working: '0174-core-busy',
	simulatedQuestion: '0178-core-asked',
} as const satisfies Partial<Record<InboxLotKind, string>>

/** The question a person is asked, and the one a caller is asked. */
export const PERSON_QUESTION: QuestionRecord = {
	id: 'q1',
	audience: 'person',
	station: 'reviewer',
	text: 'R1-2: accept or fix?',
	options: ['accept', 'fix'],
}
export const CALLER_QUESTION: QuestionRecord = {
	id: 'q1',
	audience: 'caller',
	station: 'test-reviewer',
	text: 'keep an existing entry as it is?',
	options: ['keep', 'replace'],
}

/** Why the failed lots failed. */
export const FAILURE_REASON = 'worktree: could not be made'

/** The count line the inbox ends with, `{working}` and `{simulated}` the counts. */
export const COUNT_LINE = 'working {working} · simulated {simulated} (listed with --simulated)'
