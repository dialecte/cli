import {
	PREPARE_REFUSED_PROJECT_METHODS,
	RUNNER_ONLY_TRANSACTION_METHODS,
} from './run.constants.ts'

import type {
	CreateRunGuardParams,
	GetTrapParams,
	RunGuard,
	StagedTransaction,
	TransactionArguments,
	TransactionCallback,
} from './run-guard.types.ts'
import type { RunDocument, RunPreparedTransaction } from './run.types.ts'
import type { OperationCounts } from '@dialecte/core'

/**
 * Thrown on purpose once a `prepare` run has staged its transaction, to stop the script there: what
 * follows usually reads what the transaction wrote, and nothing was committed.
 */
export class StagedHalt extends Error {
	constructor() {
		super('The script stopped after staging its first transaction.')
		this.name = 'StagedHalt'
	}
}

/**
 * A write the run does not allow: under `--prepare` nothing may be committed and only one transaction
 * is staged; in every mode the runner alone stages and commits a transaction.
 */
export class RunRefusal extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'RunRefusal'
	}
}

/**
 * A proxy's `get` trap, written with one params object: the engine calls a trap with positional arguments, taken
 * here as one rest list.
 */
function getTrap<GenericTarget extends object>(
	read: (params: GetTrapParams<GenericTarget>) => unknown,
): ProxyHandler<GenericTarget> {
	return {
		get: function trap(...trapArguments: [GenericTarget, string | symbol, unknown]): unknown {
			return read({
				target: trapArguments[0],
				propertyName: trapArguments[1],
				receiver: trapArguments[2],
			})
		},
	}
}

/**
 * The project and document a script runs against, unchanged but for their writes. Every
 * transaction goes through `doc.prepare` and its public `operations` and `summary`:
 * - `commit` mode: `doc.transaction` prepares then commits and answers the callback's result; a
 *   prepared transaction the script commits itself is counted too. Writes through another document
 *   the script opens are not counted.
 * - `prepare` mode: the first `doc.transaction` is staged and held, and the script stops there.
 *   Committing anything (a second transaction, a prepared transaction's `commit()`, a transaction on
 *   a document opened through the project) and the project's own writes (import, remove, undo, ...)
 *   are refused, and each refusal is kept even when the script catches it.
 */
export function createRunGuard(params: CreateRunGuardParams): RunGuard {
	const { mode } = params
	const counts = new Map<string, OperationCounts>()
	const refusals: Error[] = []
	let staged: StagedTransaction | undefined

	function count(prepared: RunPreparedTransaction): void {
		for (const [tagName, tagCounts] of Object.entries(prepared.summary.byTag)) {
			const total = counts.get(tagName) ?? { created: 0, updated: 0, deleted: 0 }
			total.created += tagCounts.created
			total.updated += tagCounts.updated
			total.deleted += tagCounts.deleted
			counts.set(tagName, total)
		}
	}

	function refuseWith(message: string): never {
		const refusal = new RunRefusal(message)
		refusals.push(refusal)
		throw refusal
	}

	function refuse(what: string): never {
		return refuseWith(`--prepare commits nothing: ${what} is refused`)
	}

	/**
	 * The transaction a script's callback gets: the real one, but for the methods only the runner may
	 * call - committing it, finishing its staging, dropping what it staged.
	 */
	function guardTransaction(transaction: unknown): unknown {
		return new Proxy(
			transaction as object,
			getTrap(({ target, propertyName, receiver }) => {
				if (typeof propertyName === 'string' && RUNNER_ONLY_TRANSACTION_METHODS.has(propertyName))
					return function refuseRunnerOnly() {
						refuseWith(
							`tx.${propertyName} is refused: the runner stages and commits each transaction`,
						)
					}
				const value: unknown = Reflect.get(target, propertyName, receiver)
				return typeof value === 'function' ? value.bind(target) : value
			}),
		)
	}

	/** The script's callback, run on the guarded transaction. */
	function onGuardedTransaction(callback: TransactionCallback): TransactionCallback {
		return function runOnGuarded(transaction: unknown): Promise<unknown> {
			return callback(guardTransaction(transaction))
		}
	}

	/** A prepared transaction whose `commit()` is counted, or refused in `prepare` mode. */
	function guardPrepared(prepared: RunPreparedTransaction): RunPreparedTransaction {
		return new Proxy(
			prepared,
			getTrap(({ target, propertyName, receiver }) => {
				if (propertyName === 'commit')
					return async function commitCounted(): Promise<void> {
						if (mode === 'prepare') refuse('committing a prepared transaction')
						await target.commit()
						count(target)
					}
				return Reflect.get(target, propertyName, receiver)
			}),
		)
	}

	function guardDocument(guarded: { document: RunDocument; isRunDocument: boolean }): RunDocument {
		const { document, isRunDocument } = guarded

		async function prepareGuarded(
			...[callback, options]: TransactionArguments
		): Promise<RunPreparedTransaction> {
			const prepared = await document.prepare(onGuardedTransaction(callback), options)
			return guardPrepared(prepared)
		}

		async function transactCounted(...[callback, options]: TransactionArguments): Promise<unknown> {
			let result: unknown
			const prepared = await document.prepare(async function keepResult(transaction) {
				result = await onGuardedTransaction(callback)(transaction)
			}, options)
			await prepared.commit()
			count(prepared)
			return result
		}

		async function stageAndHalt(...[callback, options]: TransactionArguments): Promise<never> {
			if (!isRunDocument) refuse('a transaction on a document opened through the project')
			if (staged) refuse('a second transaction once the first is staged')
			let report: unknown
			const prepared = await document.prepare(async function keepReport(transaction) {
				report = await onGuardedTransaction(callback)(transaction)
			}, options)
			staged = { prepared, label: options?.label ?? null, report }
			count(prepared)
			throw new StagedHalt()
		}

		return new Proxy(
			document,
			getTrap(({ target, propertyName, receiver }) => {
				if (propertyName === 'transaction')
					return mode === 'commit' ? transactCounted : stageAndHalt
				if (propertyName === 'prepare') return prepareGuarded
				if (mode === 'prepare' && propertyName === 'destroy')
					return function refuseDestroy() {
						refuse('destroying the project')
					}
				const value: unknown = Reflect.get(target, propertyName, receiver)
				return typeof value === 'function' ? value.bind(target) : value
			}),
		)
	}

	const document = guardDocument({ document: params.document, isRunDocument: true })
	const project =
		mode === 'commit'
			? params.project
			: new Proxy(
					params.project,
					getTrap(({ target, propertyName, receiver }) => {
						if (propertyName === 'openDocument')
							return function openGuarded(documentId: string): RunDocument {
								return guardDocument({
									document: target.openDocument(documentId),
									isRunDocument: false,
								})
							}
						if (
							typeof propertyName === 'string' &&
							PREPARE_REFUSED_PROJECT_METHODS.has(propertyName)
						)
							return function refuseProjectWrite() {
								refuse(`project.${propertyName}`)
							}
						const value: unknown = Reflect.get(target, propertyName, receiver)
						return typeof value === 'function' ? value.bind(target) : value
					}),
				)

	return {
		project,
		document,
		operations: function sortedCounts() {
			return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)))
		},
		staged: function readStaged() {
			return staged
		},
		refusals,
	}
}
