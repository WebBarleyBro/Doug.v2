// Visit notes are shown verbatim to brand clients in the portal, so a rep's
// off-hand shorthand can end up in front of a brand founder. This is a nudge,
// not a filter: it names the person, points at the word, and still lets them
// save if they meant it.

// Deliberately excludes mild words that are ordinary in a bar-and-restaurant
// context ("hell of a night", "Hell's Kitchen", "damn good"). Everything here
// is matched on whole words only — see WORD_RE — so "glass", "class", "assess",
// "cocktail" and "Scunthorpe" never trip it.
const PROFANITY = [
  'fuck', 'shit', 'bullshit', 'piss', 'cunt', 'twat',
  'bitch', 'bastard', 'slut', 'whore', 'hoe',
  'dick', 'prick', 'cock', 'wanker', 'bollocks',
  'ass', 'asshole', 'arse', 'arsehole', 'jackass', 'dumbass',
  'douche', 'douchebag', 'scumbag', 'moron', 'idiot', 'retard',
  'fag', 'faggot', 'nigger', 'nigga', 'spic', 'chink', 'kike', 'tranny',
]

// Common letter swaps, so "sh1t" and "a$$hole" still register. This is not
// meant to defeat determined obfuscation, just the lazy kind.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i', '|': 'i',
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$!|]/g, ch => LEET[ch] ?? ch)
    // Collapse runs of three or more of the same letter: "shiiiit" -> "shit".
    // Ordinary doubles are left alone, so "shiitake" and "assess" stay intact.
    .replace(/([a-z])\1{2,}/g, '$1')
}

// Whole-word match with the usual English inflections allowed on the end.
function wordRe(word: string): RegExp {
  return new RegExp(`\\b${word}(s|es|ed|ing|er|ers|y|ies|in)?\\b`, 'i')
}
const MATCHERS = PROFANITY.map(w => ({ word: w, re: wordRe(w) }))

export interface LanguageHit {
  /** Human-readable name of the field, e.g. "Notes for NoCo Distillery" */
  field: string
  /** The offending words, as matched */
  words: string[]
}

/** Returns the profane words found in a single string, de-duplicated. */
export function findProfanity(text: string | null | undefined): string[] {
  if (!text) return []
  const hay = normalize(text)
  const found = new Set<string>()
  for (const { word, re } of MATCHERS) {
    if (re.test(hay)) found.add(word)
  }
  return [...found]
}

/**
 * Scans a set of labelled fields. Pass the same labels the rep sees on screen
 * so the warning can point them at the right box.
 */
export function scanFields(fields: { label: string; value: string | null | undefined }[]): LanguageHit[] {
  const hits: LanguageHit[] = []
  for (const { label, value } of fields) {
    const words = findProfanity(value)
    if (words.length > 0) hits.push({ field: label, words })
  }
  return hits
}

/** First name of whoever is signed in, for the nudge. Falls back gracefully. */
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
  return `${list} ${words.length === 1 ? 'is' : 'are'} in ${where}. The brand reads these notes in their portal — mind rewording before you save?`
}
