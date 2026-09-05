/**
 * Parses a "New baseball" / "New bobblehead" issue form (see
 * .github/ISSUE_TEMPLATE/) and stages the corresponding data + image changes
 * in the working tree. Run inside .github/workflows/intake.yml — the
 * workflow commits whatever this script writes and opens a pull request.
 *
 * Reads issue details from environment variables (set by the workflow) and
 * writes step outputs to $GITHUB_OUTPUT.
 */
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBaseball } from '../lib/baseball.mjs';
import { normalizeBobblehead } from '../lib/bobblehead.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const imagesDir = path.join(root, 'images');

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif'
};
const EXTENSION_FROM_URL = /\.(jpe?g|png|webp|avif|gif)(?:$|[?#])/i;

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const text = (value) => String(value ?? '').trim();

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const line = `${name}<<__INTAKE_EOF__\n${value}\n__INTAKE_EOF__\n`;
  return writeFile(file, line, { flag: 'a' });
}

/** Turns rendered issue-form markdown ("### Label\n\nvalue") into a { label: value } map. */
function parseIssueForm(body) {
  const fields = {};
  let currentLabel = null;
  let buffer = [];
  const flush = () => {
    if (currentLabel === null) return;
    const value = buffer.join('\n').trim();
    fields[currentLabel] = value === '_No response_' ? '' : value;
  };
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const heading = line.match(/^### (.+)$/);
    if (heading) {
      flush();
      currentLabel = heading[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return fields;
}

function extractImageUrls(value) {
  const urls = new Set();
  const markdownImage = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = markdownImage.exec(value))) urls.add(match[1]);
  if (urls.size === 0) {
    const bareUrl = /https?:\/\/[^\s)]+/g;
    while ((match = bareUrl.exec(value))) urls.add(match[0]);
  }
  return [...urls];
}

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download photo (HTTP ${response.status}): ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
  const urlMatch = url.match(EXTENSION_FROM_URL);
  const extension =
    IMAGE_TYPES[contentType] ?? (urlMatch ? `.${urlMatch[1].toLowerCase().replace('jpeg', 'jpg')}` : null);
  if (!extension) throw new Error(`Unrecognized photo type for ${url}`);
  return { buffer, extension };
}

async function saveImages(directory, baseName, urls) {
  await mkdir(directory, { recursive: true });
  const saved = [];
  let counter = 1;
  for (const url of urls) {
    const { buffer, extension } = await downloadImage(url);
    let fileName = counter === 1 ? `${baseName}${extension}` : `${baseName}-${counter}${extension}`;
    counter += 1;
    while (await stat(path.join(directory, fileName)).catch(() => null)) {
      fileName = `${baseName}-${counter++}${extension}`;
    }
    await writeFile(path.join(directory, fileName), buffer);
    saved.push(fileName);
  }
  return saved;
}

const readJson = async (file) => JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
const writeJson = (file, value) => writeFile(path.join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`);

function uniqueId(candidate, existingIds) {
  const base = slug(candidate) || `item-${Date.now().toString(36)}`;
  if (!existingIds.has(base)) return base;
  return `${base}-${Date.now().toString(36)}`;
}

function parseAdditionalSignatures(raw) {
  return text(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [player, team, signedYear, inscription] = line.split('|').map((part) => text(part));
      return { player, team, signedYear, inscription };
    })
    .filter((signature) => signature.player);
}

async function processBaseball(fields) {
  const player = text(fields.Player);
  if (!player) throw new Error('The "Player" field is required.');

  const [{ baseballs = [] }, { collections = [] }] = await Promise.all([
    readJson('baseballs.json'),
    readJson('collections.json')
  ]);
  const knownCollections = new Set(collections.map((c) => c.id));
  const existingIds = new Set(baseballs.map((b) => b.id));

  const signatures = [
    { player, team: text(fields.Team), signedYear: text(fields['Signed year']), inscription: text(fields.Inscription) },
    ...parseAdditionalSignatures(fields['Additional signatures'])
  ];

  const photoUrls = extractImageUrls(text(fields.Photos));
  if (photoUrls.length === 0) throw new Error('Attach at least one photo in the "Photos" field.');

  const requestedCollections = text(fields.Collections)
    .split(',')
    .map((value) => slug(value))
    .filter(Boolean);
  const droppedCollections = requestedCollections.filter((id) => !knownCollections.has(id));
  const recordCollections = requestedCollections.filter((id) => knownCollections.has(id));

  const id = uniqueId(player, existingIds);
  const directory = path.join(imagesDir, 'baseballs');
  const images = await saveImages(directory, id, photoUrls);

  const record = normalizeBaseball({
    id,
    signatures,
    acquired: fields.Acquired,
    authentication: fields.Authentication,
    notes: fields.Notes,
    collections: recordCollections,
    images
  });

  baseballs.push(record);
  await writeJson('baseballs.json', { baseballs });

  return { record, title: signatures.map((s) => s.player).filter(Boolean).join(' & '), droppedCollections };
}

async function processBobblehead(fields) {
  const name = text(fields.Name);
  if (!name) throw new Error('The "Name" field is required.');

  const { bobbleheads = [] } = await readJson('bobbleheads.json');
  const existingIds = new Set(bobbleheads.map((b) => b.id));

  const photoUrls = extractImageUrls(text(fields.Photos));
  if (photoUrls.length === 0) throw new Error('Attach at least one photo in the "Photos" field.');

  const id = uniqueId(name, existingIds);
  const directory = path.join(imagesDir, 'bobbleheads');
  const images = await saveImages(directory, id, photoUrls);

  const record = normalizeBobblehead({ id, name, year: fields.Year, notes: fields.Notes, images });

  bobbleheads.push(record);
  await writeJson('bobbleheads.json', { bobbleheads });

  return { record, title: name, droppedCollections: [] };
}

async function main() {
  const labels = String(process.env.ISSUE_LABELS ?? '')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
  const fields = parseIssueForm(process.env.ISSUE_BODY ?? '');

  const itemType = labels.includes('new-baseball')
    ? 'baseball'
    : labels.includes('new-bobblehead')
      ? 'bobblehead'
      : null;

  if (!itemType) {
    await setOutput('changed', 'false');
    await setOutput('error', 'This issue is missing a "new-baseball" or "new-bobblehead" label.');
    return;
  }

  try {
    const { record, title, droppedCollections } =
      itemType === 'baseball' ? await processBaseball(fields) : await processBobblehead(fields);

    await setOutput('changed', 'true');
    await setOutput('item-type', itemType);
    await setOutput('item-id', record.id);
    await setOutput('item-title', title);
    if (droppedCollections.length) {
      await setOutput('warning', `Ignored unknown collection id(s): ${droppedCollections.join(', ')}`);
    }
  } catch (error) {
    await setOutput('changed', 'false');
    await setOutput('error', error.message);
  }
}

await main();
