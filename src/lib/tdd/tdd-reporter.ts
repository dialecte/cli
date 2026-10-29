/**
 * The vitest reporter `dialecte tdd` runs a package's tests with: at the end of the run it writes every test
 * file it saw - its collection errors, and each case with its full name, state, project, location and
 * errors (name, message, parsed frames) - as JSON to the file `DIALECTE_TDD_REPORT` names. Loaded by vitest
 * from the cli's own folder: it imports nothing but node's file system.
 */
import { writeFileSync } from 'node:fs'

import type { ReportedError, ReportedModule, RunnerError } from './tdd.types.ts'
import type { Reporter, TestModule } from 'vitest/node'

export default class TddReporter implements Reporter {
	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		const path = process.env.DIALECTE_TDD_REPORT
		if (!path) return
		writeFileSync(path, JSON.stringify(testModules.map(reportModule)))
	}
}

function reportModule(testModule: TestModule): ReportedModule {
	return {
		file: testModule.moduleId,
		errors: testModule.errors().map(reportError),
		cases: [...testModule.children.allTests()].map(function reportCase(testCase) {
			const result = testCase.result()
			return {
				name: testCase.fullName,
				state: result.state,
				project: testCase.project.name,
				...(testCase.location && { location: testCase.location }),
				errors: (result.errors ?? []).map(reportError),
			}
		}),
	}
}

function reportError(error: RunnerError): ReportedError {
	return {
		...(error.name && { name: error.name }),
		message: error.message ?? '',
		frames: (error.stacks ?? []).map((frame) => ({
			file: frame.file,
			line: frame.line,
			column: frame.column,
		})),
	}
}
