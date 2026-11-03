/** The page of `dialecte-lot` that defines each station; its `Tier:` and `Access:` lines must match the cli. */
export const STATIONS_FILE = 'skills/dialecte-lot/references/stations.md'

/** A heading of level 1 to 3 closes the station section before it. */
export const SECTION_BOUNDARY_PATTERN = /^#{1,3}\s/

/** A station section opens with `### <name>`. */
export const STATION_HEADING_PATTERN = /^###\s+(\S+)\s*$/

/** The opening or closing line of a fenced code block. */
export const FENCE_PATTERN = /^\s*(```|~~~)/

/** A `- Tier: <value>` or `- Access: <value>` list line. */
export const DEFINITION_LINE_PATTERN = /^- (Tier|Access): /
