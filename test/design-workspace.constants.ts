/** The texts and paths of the `lot design` cases. */

/** Where a case writes the lot's design: a file of the lot's repository, so inside a git work tree. */
export const DESIGN_PATH = 'plans/DESIGN.md'

/** The design's first content. */
export const DESIGN_TEXT = '# Design\n\nThe records move into one reader.\n'

/** The design's content after an edit. */
export const EDITED_DESIGN_TEXT = '# Design\n\nThe records move into two readers.\n'

/** The shared area the cases' repository declares (`dialecte.risk.high`): the lot's `src/` scope is broader than it. */
export const DECLARED_GLOB = 'src/lib/store/**'

/** The time every `lot design` case records at. */
export const DESIGN_TIME = new Date('2026-11-17T12:00:00.000Z')

/** A person approving or waiving a design. */
export const APPROVER = 'person-a'

/** The waiver's reason. */
export const WAIVER_REASON = 'started before the design gate'
