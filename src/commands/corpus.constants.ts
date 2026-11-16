/** The words, flags and lines of `dialecte corpus`. */

export const CORPUS_VERBS = ['fetch', 'list', 'check', 'add'] as const

export const CORPUS_JSON_FLAG = 'json'
export const CORPUS_XSD_OPTION = 'xsd'
export const CORPUS_INSTANCES_OPTION = 'instances'

/** The corpora section of config.yml, where `add` writes. */
export const CORPORA_CONFIG_KEY = 'corpora'

export const CORPUS_USAGE = [
	'usage: dialecte corpus fetch [<id>...] [--json]',
	'       dialecte corpus list [--json]',
	'       dialecte corpus check [--json]',
	'       dialecte corpus add <name> --xsd <path> [--instances <folder>]',
] as const

export const CORPUS_LINES = {
	unknownSources: 'corpus fetch: no source {ids} in the manifest',
	fetched: '✓ {id}: {files} files, {kib} KiB',
	refused: '✗ {reason}',
	cache: 'cache: {cache}',
	listed: '{name}  {source}  {verdict}  {state}  {count} instances',
	nothingListed: 'no corpus: the manifest is empty and config.yml lists none',
	checked:
		'corpus check: every fetched source matches its pins, every licensed entry has its files',
	problem: '✗ {problem}',
	added: 'corpus add: {name} written to {file}',
	needsName: 'corpus add: needs the corpus name',
	needsXsd: 'corpus add: needs --xsd <path>',
	badName: "corpus add: name '{name}' - a corpus name holds no dot",
	noXsd: 'corpus add: no file {path}',
	noInstances: 'corpus add: no folder {path}',
} as const

/** A KiB, for the fetch lines. */
export const KIBIBYTE = 1024
