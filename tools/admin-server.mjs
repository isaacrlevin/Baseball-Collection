/**
 * Local-only admin server. Binds to 127.0.0.1 and is never published to GitHub Pages.
 * Run with: npm run admin
 */
import { createServer } from 'node:http';
import { readFile, readdir, writeFile, stat, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBaseball as normalizeStored } from '../lib/baseball.mjs';
import { normalizeBobblehead } from '../lib/bobblehead.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminDir = path.join(root, 'admin');
const libDir = path.join(root, 'lib');
const dataDir = path.join(root, 'data');
const imagesDir = path.join(root, 'images');
const baseballImagesDir = path.join(imagesDir, 'baseballs');
const bobbleheadImagesDir = path.join(imagesDir, 'bobbleheads');
const port = Number(process.env.ADMIN_PORT ?? 7777);

const MAX_BODY_BYTES = 40 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif'
};
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif'
};

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const IMAGE_EXTENSIONS = new Set([...Object.values(IMAGE_TYPES), '.jpeg']);

const readJson = async (file) => JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
const writeJson = (file, value) =>
  writeFile(path.join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`);

async function listImageFiles(directory = baseballImagesDir) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
}

async function findUnassignedImages(records, directory) {
  const used = new Set(records.flatMap((record) => record.images ?? []));
  const files = await listImageFiles(directory);
  return files.filter((name) => !used.has(name));
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function saveImage(directory, baseName, image) {
  const extension = IMAGE_TYPES[image.type];
  if (!extension) throw new Error(`Unsupported image type: ${image.type}`);

  const base64 = String(image.data ?? '').split(',').pop() ?? '';
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('Empty image upload');

  await mkdir(directory, { recursive: true });

  let fileName = `${baseName}${extension}`;
  let counter = 2;
  while (await stat(path.join(directory, fileName)).catch(() => null)) {
    fileName = `${baseName}-${counter++}${extension}`;
  }

  await writeFile(path.join(directory, fileName), buffer);
  return fileName;
}

function buildRecord(input, knownCollections, existingId) {
  const record = normalizeStored(input);
  if (record.signatures.length === 0) {
    throw new Error('At least one signature with a player name is required.');
  }

  record.id =
    existingId ?? (slug(input.id || record.title || record.signatures[0].player) || `ball-${Date.now()}`);
  record.collections = record.collections.map((value) => slug(value)).filter((value) => knownCollections.has(value));
  record.images = [];
  return record;
}

function buildBobblehead(input, existingId) {
  const record = normalizeBobblehead(input);
  if (!record.name) throw new Error('Bobblehead name is required.');
  record.id = existingId ?? (slug(record.name) || `bobblehead-${Date.now()}`);
  record.images = [];
  return record;
}

const routes = {
  async 'GET /api/data'() {
    const [{ baseballs = [] }, { bobbleheads = [] }, { collections = [] }] = await Promise.all([
      readJson('baseballs.json'),
      readJson('bobbleheads.json'),
      readJson('collections.json')
    ]);
    return {
      baseballs: baseballs.map(normalizeStored),
      bobbleheads: bobbleheads.map(normalizeBobblehead),
      collections,
      unassignedImages: await findUnassignedImages(baseballs, baseballImagesDir),
      unassignedBobbleheadImages: await findUnassignedImages(bobbleheads, bobbleheadImagesDir)
    };
  },

  async 'GET /api/unassigned-images'() {
    const { baseballs = [] } = await readJson('baseballs.json');
    return { unassignedImages: await findUnassignedImages(baseballs, baseballImagesDir) };
  },

  async 'GET /api/unassigned-bobblehead-images'() {
    const { bobbleheads = [] } = await readJson('bobbleheads.json');
    return {
      unassignedBobbleheadImages: await findUnassignedImages(bobbleheads, bobbleheadImagesDir)
    };
  },

  async 'POST /api/images/discard'(req) {
    const body = await readBody(req);
    const { baseballs = [] } = await readJson('baseballs.json');
    const name = path.basename(String(body.name ?? ''));
    const unassigned = await findUnassignedImages(baseballs, baseballImagesDir);
    if (!unassigned.includes(name)) {
      throw new Error('That file is either in use or no longer present.');
    }
    await unlink(path.join(baseballImagesDir, name));
    return { deleted: name };
  },

  async 'POST /api/bobblehead-images/discard'(req) {
    const body = await readBody(req);
    const { bobbleheads = [] } = await readJson('bobbleheads.json');
    const name = path.basename(String(body.name ?? ''));
    const unassigned = await findUnassignedImages(bobbleheads, bobbleheadImagesDir);
    if (!unassigned.includes(name)) {
      throw new Error('That file is either in use or no longer present.');
    }
    await unlink(path.join(bobbleheadImagesDir, name));
    return { deleted: name };
  },

  async 'POST /api/baseballs'(req) {
    const body = await readBody(req);
    const [file, collectionsFile] = [await readJson('baseballs.json'), await readJson('collections.json')];
    const known = new Set((collectionsFile.collections ?? []).map((c) => c.id));

    const existingIndex = body.originalId
      ? (file.baseballs ?? []).findIndex((b) => b.id === body.originalId)
      : -1;
    const existing = existingIndex >= 0 ? file.baseballs[existingIndex] : null;

    const record = buildRecord(body, known, existing?.id);
    if (!existing && (file.baseballs ?? []).some((b) => b.id === record.id)) {
      record.id = `${record.id}-${Date.now().toString(36)}`;
    }

    // Keep existing photos plus any loose files dropped into images/baseballs/ that nothing else claims.
    const claimedElsewhere = new Set(
      (file.baseballs ?? []).filter((b) => b.id !== existing?.id).flatMap((b) => b.images ?? [])
    );
    const onDisk = new Set(await listImageFiles(baseballImagesDir));
    const requested = Array.isArray(body.images) ? body.images : (existing?.images ?? []);
    const keptImages = requested
      .map((name) => path.basename(String(name)))
      .filter((name) => onDisk.has(name) && !claimedElsewhere.has(name));

    const added = [];
    for (const image of Array.isArray(body.newImages) ? body.newImages : []) {
      added.push(await saveImage(baseballImagesDir, record.id, image));
    }
    record.images = [...keptImages, ...added];

    // Delete image files that were removed from this baseball.
    for (const removed of existing?.images ?? []) {
      if (!record.images.includes(removed)) {
        await unlink(path.join(baseballImagesDir, removed)).catch(() => {});
      }
    }

    if (existing) file.baseballs[existingIndex] = record;
    else file.baseballs = [...(file.baseballs ?? []), record];

    await writeJson('baseballs.json', file);
    return { baseball: record };
  },

  async 'POST /api/baseballs/delete'(req) {
    const body = await readBody(req);
    const file = await readJson('baseballs.json');
    const target = (file.baseballs ?? []).find((b) => b.id === body.id);
    if (!target) throw Object.assign(new Error('Baseball not found.'), { status: 404 });

    for (const image of target.images ?? []) {
      await unlink(path.join(baseballImagesDir, image)).catch(() => {});
    }
    file.baseballs = file.baseballs.filter((b) => b.id !== target.id);
    await writeJson('baseballs.json', file);
    return { deleted: target.id };
  },

  async 'POST /api/bobbleheads'(req) {
    const body = await readBody(req);
    const file = await readJson('bobbleheads.json');
    const existingIndex = body.originalId
      ? (file.bobbleheads ?? []).findIndex((item) => item.id === body.originalId)
      : -1;
    const existing = existingIndex >= 0 ? file.bobbleheads[existingIndex] : null;
    const record = buildBobblehead(body, existing?.id);

    if (!existing && (file.bobbleheads ?? []).some((item) => item.id === record.id)) {
      record.id = `${record.id}-${Date.now().toString(36)}`;
    }

    const claimedElsewhere = new Set(
      (file.bobbleheads ?? []).filter((item) => item.id !== existing?.id).flatMap((item) => item.images ?? [])
    );
    const onDisk = new Set(await listImageFiles(bobbleheadImagesDir));
    const requested = Array.isArray(body.images) ? body.images : (existing?.images ?? []);
    const keptImages = requested
      .map((name) => path.basename(String(name)))
      .filter((name) => onDisk.has(name) && !claimedElsewhere.has(name));

    const added = [];
    for (const image of Array.isArray(body.newImages) ? body.newImages : []) {
      added.push(await saveImage(bobbleheadImagesDir, record.id, image));
    }
    record.images = [...keptImages, ...added];

    for (const removed of existing?.images ?? []) {
      if (!record.images.includes(removed)) {
        await unlink(path.join(bobbleheadImagesDir, removed)).catch(() => {});
      }
    }

    if (existing) file.bobbleheads[existingIndex] = record;
    else file.bobbleheads = [...(file.bobbleheads ?? []), record];
    await writeJson('bobbleheads.json', file);
    return { bobblehead: record };
  },

  async 'POST /api/bobbleheads/delete'(req) {
    const body = await readBody(req);
    const file = await readJson('bobbleheads.json');
    const target = (file.bobbleheads ?? []).find((item) => item.id === body.id);
    if (!target) throw Object.assign(new Error('Bobblehead not found.'), { status: 404 });

    for (const image of target.images ?? []) {
      await unlink(path.join(bobbleheadImagesDir, image)).catch(() => {});
    }
    file.bobbleheads = file.bobbleheads.filter((item) => item.id !== target.id);
    await writeJson('bobbleheads.json', file);
    return { deleted: target.id };
  },

  async 'POST /api/collections'(req) {
    const body = await readBody(req);
    const name = String(body.name ?? '').trim();
    if (!name) throw new Error('Collection name is required.');

    const file = await readJson('collections.json');
    const id = slug(body.id || name);
    if ((file.collections ?? []).some((c) => c.id === id)) {
      throw new Error(`Collection "${id}" already exists.`);
    }

    const collection = { id, name, description: String(body.description ?? '').trim() };
    file.collections = [...(file.collections ?? []), collection];
    await writeJson('collections.json', file);
    return { collection };
  },

  async 'POST /api/collections/update'(req) {
    const body = await readBody(req);
    const name = String(body.name ?? '').trim();
    if (!name) throw new Error('Collection name is required.');

    const file = await readJson('collections.json');
    const index = (file.collections ?? []).findIndex((c) => c.id === body.originalId);
    if (index < 0) throw Object.assign(new Error('Collection not found.'), { status: 404 });

    const previousId = file.collections[index].id;
    const id = slug(body.id || name) || previousId;
    if (id !== previousId && file.collections.some((c) => c.id === id)) {
      throw new Error(`Collection "${id}" already exists.`);
    }

    const collection = { id, name, description: String(body.description ?? '').trim() };
    file.collections[index] = collection;
    await writeJson('collections.json', file);

    if (id !== previousId) {
      const balls = await readJson('baseballs.json');
      balls.baseballs = (balls.baseballs ?? []).map((ball) => ({
        ...ball,
        collections: (ball.collections ?? []).map((value) => (value === previousId ? id : value))
      }));
      await writeJson('baseballs.json', balls);
    }

    return { collection };
  },

  async 'POST /api/collections/delete'(req) {
    const body = await readBody(req);
    const file = await readJson('collections.json');
    const target = (file.collections ?? []).find((c) => c.id === body.id);
    if (!target) throw Object.assign(new Error('Collection not found.'), { status: 404 });

    file.collections = file.collections.filter((c) => c.id !== target.id);
    await writeJson('collections.json', file);

    const balls = await readJson('baseballs.json');
    balls.baseballs = (balls.baseballs ?? []).map((ball) => ({
      ...ball,
      collections: (ball.collections ?? []).filter((value) => value !== target.id)
    }));
    await writeJson('baseballs.json', balls);

    return { deleted: target.id };
  }
};

async function serveStatic(req, res, url) {
  const isBaseballImage = url.pathname.startsWith('/images/baseballs/');
  const isBobbleheadImage = url.pathname.startsWith('/images/bobbleheads/');
  const isImage = isBaseballImage || isBobbleheadImage;
  const isLib = url.pathname.startsWith('/lib/');
  const baseDir = isBaseballImage
    ? baseballImagesDir
    : isBobbleheadImage
      ? bobbleheadImagesDir
      : isLib ? libDir : adminDir;
  const relative = isImage
    ? url.pathname.split('/').slice(3).join('/')
    : isLib
      ? url.pathname.slice('/lib/'.length)
      : url.pathname.slice(1) || 'index.html';
  const filePath = path.join(baseDir, path.normalize(decodeURIComponent(relative)));

  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const body = await readFile(filePath).catch(() => null);
  if (!body) {
    res.writeHead(404).end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': STATIC_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store'
  });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = routes[`${req.method} ${url.pathname}`];

  if (!handler) {
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint' });
    return serveStatic(req, res, url);
  }

  try {
    return json(res, 200, await handler(req));
  } catch (error) {
    return json(res, error.status ?? 400, { error: error.message });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Admin screen (local only) at http://localhost:${port}`);
});
