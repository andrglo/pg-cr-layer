// Find every named parameter marker (@name) that is really a parameter, i.e.
// that sits in code. A marker looking token inside a string literal, a quoted
// identifier, a comment, a dollar quoted string or an E string is data or
// text, never a parameter, and must be left exactly as written - rewriting it
// corrupts the statement it appears in

const SIGIL = '@'
const WORD = /[A-Za-z0-9_]/
const TAG_START = /[A-Za-z_]/
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/

// The old regex was /(@\w*\b)/g: \w* is greedy and the word boundary must
// hold at its end, so the sigil must be followed by at least one word
// character and takes all of them. A sigil followed by anything else, or by
// nothing, is not a marker
function readMarker(statement, index) {
  let end = index + 1
  while (end < statement.length && WORD.test(statement[end])) {
    end++
  }
  if (end === index + 1) {
    return null
  }
  return {
    index: index,
    length: end - index,
    name: statement.slice(index + 1, end)
  }
}

// A quoted string or identifier ends at the first delimiter that is not
// doubled. Inside an E string a backslash also escapes the next character.
// An unterminated one runs to the end of the statement
function skipQuoted(statement, index, quote, backslashEscapes) {
  let i = index + 1
  while (i < statement.length) {
    const ch = statement[i]
    if (backslashEscapes && ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      if (statement[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  return i
}

// E'...' honours backslash escapes, plain '...' does not under
// standard_conforming_strings. The e must be standing alone, so that the
// tail of an identifier or keyword, as in case'x', does not turn it on
function opensEString(statement, index) {
  const prev = statement[index - 1]
  if (prev !== 'e' && prev !== 'E') {
    return false
  }
  const before = statement[index - 2]
  return before === undefined || !IDENTIFIER_CHAR.test(before)
}

function skipLineComment(statement, index) {
  const end = statement.indexOf('\n', index)
  return end === -1 ? statement.length : end + 1
}

// Block comments nest in postgres, so the first */ does not necessarily
// close the comment
function skipBlockComment(statement, index) {
  let depth = 0
  let i = index
  while (i < statement.length) {
    if (statement[i] === '/' && statement[i + 1] === '*') {
      depth++
      i += 2
      continue
    }
    if (statement[i] === '*' && statement[i + 1] === '/') {
      depth--
      i += 2
      if (depth === 0) {
        return i
      }
      continue
    }
    i++
  }
  return i
}

// A dollar quote is $tag$ ... $tag$, where tag may be empty but can never
// start with a digit - that is what keeps a positional $1 from being read as
// the opening of one. Returns the delimiter or null if this $ opens nothing
function readDollarQuote(statement, index) {
  let i = index + 1
  if (i < statement.length && TAG_START.test(statement[i])) {
    i++
    while (i < statement.length && WORD.test(statement[i])) {
      i++
    }
  }
  return statement[i] === '$' ? statement.slice(index, i + 1) : null
}

function skipDollarQuoted(statement, index, delimiter) {
  const end = statement.indexOf(delimiter, index + delimiter.length)
  return end === -1 ? statement.length : end + delimiter.length
}

/**
 * Scan a statement once, left to right, and return the markers found in code
 * @param statement {string}
 * @return {Array} [{index, length, name}, ...] in order of appearance, where
 * index is the offset of the sigil, length the size of the whole token and
 * name the token without the sigil
 */
module.exports = function scanMarkers(statement) {
  const markers = []
  if (typeof statement !== 'string') {
    return markers
  }
  let i = 0
  while (i < statement.length) {
    const ch = statement[i]
    if (ch === '\'') {
      i = skipQuoted(statement, i, '\'', opensEString(statement, i))
    } else if (ch === '"') {
      i = skipQuoted(statement, i, '"', false)
    } else if (ch === '-' && statement[i + 1] === '-') {
      i = skipLineComment(statement, i)
    } else if (ch === '/' && statement[i + 1] === '*') {
      i = skipBlockComment(statement, i)
    } else if (ch === '$') {
      const delimiter = readDollarQuote(statement, i)
      i = delimiter ? skipDollarQuoted(statement, i, delimiter) : i + 1
    } else if (ch === SIGIL) {
      const marker = readMarker(statement, i)
      if (marker) {
        markers.push(marker)
        i = marker.index + marker.length
      } else {
        i++
      }
    } else {
      i++
    }
  }
  return markers
}
