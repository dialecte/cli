/** What a real `handover run` (with or without `--rehearse`) leaves in its hand-over folder when it ends. */
export type HandoverRunRecord = {
	/** The run spanned a sleep of the machine of this many milliseconds (over 60 s); absent otherwise. */
	sleptMs?: number
}
