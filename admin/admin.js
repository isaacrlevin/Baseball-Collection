import { guessFromFilename } from '../lib/baseball.mjs';

const form = document.getElementById('ball-form');
const formTitle = document.getElementById('form-title');
const signatureRows = document.getElementById('signature-rows');
const collectionOptions = document.getElementById('collection-options');
const existingImages = document.getElementById('existing-images');
const newImagesInput = document.getElementById('new-images');
const ballList = document.getElementById('ball-list');
const ballCount = document.getElementById('ball-count');
const collectionForm = document.getElementById('collection-form');
const collectionFormTitle = document.getElementById('collection-form-title');
const collectionList = document.getElementById('collection-list');
const scanPanel = document.getElementById('scan-panel');
const scanThumbs = document.getElementById('scan-thumbs');
const scanCount = document.getElementById('scan-count');
const scanEmpty = document.getElementById('scan-empty');
const unscannedTabCount = document.getElementById('unscanned-tab-count');
const scanActions = document.getElementById('scan-actions');
const scanCreateSelected = document.getElementById('scan-create-selected');
const statusEl = document.getElementById('status');
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const tabPages = Array.from(document.querySelectorAll('[role="tabpanel"]'));

let selectedScanFiles = new Set();

let state = { baseballs: [], collections: [], unassignedImages: [] };
let keptImages = [];

function selectTab(pageId, focus = false) {
  for (const tab of tabs) {
    const selected = tab.dataset.tabTarget === pageId;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const page of tabPages) page.hidden = page.id !== pageId;
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tabTarget));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const index = tabs.indexOf(tab);
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    selectTab(next.dataset.tabTarget, true);
  });
}

function setStatus(message, kind = 'ok') {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  statusEl.hidden = !message;
}

async function api(pathname, body) {
  const response = await fetch(pathname, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Request failed');
  return payload;
}

function renderCollectionOptions(selected = []) {
  collectionOptions.replaceChildren(
    ...state.collections.map((collection) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'collections';
      input.value = collection.id;
      input.checked = selected.includes(collection.id);
      label.append(input, document.createTextNode(collection.name));
      return label;
    })
  );
}

const SIGNATURE_FIELDS = [
  { key: 'player', label: 'Player *', required: true },
  { key: 'team', label: 'Team' },
  { key: 'signedYear', label: 'Signed year' },
  { key: 'inscription', label: 'Inscription' }
];

function addSignatureRow(signature = {}) {
  const row = document.createElement('div');
  row.className = 'signature';

  for (const field of SIGNATURE_FIELDS) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.dataset.signatureField = field.key;
    input.value = signature[field.key] ?? '';
    if (field.required) input.required = true;
    label.append(input);
    row.append(label);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger signature__remove';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    row.remove();
    if (!signatureRows.children.length) addSignatureRow();
  });

  row.append(remove);
  signatureRows.append(row);
  return row;
}

function renderSignatures(signatures = []) {
  signatureRows.replaceChildren();
  if (signatures.length === 0) addSignatureRow();
  else signatures.forEach((signature) => addSignatureRow(signature));
}

function readSignatures() {
  return Array.from(signatureRows.querySelectorAll('.signature'))
    .map((row) => {
      const signature = {};
      for (const input of row.querySelectorAll('[data-signature-field]')) {
        signature[input.dataset.signatureField] = input.value.trim();
      }
      return signature;
    })
    .filter((signature) => signature.player);
}

function renderExistingImages() {
  existingImages.replaceChildren(
    ...keptImages.map((file, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'thumb';

      const img = document.createElement('img');
      img.src = `/images/${encodeURIComponent(file)}`;
      img.alt = file;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '\u00d7';
      remove.title = 'Remove photo (file is deleted on save)';
      remove.addEventListener('click', () => {
        keptImages = keptImages.filter((name) => name !== file);
        renderExistingImages();
      });

      const order = document.createElement('div');
      order.className = 'thumb__order';
      for (const [text, offset, disabled] of [
        ['\u2190', -1, index === 0],
        ['\u2192', 1, index === keptImages.length - 1]
      ]) {
        const move = document.createElement('button');
        move.type = 'button';
        move.textContent = text;
        move.disabled = disabled;
        move.title = 'Reorder photo';
        move.addEventListener('click', () => {
          const target = index + offset;
          [keptImages[index], keptImages[target]] = [keptImages[target], keptImages[index]];
          renderExistingImages();
        });
        order.append(move);
      }

      wrapper.append(img, remove, order);
      if (index === 0) {
        const cover = document.createElement('span');
        cover.className = 'thumb__cover';
        cover.textContent = 'Cover';
        wrapper.append(cover);
      }
      return wrapper;
    })
  );
}

function displayTitle(ball) {
  if (ball.title) return ball.title;
  const names = (ball.signatures ?? []).map((signature) => signature.player);
  if (names.length === 0) return 'Untitled baseball';
  if (names.length <= 2) return names.join(' & ');
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
}

function renderBallList() {
  ballCount.textContent = String(state.baseballs.length);
  const namesById = new Map(state.collections.map((c) => [c.id, c.name]));

  ballList.replaceChildren(
    ...[...state.baseballs]
      .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)))
      .map((ball) => {
        const title = displayTitle(ball);
        const li = document.createElement('li');

        if (ball.images?.length) {
          const img = document.createElement('img');
          img.src = `/images/${encodeURIComponent(ball.images[0])}`;
          img.alt = title;
          li.append(img);
        } else {
          const placeholder = document.createElement('div');
          placeholder.className = 'no-photo';
          placeholder.textContent = 'No photo';
          li.append(placeholder);
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        const name = document.createElement('strong');
        name.textContent = title;
        const detail = document.createElement('span');
        const parts = [
          `${ball.signatures.length} signature${ball.signatures.length === 1 ? '' : 's'}`,
          `${ball.images.length} photo${ball.images.length === 1 ? '' : 's'}`,
          (ball.collections ?? []).map((id) => namesById.get(id) ?? id).join(', ') || 'No collections'
        ];
        detail.textContent = parts.join(' \u00b7 ');
        meta.append(name, detail);

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => loadIntoForm(ball));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger';
        remove.textContent = 'Delete';
        remove.addEventListener('click', async () => {
          if (!confirm(`Delete ${title} and its photos?`)) return;
          try {
            await api('/api/baseballs/delete', { id: ball.id });
            await refresh();
            setStatus(`Deleted ${title}.`);
          } catch (error) {
            setStatus(error.message, 'error');
          }
        });

        li.append(meta, edit, remove);
        return li;
      })
  );
}

function renderCollectionList() {
  collectionList.replaceChildren(
    ...state.collections.map((collection) => {
      const used = state.baseballs.filter((ball) => (ball.collections ?? []).includes(collection.id)).length;
      const li = document.createElement('li');

      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('strong');
      name.textContent = collection.name;
      const detail = document.createElement('span');
      detail.textContent = `${collection.id} \u00b7 ${used} baseball${used === 1 ? '' : 's'}`;
      meta.append(name, detail);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => loadCollectionIntoForm(collection));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        const warning = used
          ? `Delete "${collection.name}"? It will be removed from ${used} baseball${used === 1 ? '' : 's'}.`
          : `Delete "${collection.name}"?`;
        if (!confirm(warning)) return;
        try {
          await api('/api/collections/delete', { id: collection.id });
          resetCollectionForm();
          await refresh();
          setStatus(`Deleted collection "${collection.name}".`);
        } catch (error) {
          setStatus(error.message, 'error');
        }
      });

      li.append(meta, edit, remove);
      return li;
    })
  );
}

function renderScanPanel() {
  const files = state.unassignedImages ?? [];
  scanPanel.hidden = files.length === 0;
  scanEmpty.hidden = files.length > 0;
  scanCount.textContent = String(files.length);
  unscannedTabCount.textContent = files.length ? `(${files.length})` : '';

  // Drop selections for files that scanned away (adopted or discarded elsewhere).
  selectedScanFiles = new Set([...selectedScanFiles].filter((file) => files.includes(file)));

  scanThumbs.replaceChildren(
    ...files.map((file) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'thumb thumb--scan';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'thumb__select';
      checkbox.checked = selectedScanFiles.has(file);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedScanFiles.add(file);
        else selectedScanFiles.delete(file);
        updateScanActions();
      });

      const img = document.createElement('img');
      img.src = `/images/${encodeURIComponent(file)}`;
      img.alt = file;

      const caption = document.createElement('span');
      caption.className = 'thumb__name';
      caption.textContent = file;

      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'primary';
      create.textContent = 'Create record';
      create.addEventListener('click', () => startRecordForImages([file]));

      const discard = document.createElement('button');
      discard.type = 'button';
      discard.className = 'danger';
      discard.textContent = 'Discard';
      discard.addEventListener('click', async () => {
        if (!confirm(`Delete the file ${file} from images/?`)) return;
        try {
          await api('/api/images/discard', { name: file });
          await refresh();
          setStatus(`Discarded ${file}.`);
        } catch (error) {
          setStatus(error.message, 'error');
        }
      });

      wrapper.append(checkbox, img, caption, create, discard);
      return wrapper;
    })
  );

  updateScanActions();
}

function updateScanActions() {
  const count = selectedScanFiles.size;
  scanActions.hidden = count === 0;
  scanCreateSelected.textContent =
    count > 1 ? `Create one record from ${count} selected photos` : `Create record from selected photo`;
}

/** Guesses signature names (and a signed year) per photo, merging duplicates across files. */
function startRecordForImages(files) {
  resetForm();
  keptImages = [...files];
  renderExistingImages();

  const guessedSignatures = [];
  for (const file of files) {
    for (const signature of guessFromFilename(file).signatures) {
      if (!signature.player) continue;
      if (guessedSignatures.some((existing) => existing.player === signature.player)) continue;
      guessedSignatures.push(signature);
    }
  }

  renderSignatures(guessedSignatures);
  formTitle.textContent =
    files.length > 1 ? `New baseball from ${files.length} photos` : `New baseball from ${files[0]}`;
  selectTab('baseballs-page');
  signatureRows.querySelector('input')?.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


function loadCollectionIntoForm(collection) {
  selectTab('collections-page');
  collectionFormTitle.textContent = `Edit collection: ${collection.name}`;
  collectionForm.elements.originalId.value = collection.id;
  collectionForm.elements.name.value = collection.name;
  collectionForm.elements.description.value = collection.description ?? '';
  collectionForm.elements.id.value = collection.id;
  collectionForm.elements.name.focus();
}

function resetCollectionForm() {
  collectionForm.reset();
  collectionForm.elements.originalId.value = '';
  collectionFormTitle.textContent = 'New collection';
}

function loadIntoForm(ball) {
  selectTab('baseballs-page');
  formTitle.textContent = `Edit: ${displayTitle(ball)}`;
  form.originalId.value = ball.id;
  form.elements.title.value = ball.title ?? '';
  form.authentication.value = ball.authentication ?? '';
  form.acquired.value = ball.acquired ?? '';
  form.notes.value = ball.notes ?? '';
  form.featured.checked = Boolean(ball.featured);
  keptImages = [...(ball.images ?? [])];
  newImagesInput.value = '';
  renderSignatures(ball.signatures ?? []);
  renderCollectionOptions(ball.collections ?? []);
  renderExistingImages();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  form.reset();
  form.originalId.value = '';
  formTitle.textContent = 'Add a baseball';
  keptImages = [];
  renderSignatures();
  renderCollectionOptions();
  renderExistingImages();
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  try {
    const signatures = readSignatures();
    if (signatures.length === 0) throw new Error('Add at least one signature with a player name.');

    const newImages = [];
    for (const file of newImagesInput.files) {
      newImages.push({ type: file.type, data: await readFileAsDataUrl(file) });
    }

    const payload = {
      originalId: form.originalId.value || undefined,
      title: form.elements.title.value,
      signatures,
      authentication: form.authentication.value,
      acquired: form.acquired.value,
      notes: form.notes.value,
      featured: form.featured.checked,
      collections: Array.from(form.querySelectorAll('input[name="collections"]:checked')).map(
        (input) => input.value
      ),
      images: keptImages,
      newImages
    };

    const { baseball } = await api('/api/baseballs', payload);
    await refresh();
    resetForm();
    setStatus(`Saved ${displayTitle(baseball)}. Run "npm run build" to update the site.`);
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

collectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const originalId = collectionForm.elements.originalId.value;
  try {
    const payload = {
      name: collectionForm.elements.name.value,
      description: collectionForm.elements.description.value,
      id: collectionForm.elements.id.value
    };
    const { collection } = originalId
      ? await api('/api/collections/update', { ...payload, originalId })
      : await api('/api/collections', payload);
    resetCollectionForm();
    await refresh();
    setStatus(`${originalId ? 'Updated' : 'Added'} collection "${collection.name}".`);
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

document.getElementById('reset-form').addEventListener('click', resetForm);
document.getElementById('reset-collection-form').addEventListener('click', resetCollectionForm);
document.getElementById('add-signature').addEventListener('click', () => {
  addSignatureRow().querySelector('input').focus();
});
scanCreateSelected.addEventListener('click', () => {
  if (selectedScanFiles.size === 0) return;
  startRecordForImages([...selectedScanFiles]);
  selectedScanFiles = new Set();
});

async function refresh() {
  const selected = Array.from(form.querySelectorAll('input[name="collections"]:checked')).map(
    (input) => input.value
  );
  state = await api('/api/data');
  renderCollectionOptions(selected);
  renderBallList();
  renderCollectionList();
  renderScanPanel();
}

// Autoscan: notice photos dropped into images/ while the admin screen is open.
async function pollForNewImages() {
  try {
    const { unassignedImages } = await api('/api/unassigned-images');
    const changed =
      unassignedImages.length !== (state.unassignedImages ?? []).length ||
      unassignedImages.some((file, index) => file !== state.unassignedImages[index]);
    if (!changed) return;
    state = { ...state, unassignedImages };
    renderScanPanel();
  } catch {
    // Server not reachable; try again on the next tick.
  }
}

setInterval(pollForNewImages, 4000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pollForNewImages();
});

renderSignatures();
refresh().catch((error) => setStatus(error.message, 'error'));
