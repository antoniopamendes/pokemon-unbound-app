// Converts internal SPECIES_XXX tokens to lowercase, hyphenated URL slugs
// (and back), so public routes don't leak the raw ROM constant names.
// Species tokens only ever contain [A-Z0-9_], so this mapping is bijective.

export function speciesIdToSlug(speciesId: string): string {
  return speciesId.replace(/^SPECIES_/, "").toLowerCase().replace(/_/g, "-");
}

export function slugToSpeciesId(slug: string): string {
  return `SPECIES_${slug.toUpperCase().replace(/-/g, "_")}`;
}
