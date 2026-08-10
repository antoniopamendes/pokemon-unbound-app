export const TYPE_COLORS: Record<string, string> = {
  TYPE_NORMAL: "#A8A878",
  TYPE_FIRE: "#F08030",
  TYPE_WATER: "#6890F0",
  TYPE_ELECTRIC: "#F8D030",
  TYPE_GRASS: "#78C850",
  TYPE_ICE: "#98D8D8",
  TYPE_FIGHTING: "#C03028",
  TYPE_POISON: "#A040A0",
  TYPE_GROUND: "#E0C068",
  TYPE_FLYING: "#A890F0",
  TYPE_PSYCHIC: "#F85888",
  TYPE_BUG: "#A8B820",
  TYPE_ROCK: "#B8A038",
  TYPE_GHOST: "#705898",
  TYPE_DRAGON: "#7038F8",
  TYPE_DARK: "#705848",
  TYPE_STEEL: "#B8B8D0",
  TYPE_FAIRY: "#EE99AC",
};

export function getTypeColor(typeToken: string): string {
  return TYPE_COLORS[typeToken] ?? "#888";
}

export function getTypeTextColor(typeToken: string): string {
  // Light types get dark text; dark types get white text
  const light = new Set(["TYPE_NORMAL", "TYPE_ELECTRIC", "TYPE_GROUND", "TYPE_GRASS", "TYPE_ICE", "TYPE_STEEL"]);
  return light.has(typeToken) ? "#222" : "#fff";
}
