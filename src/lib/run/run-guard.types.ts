import type {
	OperationCounts,
	RunDocument,
	RunMode,
	RunPreparedTransaction,
	RunProject,
} from './run.types.ts'

/** The staged transaction of a `prepare` run, held until the run reads and discards it. */
export type StagedTransaction = {
	prepared: RunPreparedTransaction
	label: string | null
	/** What the transaction's callback returned - a lifecycle verb's report, when it returned one. */
	report: unknown
}

/** What `createRunGuard` answers: the project and document the script gets, and what it wrote. */
export type RunGuard = {
	project: RunProject
	document: RunDocument
	/** Records written per tag, as each commit merged them (in `prepare` mode, the staged transaction's). */
	operations(): Record<string, OperationCounts>
	/** In `prepare` mode, once the script staged its transaction. */
	staged(): StagedTransaction | undefined
	/** Each write `prepare` mode refused, even one the script caught. */
	refusals: Error[]
}

export type CreateRunGuardParams = {
	project: RunProject
	document: RunDocument
	mode: RunMode
}
