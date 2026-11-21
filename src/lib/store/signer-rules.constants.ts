/**
 * The orchestrator as a signer: the approver the cli's own lots take (its independent critic), recorded as this one word
 * in any casing and spacing.
 */
export const ORCHESTRATOR_SIGNER = 'orchestrator'

/**
 * The refusal of a verb that releases or approves what a person decided, run from the lot's own worktree or one of its
 * review throwaways: `{command}` the verb's own words (`lot design: approve`, `lot unkeep`).
 */
export const OWN_WORKTREE_REFUSAL =
	"{command} from the main checkout, not the lot's worktree; nothing written"

/** The signer a lot's own session signs as, from its workplace. */
export const LOT_SESSION_SIGNER = 'lot-session'

/**
 * The refusal of `--by orchestrator` from a lot's workplace (SAFE 3.5): `{lot}` the lot's name, `{signer}` the
 * signer a lot signs as.
 */
export const WORKPLACE_SIGNER_REFUSAL =
	"--by orchestrator is signed from the main checkout: from lot {lot}'s worktree, sign --by {signer}"

/** The refusal of `--by orchestrator` on a lot approval of another package than the cli: `{package}` its name. */
export const APPROVAL_SIGNER_REFUSAL =
	"lot approve: {package} lots are approved by a person: --by orchestrator is for the cli's own lots"
