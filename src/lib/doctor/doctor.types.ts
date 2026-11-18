import type { HostLine } from '../host/host.types.ts'

/**
 * One line of `dialecte doctor`: what was checked, what was found, and the one command that fixes it. `error`: the
 * package.json holds a value no command accepts (a profile that is none).
 */
export type DoctorLine = HostLine

/** What the doctor reads besides the folder: the environment and the cli running it. */
export type DoctorContext = {
	cwd: string
	/** `$DIALECTE_ROOT`: a folder holding local Dialecte checkouts. */
	dialecteRoot: string | undefined
	cliVersion: string
	/** The session-start form: nothing is scanned that only informs (the local checkouts). */
	brief?: boolean
}
