// Visit notes are shown verbatim to brand clients in the portal, so a rep's
// off-hand shorthand can end up in front of a brand founder. This is a block,
// not a nudge: a note containing one of these words cannot be saved until it is
// reworded. The same check runs on every screen that creates or edits a visit.

// Words that are profane wherever they appear, including inside compounds
// ("shithead", "motherfucker", "dumbass"). None of these occur inside ordinary
// bar-and-restaurant vocabulary.
const ANYWHERE = [
  'fuck', 'shit', 'cunt', 'bitch', 'slut', 'whore', 'twat', 'jizz',
  'nigger', 'nigga', 'faggot', 'asshole', 'arsehole', 'jackass', 'dumbass', 'douche', 'cocksuck',
]

// Words that are only profane on their own, because they also occur inside
// innocent words ("cocktail", "class", "glass", "assess", "Dickens", "spice",
// "swanky", "Scunthorpe"). Matched as whole words with common endings.
const WHOLE_WORD = [
  'ass', 'asshat', 'arse', 'piss', 'dick', 'cock', 'prick', 'wank', 'wanker', 'bollocks',
  'bastard', 'hoe', 'scumbag', 'moron', 'idiot', 'retard', 'fag', 'spic', 'chink', 'kike', 'tranny',
]
const ENDINGS = '(s|es|ed|ing|in|er|ers|ty|head|heads|face|hole|holes|bag|bags|wad)?'

// Whole words that look like a match but are ordinary.
const ALLOWED = new Set(['cocky'])

// Common letter swaps, so "sh1t" and "a$$hole" still register.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i', '|': 'i',
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    // Place names that contain a match but aren't profane.
    .replace(/scunthorpe/g, 'town')
    .replace(/[013457@$!|]/g, ch => LEET[ch] ?? ch)
    // Spelled-out letters: "s.h.i.t", "f u c k", "s-h-i-t" → "shit".
    .replace(/\b(?:[a-z*][.\-_\s]){2,}[a-z*]\b/g, m => m.replace(/[.\-_\s]/g, ''))
    // Collapse runs of three or more of the same letter: "shiiiit" → "shit".
    .replace(/([a-z])\1{2,}/g, '$1')
}

// Each letter after the first may be masked with * or #, so "f*ck", "sh*t" and
// "f**k" still match.
function pattern(word: string): string {
  return word[0] + word.slice(1).split('').map(c => `[${c}*#]`).join('')
}
const ANYWHERE_RE = ANYWHERE.map(w => ({ word: w, re: new RegExp(pattern(w), 'i') }))
const WHOLE_RE = WHOLE_WORD.map(w => ({ word: w, re: new RegExp(`(?<![a-z])${pattern(w)}${ENDINGS}(?![a-z])`, 'i') }))

export interface LanguageHit {
  /** Human-readable name of the field, e.g. "the notes for NoCo Distillery" */
  field: string
  /** The offending words, as matched */
  words: string[]
}

/** Returns the profane words found in a single string, de-duplicated. */
export function findProfanity(text: string | null | undefined): string[] {
  if (!text) return []
  const hay = normalize(text)
  const found = new Set<string>()
  for (const { word, re } of ANYWHERE_RE) if (re.test(hay)) found.add(word)
  for (const { word, re } of WHOLE_RE) {
    const m = hay.match(re)
    if (m && !ALLOWED.has(m[0])) found.add(word)
  }
  // "asshole" also matches "ass"; report the longer word only.
  if (found.has('asshole') || found.has('dumbass') || found.has('jackass')) found.delete('ass')
  return [...found]
}

/**
 * Masks profane words for display: "It's fucking Scott" → "It's f****** Scott".
 * Used where text that was saved before the check existed is shown to a client.
 */
export function maskProfanity(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\S+/g, token => {
    if (findProfanity(token).length === 0) return token
    const lead = token.match(/^[^A-Za-z0-9]*/)?.[0] ?? ''
    const trail = token.match(/[^A-Za-z0-9*#]*$/)?.[0] ?? ''
    const core = token.slice(lead.length, token.length - trail.length)
    return lead + core.charAt(0) + '*'.repeat(Math.max(1, core.length - 1)) + trail
  })
}

/**
 * Scans a set of labelled fields. Pass the same labels the rep sees on screen
 * so the message can point them at the right box.
 */
export function scanFields(fields: { label: string; value: string | null | undefined }[]): LanguageHit[] {
  const hits: LanguageHit[] = []
  for (const { label, value } of fields) {
    const words = findProfanity(value)
    if (words.length > 0) hits.push({ field: label, words })
  }
  return hits
}

/** First name of whoever is signed in. Falls back gracefully. */
export function firstNameOf(profile: { name?: string | null; full_name?: string | null } | null | undefined, email?: string | null): string {
  const raw = profile?.name || profile?.full_name || (email ? email.split('@')[0].replace(/[._-]/g, ' ') : '')
  const first = String(raw).trim().split(/\s+/)[0]
  if (!first) return 'friend'
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/** The headline shown to the rep, e.g. "Language, Chase." */
export function languageHeadline(firstName: string): string {
  return `Language, ${firstName}.`
}

/** The explanation under the headline. */
export function languageDetail(hits: LanguageHit[]): string {
  const words = [...new Set(hits.flatMap(h => h.words))]
  const list = words.length === 1
    ? `“${words[0]}”`
    : words.slice(0, -1).map(w => `“${w}”`).join(', ') + ` and “${words[words.length - 1]}”`
  const where = hits.length === 1 ? hits[0].field : hits.map(h => h.field).join(' and ')
  return `${list} ${words.length === 1 ? 'is' : 'are'} in ${where}. The brand reads these notes in their portal, so this can't be saved until it's reworded.`
}

/** Short label for a save button that is blocked by language. */
export const LANGUAGE_BLOCKED_LABEL = 'Reword to save'
