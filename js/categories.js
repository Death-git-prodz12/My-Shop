// Registre des catégories + analyseur de repli « Undefined / Divers ».
// Module pur (aucune dépendance navigateur) : importable par les pages, api.js et les tests Node.

export const FALLBACK_CATEGORY = "divers";

export const CAT = Object.freeze({
  maison: "Maison et déco",
  gadgets: "Gadgets",
  beaute: "Beauté",
  mode: "Mode et accessoires",
  sport: "Sport et fitness",
  animaux: "Animaux",
  tendances: "Tendances",
  [FALLBACK_CATEGORY]: "Undefined / Divers"
});

// Mots-clés FR/EN par catégorie (comparés sans accents, en minuscules, sur des mots entiers).
const KEYWORDS = Object.freeze({
  maison: ["home", "house", "household", "maison", "deco", "decoration", "decor", "kitchen", "cuisine", "furniture", "meuble", "garden", "jardin",
    "bottle", "bouteille", "tumbler", "gourde", "lamp", "lampe", "diffuser", "diffuseur", "storage", "rangement", "bedding", "linge", "candle", "bougie", "cleaning", "menage"],
  gadgets: ["gadget", "gadgets", "tech", "electronics", "electronic", "electronique", "hightech", "phone", "smartphone", "usb", "charger", "chargeur", "camera",
    "camera", "led", "speaker", "enceinte", "projector", "projecteur", "smart", "drone", "earbuds", "ecouteurs", "headphones", "casque", "vr", "gaming"],
  beaute: ["beauty", "beaute", "cosmetic", "cosmetics", "cosmetique", "skincare", "skin", "soin", "soins", "serum", "makeup", "maquillage", "hair", "cheveux",
    "nail", "ongles", "perfume", "parfum", "face", "visage"],
  mode: ["fashion", "mode", "clothing", "clothes", "vetement", "vetements", "apparel", "shoes", "chaussures", "bag", "bags", "sac", "jewelry", "jewellery", "bijou", "bijoux", "watch", "montre"],
  sport: ["sport", "sports", "fitness", "gym", "yoga", "outdoor", "camping", "running", "cycling", "velo", "musculation", "training"],
  animaux: ["pet", "pets", "animal", "animaux", "dog", "dogs", "chien", "chiens", "cat", "cats", "chat", "chats"],
  tendances: ["trending", "tendance", "tendances", "viral", "bestseller", "bestsellers", "trend"]
});

/** minuscules, sans accents, ponctuation → espaces. */
export const fold = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const ALIASES = new Map();
for (const [id, label] of Object.entries(CAT)) { ALIASES.set(fold(id), id); ALIASES.set(fold(label), id); }
for (const [alias, id] of [["household", "maison"], ["home", "maison"], ["tech", "gadgets"], ["beauty", "beaute"], ["fashion", "mode"], ["pets", "animaux"], ["trending", "tendances"],
  ["tendances divers", "tendances"], ["undefined", FALLBACK_CATEGORY], ["divers", FALLBACK_CATEGORY], ["other", FALLBACK_CATEGORY], ["autre", FALLBACK_CATEGORY], ["misc", FALLBACK_CATEGORY]]) ALIASES.set(fold(alias), id);

const asList = v => Array.isArray(v) ? v.flatMap(asList) : (v == null ? [] : String(v).split(/[,;>|/]+/));
const hits = (text, words) => {
  const padded = ` ${text} `;
  return words.reduce((n, w) => n + (padded.includes(` ${w} `) ? 1 : 0), 0);
};

/**
 * Rattache un produit à une catégorie connue, sans jamais le perdre.
 * 1) alias exact  →  2) mots-clés pondérés (catégorie ×3, tags/fil d'Ariane ×2, titre ×1, seuil 2)  →  3) repli « Undefined / Divers ».
 * La valeur d'origine est toujours renvoyée dans `raw` pour que l'import reste traçable.
 */
export function resolveCategory({ category, tags, breadcrumbs, title } = {}) {
  const raw = String(category ?? "").trim();
  const exact = ALIASES.get(fold(raw));
  if (exact && raw) return { id: exact, via: exact === FALLBACK_CATEGORY ? "fallback" : "alias", raw };

  const sources = [[asList(category).map(fold).join(" "), 3], [[...asList(tags), ...asList(breadcrumbs)].map(fold).join(" "), 2], [fold(title), 1]];
  let best = { id: FALLBACK_CATEGORY, score: 0 };
  for (const [id, words] of Object.entries(KEYWORDS)) {
    const score = sources.reduce((s, [text, weight]) => s + hits(text, words) * weight, 0);
    if (score > best.score) best = { id, score };
  }
  if (best.score >= 2) return { id: best.id, via: "keyword", raw };
  return { id: FALLBACK_CATEGORY, via: "fallback", raw };
}
