import type {
	RUNNER_WITH_EXPORT,
	RUNNER_WITHOUT_EXPORT,
} from './check-test-shape-rules.constants.ts'
import type ts from 'typescript'

/** The mode of a runner call: `withExport` checks the exported XML with the case's queries. */
export type RunnerMode = typeof RUNNER_WITH_EXPORT | typeof RUNNER_WITHOUT_EXPORT | undefined

/** One case of a table: its key (a property name or an assignment key), its title and its value. */
export type TableCase = {
	key: ts.Node
	/** The key's text (a template key: its literal head); undefined for a key that is not written out. */
	title: string | undefined
	value: ts.Expression
}

/** The cases of a table: an object literal and the `<table>[<key>] = {...}` assignments to it. */
export type TestTable = {
	cases: readonly TableCase[]
}

/** A runner call (`runTestCases.withExport({ testCases, act })`), with its table and act resolved in the file. */
export type RunnerCall = {
	node: ts.CallExpression
	mode: RunnerMode
	table: TestTable | undefined
	act: ts.FunctionLikeDeclaration | undefined
}

/**
 * How a per-case function reads its case: the paths that hold the case (`testCase`, `params.testCase`, `row`),
 * whose fields are case fields, and the names bound to a case field (`const { nested } = testCase`).
 */
export type CaseBinding = {
	roots: readonly string[]
	fields: readonly string[]
}

/** An act or a per-case callback, with how it reads its case. */
export type PerCaseFunction = {
	node: ts.FunctionLikeDeclaration
	binding: CaseBinding
}

/** What the test-shape rules read in one file: its runner calls, its tables and its per-case functions. */
export type TestShape = {
	runners: readonly RunnerCall[]
	/** Every table: of a runner call or iterated into tests (`Object.entries(<table>)`). */
	tables: readonly TestTable[]
	perCase: readonly PerCaseFunction[]
}

/** The test call a callee makes: its base (`it`) and the factory it goes through (`each`), if any. */
export type TestCallee = {
	base: string
	factory: string | undefined
}
