const SIGNATURE_FIELDS = ['player', 'team', 'signedYear', 'inscription'];

const text = (value) => String(value ?? '').trim();

export function normalizeSignature(raw) {
  const signature = {};
  for (const field of SIGNATURE_FIELDS) signature[field] = text(raw?.[field]);
  return signature;
}

/** Accepts current records and the legacy single-player shape. */
export function normalizeBaseball(raw) {
  const rawSignatures = Array.isArray(raw.signatures) && raw.signatures.length
    ? raw.signatures
    : raw.player
      ? [{ player: raw.player, team: raw.team, signedYear: raw.signedYear }]
      : [];

  return {
    id: text(raw.id),
    title: text(raw.title),
    signatures: rawSignatures.map(normalizeSignature).filter((s) => s.player),
    acquired: text(raw.acquired),
    authentication: text(raw.authentication),
    notes: text(raw.notes),
    collections: Array.isArray(raw.collections) ? [...raw.collections] : [],
    images: Array.isArray(raw.images) ? [...raw.images] : [],
    featured: Boolean(raw.featured)
  };
}

export function displayTitle(ball) {
  if (ball.title) return ball.title;
  const names = ball.signatures.map((s) => s.player);
  if (names.length === 0) return 'Untitled baseball';
  if (names.length <= 2) return names.join(' & ');
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
}

export function searchText(ball) {
  return [
    displayTitle(ball),
    ...ball.signatures.flatMap((s) => [s.player, s.team, s.inscription]),
    ball.notes
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const NAME_SPLIT = /\s*(?:&|\+|,|\/|\bwith\b|\bvs\.?\b|\band\b)\s*/i;
const YEAR_PATTERN = /\b(18|19|20)\d{2}\b/;
const COPY_SUFFIX = /\s*(?:\(\d+\)|-?\s*v?\d+|copy\s*\d*)$/i;
// Camera-roll files like img_0042 or dsc_1234 — do not try to split on _.
const CAMERA_ROLL = /^(?:img|dsc|dscf|dcim|photo|pic|image|scan|file)_?\d+$/i;

const titleCase = (value) =>
  value.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Best-effort guess at signature names (and a signed year, if present) from an
 * image file name like "nolan-ryan-1993.jpg" or "ruth_gehrig & mantle.png".
 */
export function guessFromFilename(filename) {
  const base = String(filename ?? '').replace(/\.[^.]+$/, '');
  const yearMatch = base.match(YEAR_PATTERN);
  const signedYear = yearMatch ? yearMatch[0] : '';

  const withoutYear = base.replace(YEAR_PATTERN, ' ');
  const cleaned = withoutYear.replace(/[-_]+/g, ' ').replace(COPY_SUFFIX, '').replace(/\s+/g, ' ').trim();

  // If there's an explicit multi-name separator, use it.
  if (NAME_SPLIT.test(cleaned)) {
    const signatures = cleaned
      .split(NAME_SPLIT)
      .map((part) => titleCase(part.trim()))
      .filter(Boolean)
      .map((player) => ({ player, signedYear }));
    return { signatures: signatures.length ? signatures : [{ player: '', signedYear }], signedYear };
  }

  // If the raw base uses underscore as a separator between what look like
  // separate names (e.g. ruth_gehrig_mantle), split on underscores.
  // Require at least 3 parts so two-part files (first_last) stay as one name.
  const underParts = base.replace(YEAR_PATTERN, '').split('_').map((part) => part.trim()).filter(Boolean);
  if (underParts.length >= 3 && !CAMERA_ROLL.test(base)) {
    const signatures = underParts
      .map((part) => titleCase(part.replace(/-/g, ' ').replace(COPY_SUFFIX, '').trim()))
      .filter(Boolean)
      .map((player) => ({ player, signedYear }));
    if (signatures.length >= 2) return { signatures, signedYear };
  }

  return {
    signatures: cleaned ? [{ player: titleCase(cleaned), signedYear }] : [{ player: '', signedYear }],
    signedYear
  };
}
