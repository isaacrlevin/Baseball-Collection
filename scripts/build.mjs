import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBaseball, displayTitle, searchText } from '../lib/baseball.mjs';
import { normalizeBobblehead, bobbleheadSearchText } from '../lib/bobblehead.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const SITE = {
  baseballs: {
    title: 'Autographed Baseball Collection',
    tagline: 'A signed ball for every story.'
  },
  bobbleheads: {
    title: 'Bobblehead Collection',
    tagline: 'A shelf full of baseball history.'
  }
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function renderCard(ball, collectionsById) {
  const cover = ball.images[0];
  const title = displayTitle(ball);
  const sortYear = ball.signatures
    .map((signature) => signature.signedYear)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] ?? '';
  const tags = ball.collections.map((id) => collectionsById.get(id)).filter(Boolean);

  const media = cover
    ? `<img class="card__image card__image--baseball" src="images/baseballs/${encodeURIComponent(cover)}" alt="Baseball signed by ${escapeHtml(title)}" loading="lazy" width="600" height="600">`
    : '<div class="card__image card__image--empty" aria-hidden="true">No photo yet</div>';

  const signatures = ball.signatures
    .map((signature) => {
      const detail = [signature.team, signature.signedYear, signature.inscription && `\u201c${signature.inscription}\u201d`]
        .filter(Boolean)
        .join(' \u00b7 ');
      return `<li><span class="sig__name">${escapeHtml(signature.player)}</span>${detail ? `<span class="sig__detail">${escapeHtml(detail)}</span>` : ''}</li>`;
    })
    .join('');

  const meta = [
    ball.authentication && `<dt>Authentication</dt><dd>${escapeHtml(ball.authentication)}</dd>`,
    ball.acquired && `<dt>Acquired</dt><dd>${escapeHtml(ball.acquired)}</dd>`
  ]
    .filter(Boolean)
    .join('');

  const badges = [
    ball.signatures.length > 1 && `${ball.signatures.length} signatures`,
    ball.images.length > 1 && `${ball.images.length} photos`
  ]
    .filter(Boolean)
    .map((label) => `<span class="card__count">${label}</span>`)
    .join('');

  return `
      <article class="card" data-name="${escapeHtml(title)}" data-year="${escapeHtml(sortYear)}" data-collections="${escapeHtml(ball.collections.join(' '))}" data-search="${escapeHtml(`${searchText(ball)} ${tags.map((t) => t.name).join(' ').toLowerCase()}`)}"${ball.featured ? ' data-featured="true"' : ''}>
        <div class="card__media"${cover ? ` role="button" tabindex="0" data-images="${escapeHtml(JSON.stringify(ball.images))}" data-title="${escapeHtml(title)}"` : ''}>${media}${badges ? `<div class="card__badges">${badges}</div>` : ''}</div>
        <div class="card__body">
          <h2 class="card__title">${escapeHtml(title)}</h2>
          <ul class="card__signatures">${signatures}</ul>
          ${meta ? `<dl class="card__meta">${meta}</dl>` : ''}
          ${ball.notes ? `<p class="card__notes">${escapeHtml(ball.notes)}</p>` : ''}
          ${tags.length ? `<ul class="card__tags">${tags.map((t) => `<li>${escapeHtml(t.name)}</li>`).join('')}</ul>` : ''}
        </div>
      </article>`;
}

function renderNavigation(active) {
  return `<nav class="site-nav" aria-label="Collection type">
      <a href="index.html"${active === 'baseballs' ? ' aria-current="page"' : ''}>Baseballs</a>
      <a href="bobbleheads.html"${active === 'bobbleheads' ? ' aria-current="page"' : ''}>Bobbleheads</a>
    </nav>`;
}

function renderBaseballPage({ baseballs, collections, counts }) {
  const collectionsById = new Map(collections.map((c) => [c.id, c]));
  const filters = [
    `<button class="chip chip--active" type="button" data-filter="all">All <span class="chip__count">${baseballs.length}</span></button>`,
    ...collections
      .filter((c) => counts.get(c.id))
      .map(
        (c) =>
          `<button class="chip" type="button" data-filter="${escapeHtml(c.id)}" title="${escapeHtml(c.description ?? '')}">${escapeHtml(c.name)} <span class="chip__count">${counts.get(c.id)}</span></button>`
      )
  ].join('\n        ');

  const cards = baseballs.map((ball) => renderCard(ball, collectionsById)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(SITE.baseballs.title)}</title>
  <meta name="description" content="${escapeHtml(SITE.baseballs.tagline)}">
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  ${renderNavigation('baseballs')}
  <header class="hero">
    <h1>${escapeHtml(SITE.baseballs.title)}</h1>
    <p>${escapeHtml(SITE.baseballs.tagline)}</p>
    <p class="hero__stats">${baseballs.length} baseballs &middot; ${collections.filter((c) => counts.get(c.id)).length} collections</p>
  </header>

  <main>
    <section class="controls" aria-label="Filters">
      <div class="chips" role="group" aria-label="Filter by collection">
        ${filters}
      </div>
      <label class="search">
        <span class="visually-hidden">Search baseballs</span>
        <input type="search" id="search" placeholder="Search by player, team, or collection&hellip;" autocomplete="off">
      </label>
      <label class="sort">Order by
        <select id="sort">
          <option value="name-asc">Name (A&ndash;Z)</option>
          <option value="name-desc">Name (Z&ndash;A)</option>
          <option value="year-desc">Year (newest first)</option>
          <option value="year-asc">Year (oldest first)</option>
        </select>
      </label>
    </section>

    <p class="empty" id="empty" hidden>No baseballs match those filters.</p>

    <section class="grid" id="grid">
${cards}
    </section>
  </main>

  <footer class="footer">
    <p>Built ${new Date().toISOString().slice(0, 10)}</p>
  </footer>

  <dialog class="lightbox" id="lightbox">
    <button class="lightbox__close" type="button" data-close aria-label="Close">&times;</button>
    <div class="lightbox__stage">
      <button class="lightbox__nav" type="button" data-gallery-prev aria-label="Previous photo">&lsaquo;</button>
      <img class="lightbox__image" id="lightbox-image" alt="">
      <button class="lightbox__nav" type="button" data-gallery-next aria-label="Next photo">&rsaquo;</button>
    </div>
    <p class="lightbox__counter" id="lightbox-counter" aria-live="polite"></p>
    <div class="lightbox__thumbnails" id="lightbox-thumbnails" aria-label="Choose a photo"></div>
  </dialog>

  <script src="assets/app.js" defer></script>
</body>
</html>
`;
}

function renderBobbleheadCard(bobblehead) {
  const cover = bobblehead.images[0];
  const media = cover
    ? `<img class="card__image" src="images/bobbleheads/${encodeURIComponent(cover)}" alt="${escapeHtml(bobblehead.name)} bobblehead" loading="lazy" width="600" height="600">`
    : '<div class="card__image card__image--empty" aria-hidden="true">No photo yet</div>';
  const badges = bobblehead.images.length > 1
    ? `<div class="card__badges"><span class="card__count">${bobblehead.images.length} photos</span></div>`
    : '';

  return `
      <article class="card" data-name="${escapeHtml(bobblehead.name)}" data-year="${escapeHtml(bobblehead.year)}" data-search="${escapeHtml(bobbleheadSearchText(bobblehead))}">
        <div class="card__media"${cover ? ` role="button" tabindex="0" data-image-folder="bobbleheads" data-images="${escapeHtml(JSON.stringify(bobblehead.images))}" data-title="${escapeHtml(bobblehead.name)}" data-item-type="Bobblehead"` : ''}>${media}${badges}</div>
        <div class="card__body">
          <h2 class="card__title">${escapeHtml(bobblehead.name)}</h2>
          ${bobblehead.year ? `<dl class="card__meta"><dt>Year</dt><dd>${escapeHtml(bobblehead.year)}</dd></dl>` : ''}
          ${bobblehead.notes ? `<p class="card__notes">${escapeHtml(bobblehead.notes)}</p>` : ''}
        </div>
      </article>`;
}

function renderBobbleheadPage(bobbleheads) {
  const years = [...new Set(bobbleheads.map((item) => item.year).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const filters = [
    `<button class="chip chip--active" type="button" data-filter="all">All <span class="chip__count">${bobbleheads.length}</span></button>`,
    ...years.map((year) => {
      const count = bobbleheads.filter((item) => item.year === year).length;
      return `<button class="chip" type="button" data-filter="${escapeHtml(year)}">${escapeHtml(year)} <span class="chip__count">${count}</span></button>`;
    })
  ].join('\n        ');
  const cards = bobbleheads.map(renderBobbleheadCard).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(SITE.bobbleheads.title)}</title>
  <meta name="description" content="${escapeHtml(SITE.bobbleheads.tagline)}">
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  ${renderNavigation('bobbleheads')}
  <header class="hero">
    <h1>${escapeHtml(SITE.bobbleheads.title)}</h1>
    <p>${escapeHtml(SITE.bobbleheads.tagline)}</p>
    <p class="hero__stats">${bobbleheads.length} bobbleheads</p>
  </header>
  <main>
    <section class="controls" aria-label="Filters">
      <div class="chips" role="group" aria-label="Filter by year">
        ${filters}
      </div>
      <label class="sort">Order by
        <select id="sort">
          <option value="name-asc">Name (A&ndash;Z)</option>
          <option value="name-desc">Name (Z&ndash;A)</option>
          <option value="year-desc">Year (newest first)</option>
          <option value="year-asc">Year (oldest first)</option>
        </select>
      </label>
    </section>
    <p class="empty" id="empty" hidden>No bobbleheads match that year.</p>
    <section class="grid" id="grid">
${cards}
    </section>
  </main>
  <footer class="footer"><p>Built ${new Date().toISOString().slice(0, 10)}</p></footer>
  <dialog class="lightbox" id="lightbox">
    <button class="lightbox__close" type="button" data-close aria-label="Close">&times;</button>
    <div class="lightbox__stage">
      <button class="lightbox__nav" type="button" data-gallery-prev aria-label="Previous photo">&lsaquo;</button>
      <img class="lightbox__image" id="lightbox-image" alt="">
      <button class="lightbox__nav" type="button" data-gallery-next aria-label="Next photo">&rsaquo;</button>
    </div>
    <p class="lightbox__counter" id="lightbox-counter" aria-live="polite"></p>
    <div class="lightbox__thumbnails" id="lightbox-thumbnails" aria-label="Choose a photo"></div>
  </dialog>
  <script src="assets/app.js" defer></script>
</body>
</html>
`;
}

async function build() {
  const { baseballs: rawBaseballs = [] } = await readJson('data/baseballs.json');
  const { bobbleheads: rawBobbleheads = [] } = await readJson('data/bobbleheads.json');
  const { collections = [] } = await readJson('data/collections.json');

  const baseballs = rawBaseballs.map(normalizeBaseball);
  const bobbleheads = rawBobbleheads.map(normalizeBobblehead);
  const knownCollections = new Set(collections.map((c) => c.id));
  const counts = new Map(collections.map((c) => [c.id, 0]));

  for (const ball of baseballs) {
    if (!ball.id || ball.signatures.length === 0) {
      throw new Error(`Every baseball needs an "id" and at least one signature: ${JSON.stringify(ball)}`);
    }

    for (const bobblehead of bobbleheads) {
      if (!bobblehead.id || !bobblehead.name) {
        throw new Error(`Every bobblehead needs an "id" and "name": ${JSON.stringify(bobblehead)}`);
      }
    }
    for (const id of ball.collections) {
      if (!knownCollections.has(id)) {
        throw new Error(`Baseball "${ball.id}" references unknown collection "${id}".`);
      }
      counts.set(id, counts.get(id) + 1);
    }
  }

  const sorted = [...baseballs].sort((a, b) => {
    if (Boolean(b.featured) !== Boolean(a.featured)) return b.featured ? 1 : -1;
    return displayTitle(a).localeCompare(displayTitle(b));
  });

  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'assets'), { recursive: true });

  const sortedBobbleheads = [...bobbleheads].sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(path.join(dist, 'index.html'), renderBaseballPage({ baseballs: sorted, collections, counts }));
  await writeFile(path.join(dist, 'bobbleheads.html'), renderBobbleheadPage(sortedBobbleheads));
  await cp(path.join(root, 'public', 'styles.css'), path.join(dist, 'assets', 'styles.css'));
  await cp(path.join(root, 'public', 'app.js'), path.join(dist, 'assets', 'app.js'));
  await writeFile(path.join(dist, '.nojekyll'), '');

  if (await exists(path.join(root, 'images'))) {
    await cp(path.join(root, 'images'), path.join(dist, 'images'), { recursive: true });
  }

  console.log(`Built ${sorted.length} baseballs and ${sortedBobbleheads.length} bobbleheads -> dist/`);
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
