import { REPORT_ENVIRONMENT_VARIABLE } from '../src/lib/tdd/tdd.constants.ts'

/** The file the recording script writes its arguments to, in the folder it ran in. */
export const RECORDED_ARGUMENTS_FILE = 'argv.txt'

/**
 * A stand-in for the vitest binary (or for npx): it writes its arguments, one per line, to the recorded file in
 * its working folder and an empty report to the file the report variable names.
 */
export const RECORDING_SCRIPT = `#!/bin/sh
for argument in "$@"; do printf '%s\\n' "$argument"; done > ${RECORDED_ARGUMENTS_FILE}
printf '[]' > "$${REPORT_ENVIRONMENT_VARIABLE}"
`
