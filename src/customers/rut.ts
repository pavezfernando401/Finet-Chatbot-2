/**
 * Spotting a Chilean RUT inside a chat message. Text is all there is — the
 * same flow has to work on WhatsApp — so the RUT arrives however the customer
 * typed it: `12.345.678-5`, `12345678-5`, `123456785`, `mi rut es ...`.
 */

const FACTORS = [2, 3, 4, 5, 6, 7];

/** `12345678-5` style, dots optional, anywhere in the text. */
const HYPHENATED =
  /(?<![\d.])(\d{1,2}\.\d{3}\.\d{3}|\d{7,8})\s*-\s*([\dkK])(?![\dkK])/;

/**
 * A bare `123456785` only counts when it is the whole message. Anywhere else
 * nine digits are as likely to be a phone number, and a phone number that
 * happens to pass the check digit would be looked up as someone's RUT.
 */
const BARE = /^(\d{1,2}\.?\d{3}\.?\d{3})([\dkK])$/;
const BARE_PREFIX = /^(?:mi\s+)?rut\s*(?:es)?\s*:?\s*/i;

export interface FoundRut {
  /** Digits and check digit, no dots or hyphen, K uppercase: `123456785`. */
  rut: string;
  /** The text as typed, to blank it out before the message goes anywhere. */
  match: string;
}

/**
 * Bodies of 7 or 8 digits: every person alive has one that long, and
 * accepting shorter ones only adds false positives.
 */
export function isValidRut(rut: string): boolean {
  if (!/^\d{7,8}[\dK]$/.test(rut)) return false;

  const body = rut.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * FACTORS[i % FACTORS.length];
  }

  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return rut.slice(-1) === expected;
}

/** The first valid RUT in `text`, or `null`. Invalid check digits do not count. */
export function extractRut(text: string): FoundRut | null {
  const hyphenated = HYPHENATED.exec(text);
  if (hyphenated) {
    const rut = normalise(hyphenated[1] + hyphenated[2]);
    if (isValidRut(rut)) return { rut, match: hyphenated[0] };
  }

  const trimmed = text.trim().replace(/\.$/, '');
  const bare = BARE.exec(trimmed.replace(BARE_PREFIX, ''));
  if (bare) {
    const rut = normalise(bare[1] + bare[2]);
    if (isValidRut(rut)) return { rut, match: trimmed };
  }

  return null;
}

function normalise(raw: string): string {
  return raw.replace(/\./g, '').toUpperCase();
}
