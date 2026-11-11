/** The cli the card tests name as the writer of the card. */
export const CARD_CLI_PATH = '/opt/dialecte/dist/cli.js'

/** The card's default bound on the probe, in milliseconds. */
export const DEFAULT_PROBE_TIMEOUT_MILLISECONDS = 60_000

/** The real probe, as a test file would name it. */
export const REAL_PROBE_NAME = 'probeRepositoryCli'

/**
 * The test files allowed to name the real probe: the real-probe cases live in this one. There are six: an
 * installed cli and one lacking `handover run`, and a cli that hangs on the probe (all through `writeHandover`),
 * and three through the cli subprocess (`runCli`: the card off a terminal, at COLUMNS 50, and after
 * `handover run`), which keep the real probe end to end.
 */
export const REAL_PROBE_FILES = ['src/commands/handover.test.ts']

/** The production files allowed to name the real probe: its own file, and the command that hands it to the card. */
export const PRODUCTION_PROBE_FILES = [
	'src/commands/handover.ts',
	'src/lib/handover/repository-cli-probe.ts',
]

/** The folders, relative to the package root, whose files are read. */
export const SOURCE_FOLDERS = ['src', 'test']

/** The in-process cases passing the real probe: the installed cli, the cli lacking `handover run`, the hanging cli. */
export const IN_PROCESS_REAL_PROBE_CASES = 3

/** The files that hold the name to look for: the guard and its constants. */
export const READING_FILES = [
	'src/lib/handover/handover-card-probe.test.ts',
	'test/handover-card-probe.constants.ts',
]
