/** The wordings of what `handover run` reads of the package's gate before its guards. */

/** `handover run` on a package whose gate config the cli cannot run: `{message}` is the `GateConfigError`'s. */
export const HANDOVER_GATE_CONFIG_REFUSAL =
	'handover run: {message}; nothing staged, nothing committed: fix dialecte.gate in package.json, then run it again'
