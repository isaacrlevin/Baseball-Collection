const text = (value) => String(value ?? '').trim();

export function normalizeBobblehead(raw) {
  return {
    id: text(raw.id),
    name: text(raw.name),
    year: text(raw.year),
    notes: text(raw.notes),
    images: Array.isArray(raw.images) ? [...raw.images] : []
  };
}

export function bobbleheadSearchText(bobblehead) {
  return [bobblehead.name, bobblehead.year, bobblehead.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
