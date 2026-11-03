import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { RECORDED_ARGUMENTS_FILE, RECORDING_SCRIPT } from './recording-script.constants.ts'

/** Writes the executable recording script at `path`, its folders made. */
export function writeRecordingScript(params: { path: string }): void {
	mkdirSync(dirname(params.path), { recursive: true })
	writeFileSync(params.path, RECORDING_SCRIPT)
	chmodSync(params.path, 0o755)
}

/** The arguments the recording script received, in order, when it ran with `folder` as its working folder. */
export function readRecordedArguments(params: { folder: string }): string[] {
	return readFileSync(join(params.folder, RECORDED_ARGUMENTS_FILE), 'utf8').trimEnd().split('\n')
}
