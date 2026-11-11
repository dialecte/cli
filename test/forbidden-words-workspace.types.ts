/** What `configureMachine` sets up. */
export type ConfigureMachineParams = {
	/** The lines of the user file (none when undefined). */
	userFileLines?: string[]
	/** `unset` leaves `XDG_CONFIG_HOME` unset, so the file is read under the home's `.config`. */
	configHome?: 'set' | 'unset'
	/** Lines of a list under the home's `.config`, whatever the config folder. */
	homeFileLines?: string[]
	/** The user file made a folder, or a file nobody can read. */
	userFileBroken?: 'directory' | 'unreadable'
}

/** A machine configured for the forbidden words, in folders of the test's own. */
export type ConfiguredWords = {
	/** The home folder the environment names. */
	home: string
	/** The config folder the environment names; absent when `XDG_CONFIG_HOME` is left unset. */
	configHome?: string
	/** The user file the list is read from (its folder may not exist). */
	userFile: string
}
