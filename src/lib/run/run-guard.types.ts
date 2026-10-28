import type { RunDocument, RunMode, RunPreparedTransaction, RunProject } from './run.types.ts'
import type { OperationCounts } from '@dialecte/core'

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

/** The script's callback of a transaction: it gets the transaction. */
export type TransactionCallback = (transaction: unknown) => Promise<unknown>

export type TransactionOptions = { label?: string }

/** What `doc.transaction` and `doc.prepare` take, in order. */
export type TransactionArguments = [callback: TransactionCallback, options?: TransactionOptions]

/** What a proxy's `get` trap reads: the target, the property asked for, and the receiver. */
export type GetTrapParams<GenericTarget extends object> = {
	target: GenericTarget
	propertyName: string | symbol
	receiver: unknown
}
