const cards = Array.from(document.querySelectorAll('.card'));
const chips = Array.from(document.querySelectorAll('.chip'));
const search = document.getElementById('search');
const empty = document.getElementById('empty');
const lightbox = document.getElementById('lightbox');
const lightboxImages = document.getElementById('lightbox-images');

let activeFilter = 'all';

function applyFilters() {
  const term = search.value.trim().toLowerCase();
  let visible = 0;

  for (const card of cards) {
    const inCollection =
      activeFilter === 'all' || card.dataset.collections.split(' ').includes(activeFilter);
    const matchesTerm = !term || card.dataset.search.includes(term);
    const show = inCollection && matchesTerm;
    card.hidden = !show;
    if (show) visible += 1;
  }

  empty.hidden = visible > 0;
}

for (const chip of chips) {
  chip.addEventListener('click', () => {
    activeFilter = chip.dataset.filter;
    for (const other of chips) other.classList.toggle('chip--active', other === chip);
    const url = new URL(window.location.href);
    if (activeFilter === 'all') url.searchParams.delete('collection');
    else url.searchParams.set('collection', activeFilter);
    history.replaceState(null, '', url);
    applyFilters();
  });
}

search.addEventListener('input', applyFilters);

document.addEventListener('click', (event) => {
  const media = event.target.closest('.card__media[data-images]');
  if (media) openLightbox(media);
  if (event.target.closest('[data-close]')) lightbox.close();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const media = event.target.closest?.('.card__media[data-images]');
  if (!media) return;
  event.preventDefault();
  openLightbox(media);
});

function openLightbox(media) {
  let images = [];
  try {
    images = JSON.parse(media.dataset.images);
  } catch {
    return;
  }
  lightboxImages.replaceChildren(
    ...images.map((file) => {
      const img = document.createElement('img');
      img.src = `images/${encodeURIComponent(file)}`;
      img.alt = `Baseball signed by ${media.dataset.title}`;
      return img;
    })
  );
  lightbox.showModal();
}

const preselected = new URL(window.location.href).searchParams.get('collection');
const preselectedChip = preselected && chips.find((chip) => chip.dataset.filter === preselected);
if (preselectedChip) preselectedChip.click();
else applyFilters();
