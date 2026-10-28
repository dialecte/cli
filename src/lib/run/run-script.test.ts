import { loadTestEnvironment, testFile } from '../../../test/run/run-environment.ts'
import { runScript } from './run-script.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type {
	RunEnvironment,
	RunOutcome,
	RunProject,
	RunScript,
	RunScriptParams,
} from './run.types.ts'

/** Minimal views of the Document and Transaction the test scripts drive (core's test dialecte). */
type TestRecord = { tagName: string; id: string }
type TestTransaction = {
	addChild(
		parent: TestRecord,
		child: { tagName: string; attributes: Record<string, string> },
	): Promise<TestRecord>
	update(record: TestRecord, params: { attributes: Record<string, string> }): Promise<TestRecord>
	delete(record: TestRecord): Promise<unknown>
	commit(): Promise<void>
	finishStaging(): Promise<void>
	clearStagedOperations(): void
}
type TestPrepared = { commit(): Promise<void> }
type TestDocument = {
	query: {
		getRoot(): Promise<TestRecord>
		findByAttributes(params: {
			tagName: string
			attributes: Record<string, string>
		}): Promise<TestRecord[]>
	}
	transaction<Result>(callback: (tx: TestTransaction) => Promise<Result>): Promise<Result>
	prepare(callback: (tx: TestTransaction) => Promise<void>): Promise<TestPrepared>
}
type TestProject = {
	openDocument(documentId: string): TestDocument
	importFile(file: File): Promise<unknown>
}

/** The A of the input. */
async function findAssembly(document: TestDocument): Promise<TestRecord> {
	const [assembly] = await document.query.findByAttributes({
		tagName: 'A',
		attributes: { aA: 'A' },
	})
	return assembly
}

/** Adds an AA_2 under the A: the transaction body the guard cases try. */
async function addAa2(params: { tx: TestTransaction; assembly: TestRecord; value: string }) {
	const { tx, assembly, value } = params
	await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: value } })
}
type TestUtils = { invariant(condition: unknown, params: Record<string, unknown>): void }

/** One assembly A holding its AA_1 and two AA_2. */
const INPUT_BODY =
	'<A aA="A"><AA_1 aAA_1="one"><AAA_1 aAAA_1="abc"/></AA_1><AA_2 aAA_2="5"/><AA_2 aAA_2="6"/></A>'

let environment: RunEnvironment

beforeAll(async () => {
	environment = await loadTestEnvironment()
})

function run(
	params: Partial<RunScriptParams> & { script: RunScript },
): Promise<{ outcome: RunOutcome }> {
	const { script, ...rest } = params
	return runScript({
		environment,
		seed: 0,
		timeoutInMilliseconds: 10_000,
		input: testFile({ body: INPUT_BODY }),
		...rest,
		loadScript: async () => script,
		// a case without a mode runs as the command does by default
		mode: params.mode ?? 'commit',
	})
}

/** The environment, its project counting the committed records of a few tags as it closes. */
function countingCommittedRecords(params: {
	environment: RunEnvironment
	committed: Record<string, number>
}): RunEnvironment {
	const { environment, committed } = params
	return {
		...environment,
		createProject: function createCountingProject(): RunProject {
			const project = environment.createProject()
			let documentId: string | undefined

			async function countCommitted(): Promise<void> {
				if (!documentId) return
				const query = project.openDocument(documentId).query as unknown as {
					getRecordsByTagName(tagName: string): Promise<TestRecord[]>
				}
				for (const tagName of ['A', 'AA_1', 'AA_2'])
					committed[tagName] = (await query.getRecordsByTagName(tagName)).length
			}

			const counting: RunProject = {
				open: async (name) => {
					await project.open(name)
					return counting
				},
				initEmptyDocument: async () => {
					documentId = await project.initEmptyDocument()
					return documentId
				},
				importFile: async (file) => {
					const imported = await project.importFile(file)
					documentId = imported.documentId
					return imported
				},
				openDocument: (id) => project.openDocument(id),
				export: (exportParams) => project.export(exportParams),
				destroy: async () => {
					await countCommitted()
					await project.destroy()
				},
			}
			return counting
		},
	}
}

describe('runScript', () => {
	type TestCase = {
		script: RunScript
		mode?: RunScriptParams['mode']
		expectations?: RunScriptParams['expectations']
		now?: Date
		/** `committed`: records per tag the store holds once the script ran, read before the project closes. */
		expected: (outcome: RunOutcome, committed: Record<string, number>) => void
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'script that throws a DialecteError → outcome.error has code, key and element path': {
			script: async function rejectSecondAa2({ doc, utils }) {
				const document = doc as unknown as TestDocument
				const [second] = await document.query.findByAttributes({
					tagName: 'AA_2',
					attributes: { aAA_2: '6' },
				})
				;(utils as unknown as TestUtils).invariant(false, {
					key: 'UNIQUE_CONSTRAINT_VIOLATION',
					detail: 'aAA_2 6 is taken',
					ref: { tagName: second.tagName, id: second.id },
					meta: { value: '6' },
				})
			},
			expected(outcome) {
				expect(outcome.ok).toBe(false)
				expect(outcome.error).toMatchObject({
					code: 'D3005',
					key: 'UNIQUE_CONSTRAINT_VIOLATION',
					detail: 'aAA_2 6 is taken',
					path: '/Root/A/AA_2[2]',
					meta: { value: '6' },
				})
			},
		},
		'--prepare → operations listed, nothing committed': {
			mode: 'prepare',
			script: async function addAa2({ doc }) {
				const document = doc as unknown as TestDocument
				const [assembly] = await document.query.findByAttributes({
					tagName: 'A',
					attributes: { aA: 'A' },
				})
				await document.transaction(async (tx) => {
					await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: '7' } })
					return { added: 'AA_2' }
				})
				throw new Error('never reached: the run stops once the transaction is staged')
			},
			expected(outcome, committed) {
				expect(outcome.ok).toBe(true)
				expect(outcome.operations).toEqual({
					A: { created: 0, updated: 1, deleted: 0 },
					AA_2: { created: 1, updated: 0, deleted: 0 },
				})
				expect(outcome.prepared).toEqual({ label: null, report: { added: 'AA_2' } })
				expect(committed.AA_2).toBe(2)
			},
		},
		'expectation not met → ok false, the failure named with its count': {
			script: async function addNothing() {},
			expectations: [
				{ tag: 'AA_2', under: { tag: 'A' }, count: 3 },
				{ tag: 'AAA_1', under: { tag: 'AA_1' } },
			],
			expected(outcome) {
				expect(outcome.ok).toBe(false)
				expect(outcome.error).toBeUndefined()
				expect(outcome.expectations).toEqual({
					passed: 1,
					failed: [
						{
							expectation: { tag: 'AA_2', under: { tag: 'A' }, count: 3 },
							actualCount: 2,
							message: 'expected 3 AA_2 under A, found 2',
						},
					],
				})
			},
		},
		'--prepare with expectations → checked on what the commit would write': {
			mode: 'prepare',
			script: async function addAa2({ doc }) {
				const document = doc as unknown as TestDocument
				const [assembly] = await document.query.findByAttributes({
					tagName: 'A',
					attributes: { aA: 'A' },
				})
				await document.transaction(async (tx) => {
					await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: '7' } })
				})
			},
			expectations: [{ tag: 'AA_2', where: { aAA_2: '7' }, count: 1 }],
			expected(outcome, committed) {
				expect(outcome.expectations).toEqual({ passed: 1, failed: [] })
				expect(outcome.prepared).toEqual({ label: null })
				expect(committed.AA_2).toBe(2)
			},
		},
		'plain Error → its message, no code': {
			script: async function failPlainly() {
				throw new Error('the script gave up')
			},
			expected(outcome) {
				expect(outcome.ok).toBe(false)
				expect(outcome.error).toEqual({ message: 'the script gave up' })
			},
		},
		'now given → the script reads the frozen time': {
			now: new Date('2026-01-02T03:04:05.000Z'),
			script: async function readClock() {
				return { now: Date.now(), date: new Date().toISOString() }
			},
			expected(outcome) {
				expect(outcome.result).toEqual({
					now: Date.parse('2026-01-02T03:04:05.000Z'),
					date: '2026-01-02T03:04:05.000Z',
				})
			},
		},
		'2 AA_2 and an AAA_1 added, one AA_2 updated → one count per record': {
			script: async function addAndUpdate({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				await document.transaction(async (tx) => {
					const first = await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: '7' } })
					await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: '8' } })
					await tx.addChild(first, { tagName: 'AAA_1', attributes: { aAAA_1: 'xyz' } })
					await tx.update(first, { attributes: { bAA_2: 'changed' } })
				})
			},
			expected(outcome, committed) {
				expect(outcome.operations).toEqual({
					A: { created: 0, updated: 1, deleted: 0 },
					AA_2: { created: 2, updated: 0, deleted: 0 },
					AAA_1: { created: 1, updated: 0, deleted: 0 },
				})
				expect(committed).toEqual({ A: 1, AA_1: 1, AA_2: 4 })
			},
		},
		'commit mode, the script commits its own prepared transaction → counted': {
			script: async function prepareThenCommit({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				const prepared = await document.prepare((tx) => addAa2({ tx, assembly, value: '7' }))
				await prepared.commit()
			},
			expected(outcome, committed) {
				expect(outcome.ok).toBe(true)
				expect(outcome.operations.AA_2).toEqual({ created: 1, updated: 0, deleted: 0 })
				expect(committed.AA_2).toBe(3)
			},
		},
		'--prepare, the script catches the halt and starts a second transaction → refused, the first kept':
			{
				mode: 'prepare',
				script: async function secondTransaction({ doc }) {
					const document = doc as unknown as TestDocument
					const assembly = await findAssembly(document)
					try {
						await document.transaction((tx) => addAa2({ tx, assembly, value: '7' }))
					} catch {
						// the halt, caught
					}
					try {
						await document.transaction((tx) => addAa2({ tx, assembly, value: '8' }))
					} catch {
						// the refusal, caught too: it still counts
					}
				},
				expectations: [{ tag: 'AA_2', where: { aAA_2: ['7', '8'] } }],
				expected(outcome, committed) {
					expect(outcome.ok).toBe(false)
					expect(outcome.error).toEqual({
						message:
							'--prepare commits nothing: a second transaction once the first is staged is refused',
					})
					expect(outcome.operations.AA_2).toEqual({ created: 1, updated: 0, deleted: 0 })
					expect(outcome.expectations).toEqual({ passed: 1, failed: [] })
					expect(committed.AA_2).toBe(2)
				},
			},
		'--prepare, the script commits its own prepared transaction → refused, nothing committed': {
			mode: 'prepare',
			script: async function prepareThenCommit({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				const prepared = await document.prepare((tx) => addAa2({ tx, assembly, value: '7' }))
				await prepared.commit()
			},
			expected(outcome, committed) {
				expect(outcome.error?.message).toBe(
					'--prepare commits nothing: committing a prepared transaction is refused',
				)
				expect(committed.AA_2).toBe(2)
			},
		},
		'--prepare, a transaction on a document opened through the project → refused': {
			mode: 'prepare',
			script: async function writeAround({ project, documentId }) {
				const document = (project as unknown as TestProject).openDocument(documentId)
				const assembly = await findAssembly(document)
				await document.transaction((tx) => addAa2({ tx, assembly, value: '7' }))
			},
			expected(outcome, committed) {
				expect(outcome.error?.message).toBe(
					'--prepare commits nothing: a transaction on a document opened through the project is refused',
				)
				expect(committed.AA_2).toBe(2)
			},
		},
		'--prepare, an import through the project → refused': {
			mode: 'prepare',
			script: async function importAnother({ project }) {
				await (project as unknown as TestProject).importFile(testFile({ body: '<A aA="B"/>' }))
			},
			expected(outcome) {
				expect(outcome.error?.message).toBe(
					'--prepare commits nothing: project.importFile is refused',
				)
			},
		},
		'a real delete of the root → PROTECTED_ROOT, no path and why': {
			script: async function deleteRoot({ doc }) {
				const document = doc as unknown as TestDocument
				const root = await document.query.getRoot()
				await document.transaction((tx) => tx.delete(root))
			},
			expected(outcome) {
				expect(outcome.error).toMatchObject({ code: 'D3003', key: 'PROTECTED_ROOT' })
				expect(outcome.error?.path).toBeUndefined()
				expect(outcome.error?.pathNote).toBe('the error names no element')
			},
		},
		'a real tag mismatch → the path of the element the id names': {
			script: async function readUnderAnotherTag({ doc }) {
				const document = doc as unknown as TestDocument & {
					query: { getRecord(ref: TestRecord): Promise<unknown> }
				}
				const [second] = await document.query.findByAttributes({
					tagName: 'AA_2',
					attributes: { aAA_2: '6' },
				})
				await document.query.getRecord({ tagName: 'AA_1', id: second.id })
			},
			expected(outcome) {
				expect(outcome.error).toMatchObject({
					code: 'D2004',
					key: 'ELEMENT_TAGNAME_MISMATCH',
					path: '/Root/A/AA_2[2]',
				})
			},
		},
		'a cyclic result → given as text with a note, the outcome still JSON': {
			script: async function returnCycle() {
				const cycle: Record<string, unknown> = { name: 'loop' }
				cycle.self = cycle
				return cycle
			},
			expected(outcome) {
				expect(outcome.result).toBe('[object Object]')
				expect(outcome.resultNote).toMatch(/^not JSON \(.*circular.*\), given as text$/i)
				expect(() => JSON.stringify(outcome)).not.toThrow()
			},
		},
		'a BigInt result → given as text with a note': {
			script: async function returnBigInt() {
				return 12n
			},
			expected(outcome) {
				expect(outcome.result).toBe('12')
				expect(outcome.resultNote).toMatch(/^not JSON \(.*BigInt.*\), given as text$/)
			},
		},
		'--prepare, tx.commit() inside the callback → refused, nothing committed': {
			mode: 'prepare',
			script: async function callInternal({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				await document.transaction(async (tx) => {
					await addAa2({ tx, assembly, value: '7' })
					try {
						await tx.commit()
					} catch {
						// caught: the refusal still counts
					}
				})
			},
			expected(outcome, committed) {
				expect(outcome.ok).toBe(false)
				expect(outcome.error?.message).toBe(
					'tx.commit is refused: the runner stages and commits each transaction',
				)
				expect(committed.AA_2).toBe(2)
			},
		},
		'--prepare, tx.finishStaging() inside the callback → refused, nothing committed': {
			mode: 'prepare',
			script: async function callInternal({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				await document.transaction(async (tx) => {
					await addAa2({ tx, assembly, value: '7' })
					try {
						await tx.finishStaging()
					} catch {
						// caught: the refusal still counts
					}
				})
			},
			expected(outcome, committed) {
				expect(outcome.ok).toBe(false)
				expect(outcome.error?.message).toBe(
					'tx.finishStaging is refused: the runner stages and commits each transaction',
				)
				expect(committed.AA_2).toBe(2)
			},
		},
		'--prepare, tx.clearStagedOperations() inside the callback → refused, nothing committed': {
			mode: 'prepare',
			script: async function callInternal({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				await document.transaction(async (tx) => {
					await addAa2({ tx, assembly, value: '7' })
					try {
						await tx.clearStagedOperations()
					} catch {
						// caught: the refusal still counts
					}
				})
			},
			expected(outcome, committed) {
				expect(outcome.ok).toBe(false)
				expect(outcome.error?.message).toBe(
					'tx.clearStagedOperations is refused: the runner stages and commits each transaction',
				)
				expect(committed.AA_2).toBe(2)
			},
		},
		'commit mode, tx.commit() inside the callback → refused': {
			script: async function commitInside({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				await document.transaction(async (tx) => {
					await addAa2({ tx, assembly, value: '7' })
					await tx.commit()
				})
			},
			expected(outcome, committed) {
				expect(outcome.error?.message).toBe(
					'tx.commit is refused: the runner stages and commits each transaction',
				)
				expect(committed.AA_2).toBe(2)
			},
		},
		'a nested doc.transaction → CONCURRENT_TRANSACTION, nothing of either committed': {
			script: async function nested({ doc }) {
				const document = doc as unknown as TestDocument
				const assembly = await findAssembly(document)
				await document.transaction(async (tx) => {
					await addAa2({ tx, assembly, value: '7' })
					await document.transaction((innerTx) => addAa2({ tx: innerTx, assembly, value: '8' }))
				})
			},
			expected(outcome, committed) {
				expect(outcome.error).toMatchObject({ code: 'D4004', key: 'CONCURRENT_TRANSACTION' })
				expect(outcome.operations).toEqual({})
				expect(committed.AA_2).toBe(2)
			},
		},
		'--prepare, project.getDatabaseInstance() → refused': {
			mode: 'prepare',
			script: async function reachTheStore({ project }) {
				;(project as unknown as { getDatabaseInstance(): unknown }).getDatabaseInstance()
			},
			expected(outcome) {
				expect(outcome.error?.message).toBe(
					'--prepare commits nothing: project.getDatabaseInstance is refused',
				)
			},
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		const declare = testCase.only ? it.only : it
		declare(description, async () => {
			const committed: Record<string, number> = {}
			const { outcome } = await run({
				script: testCase.script,
				mode: testCase.mode,
				expectations: testCase.expectations,
				now: testCase.now,
				environment: countingCommittedRecords({ environment, committed }),
			})
			testCase.expected(outcome, committed)
		})
	}
})

describe('runScript - ids and clock put back', () => {
	type TestCase = { script: RunScript; timeoutInMilliseconds?: number; expectedMessage: string }

	const testCases: Record<string, TestCase> = {
		'after a throw': {
			script: async function failPlainly() {
				throw new Error('the script gave up')
			},
			expectedMessage: 'the script gave up',
		},
		'after a timeout': {
			script: function neverEnds() {
				return new Promise<never>(() => undefined)
			},
			timeoutInMilliseconds: 50,
			expectedMessage: 'the script ran longer than 50 ms',
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const realRandomUuid = globalThis.crypto.randomUUID
			const RealDate = globalThis.Date
			const { outcome } = await run({
				script: testCase.script,
				now: new Date('2026-01-02T03:04:05.000Z'),
				timeoutInMilliseconds: testCase.timeoutInMilliseconds ?? 10_000,
			})
			expect(outcome.error?.message).toBe(testCase.expectedMessage)
			expect(globalThis.crypto.randomUUID).toBe(realRandomUuid)
			expect(globalThis.Date).toBe(RealDate)
		})
	}
})

describe('runScript - determinism', () => {
	/** Adds an AA_2 and answers the id it was given. */
	async function addAa2({ doc }: Parameters<RunScript>[0]): Promise<string> {
		const document = doc as unknown as TestDocument
		const [assembly] = await document.query.findByAttributes({
			tagName: 'A',
			attributes: { aA: 'A' },
		})
		return document.transaction(async (tx) => {
			const added = await tx.addChild(assembly, { tagName: 'AA_2', attributes: { aAA_2: '7' } })
			return added.id
		})
	}

	async function runTwice(params: { seeds: [number, number]; now?: Date }) {
		const runs = []
		for (const seed of params.seeds) {
			const { outcome, file } = await runScript({
				loadScript: async () => addAa2,
				environment,
				mode: 'commit',
				seed,
				now: params.now,
				timeoutInMilliseconds: 10_000,
				input: testFile({ body: INPUT_BODY }),
				exportDocument: true,
			})
			const xml = await file?.text()
			runs.push({ outcome, xml })
		}
		return runs
	}

	it('same script, same seed → identical outcome', async () => {
		const [first, second] = await runTwice({ seeds: [3, 3] })
		expect(first.outcome.ok).toBe(true)
		expect(first.outcome.operations).toEqual({
			A: { created: 0, updated: 1, deleted: 0 },
			AA_2: { created: 1, updated: 0, deleted: 0 },
		})
		expect(second).toEqual(first)
	})

	it('another seed → other ids', async () => {
		const [first, second] = await runTwice({ seeds: [3, 4] })
		expect(second.outcome.result).not.toEqual(first.outcome.result)
	})
})
