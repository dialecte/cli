/**
 * The keywords that start an SQL statement: a string of code whose text starts with one (after white space) is SQL.
 */
export const SQL_STATEMENT_KEYWORDS: ReadonlySet<string> = new Set([
	'ALTER',
	'ANALYZE',
	'ATTACH',
	'BEGIN',
	'COMMIT',
	'CREATE',
	'DELETE',
	'DETACH',
	'DROP',
	'EXPLAIN',
	'INSERT',
	'PRAGMA',
	'REINDEX',
	'RELEASE',
	'REPLACE',
	'ROLLBACK',
	'SAVEPOINT',
	'SELECT',
	'UPDATE',
	'VACUUM',
	'WITH',
])

/**
 * The words of an SQL statement other than its first: written as one SQL string (it starts with a statement keyword),
 * so the committed-text checks read its words as the keywords they are, as in the strings this module reads.
 */
const SQL_CLAUSE_WORDS = `SELECT ADD ALL AND AS ASC BETWEEN BY CASE CAST CHECK COLLATE COLUMN CONFLICT CONSTRAINT CROSS
DEFAULT DESC DISTINCT DO ELSE END ESCAPE EXCEPT EXISTS FILTER FOREIGN FROM GLOB GROUP HAVING IF IN
INDEX INNER INTERSECT INTO IS JOIN KEY LEFT LIKE LIMIT NATURAL NOT NOTHING NULL OFFSET ON OR ORDER
OUTER OVER PARTITION PRIMARY RECURSIVE REFERENCES RETURNING RIGHT ROWID SET TABLE THEN TRANSACTION
TRIGGER UNION UNIQUE USING VALUES VIEW WHEN WHERE WINDOW WITHOUT`

/** The SQL keywords a word inside an SQL string of code may be: such a word is the keyword, never a name. */
export const SQL_KEYWORDS: ReadonlySet<string> = new Set([
	...SQL_STATEMENT_KEYWORDS,
	...SQL_CLAUSE_WORDS.split(/\s+/),
])

/** The first word of a string's text, after white space. */
export const FIRST_WORD_PATTERN = /^\s*([A-Za-z]+)/

/** A word starting at a position: letters, digits and `_`. */
export const WORD_AT_PATTERN = /^[A-Za-z0-9_]+/
