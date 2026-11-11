/**
 * The `tests` step of this package's fast gate (`dialecte.gate.fast` in package.json): `vitest related` over the
 * gate's changed paths, the selection written where the gate asked. Run without a gate it starts nothing (exit 2), nor
 * inside a scoped run nested twice (`DIALECTE_SCOPED_TESTS_DEPTH` 2 or more: a suite whose test runs this step would
 * start itself again without end); the vitest it starts gets its depth plus one.
 * The words after it (a serial rerun's failing files and flag) are handed to vitest.
 */
import {
	NESTED_TWICE_LINE,
	NO_GATE_SCOPE_LINE,
	SCOPED_TESTS_DEPTH_VARIABLE,
	SCOPED_TESTS_MAXIMUM_DEPTH,
} from './lib/gate/scoped-tests.constants.ts'
import { runScopedTests } from './lib/gate/scoped-tests.ts'
import { readGateScopeEnvironment } from './lib/gate/selection.ts'
import { printLines } from './lib/print/print.ts'
import { childLinesOf, printRelayed } from './lib/print/relayed.ts'

const scope = readGateScopeEnvironment(process.env)
const depth = Number(process.env[SCOPED_TESTS_DEPTH_VARIABLE] ?? 0) || 0
if (depth >= SCOPED_TESTS_MAXIMUM_DEPTH) {
	printLines({ stream: 'stderr', lines: [NESTED_TWICE_LINE.replace('{depth}', String(depth))] })
	process.exitCode = 2
} else if (scope === undefined) {
	printLines({ stream: 'stderr', lines: [NO_GATE_SCOPE_LINE] })
	process.exitCode = 2
} else {
	const run = runScopedTests({
		root: process.cwd(),
		environment: scope,
		extraArguments: process.argv.slice(2),
		depth,
	})
	// vitest's own output, relayed line by line
	printRelayed({ stream: 'stdout', lines: childLinesOf(run.output.replace(/\r?\n$/, '')) })
	process.exitCode = run.exitCode
}
