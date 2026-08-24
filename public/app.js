const cards = Array.from(document.querySelectorAll('.card'));
const chips = Array.from(document.querySelectorAll('.chip'));
const search = document.getElementById('search');
const sort = document.getElementById('sort');
const empty = document.getElementById('empty');
const grid = document.getElementById('grid');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxCounter = document.getElementById('lightbox-counter');
const lightboxThumbnails = document.getElementById('lightbox-thumbnails');
const previousButton = lightbox.querySelector('[data-gallery-prev]');
const nextButton = lightbox.querySelector('[data-gallery-next]');

let activeFilter = 'all';
let galleryImages = [];
let galleryIndex = 0;

function applyFilters() {
  const term = search?.value.trim().toLowerCase() ?? '';
  let visible = 0;

  for (const card of cards) {
    const values = card.dataset.collections?.split(' ') ?? [card.dataset.year];
    const matchesFilter = activeFilter === 'all' || values.includes(activeFilter);
    const matchesTerm = !term || card.dataset.search.includes(term);
    const show = matchesFilter && matchesTerm;
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
    const filterParam = cards.some((card) => card.dataset.collections !== undefined)
      ? 'collection'
      : 'year';
    if (activeFilter === 'all') url.searchParams.delete(filterParam);
    else url.searchParams.set(filterParam, activeFilter);
    history.replaceState(null, '', url);
    applyFilters();
  });
}

search?.addEventListener('input', applyFilters);
sort?.addEventListener('change', applySort);

function applySort() {
  const [field, direction] = sort.value.split('-');
  const sorted = [...cards].sort((left, right) => {
    const leftValue = left.dataset[field] ?? '';
    const rightValue = right.dataset[field] ?? '';

    if (field === 'year') {
      if (!leftValue && !rightValue) return compareNames(left, right);
      if (!leftValue) return 1;
      if (!rightValue) return -1;
    }

    const comparison = leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
    if (comparison !== 0) return direction === 'desc' ? -comparison : comparison;
    return compareNames(left, right);
  });
  grid.append(...sorted);
}

function compareNames(left, right) {
  return (left.dataset.name ?? '').localeCompare(right.dataset.name ?? '', undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

document.addEventListener('click', (event) => {
  const media = event.target.closest('.card__media[data-images]');
  if (media) openLightbox(media);
  if (event.target.closest('[data-close]')) lightbox.close();
  if (event.target.closest('[data-gallery-prev]')) showGalleryImage(galleryIndex - 1);
  if (event.target.closest('[data-gallery-next]')) showGalleryImage(galleryIndex + 1);
});

document.addEventListener('keydown', (event) => {
  if (lightbox.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    showGalleryImage(galleryIndex + (event.key === 'ArrowRight' ? 1 : -1));
    return;
  }
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
  const folder = media.dataset.imageFolder ?? 'baseballs';
  const alt = `${media.dataset.itemType ?? 'Baseball signed by'} ${media.dataset.title}`;
  galleryImages = images.map((file) => ({
    src: `images/${folder}/${encodeURIComponent(file)}`,
    alt
  }));
  galleryIndex = 0;
  lightboxThumbnails.replaceChildren(
    ...galleryImages.map((image, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lightbox__thumbnail';
      button.setAttribute('aria-label', `View photo ${index + 1}`);
      const thumbnail = document.createElement('img');
      thumbnail.src = image.src;
      thumbnail.alt = '';
      button.append(thumbnail);
      button.addEventListener('click', () => showGalleryImage(index));
      return button;
    })
  );
  showGalleryImage(0);
  lightbox.showModal();
}

function showGalleryImage(index) {
  if (galleryImages.length === 0) return;
  galleryIndex = (index + galleryImages.length) % galleryImages.length;
  const image = galleryImages[galleryIndex];
  lightboxImage.src = image.src;
  lightboxImage.alt = image.alt;
  lightboxCounter.textContent = `${galleryIndex + 1} of ${galleryImages.length}`;
  previousButton.hidden = galleryImages.length < 2;
  nextButton.hidden = galleryImages.length < 2;
  lightboxThumbnails.hidden = galleryImages.length < 2;
  for (const [thumbnailIndex, thumbnail] of [...lightboxThumbnails.children].entries()) {
    const current = thumbnailIndex === galleryIndex;
    thumbnail.classList.toggle('lightbox__thumbnail--active', current);
    thumbnail.setAttribute('aria-current', current ? 'true' : 'false');
  }
}

const filterParam = cards.some((card) => card.dataset.collections !== undefined)
  ? 'collection'
  : 'year';
const preselected = new URL(window.location.href).searchParams.get(filterParam);
const preselectedChip = preselected && chips.find((chip) => chip.dataset.filter === preselected);
applySort();
if (preselectedChip) preselectedChip.click();
else applyFilters();
