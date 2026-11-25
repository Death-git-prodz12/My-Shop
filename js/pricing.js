// Moteur de calcul des marges bénéficiaires, indépendant de tout abonnement.

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

/** Lit un montant : 29.99, "29,99 €", "1 299,00", "12.34 -- 15.00" (premier nombre). Renvoie null si illisible ou négatif. */
export function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const match = String(value).match(/-?\d[\d\s.,]*/);
  if (!match) return null;
  let s = match[0].replace(/\s+/g, "").replace(/[.,]+$/, "");
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (comma > -1) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Marge bénéficiaire en % : (prix − coût) / prix × 100, arrondie à 0,1.
 * Renvoie null (jamais une valeur inventée) si le prix ou le coût est inconnu, ou si le prix est ≤ 0.
 * Une marge négative est conservée : elle signale une vente à perte.
 */
export function computeProfitMargin(price, costPrice) {
  const p = parseAmount(price), c = parseAmount(costPrice);
  if (p === null || c === null || p <= 0) return null;
  return round1(((p - c) / p) * 100);
}

/** Bénéfice brut unitaire (avant livraison, taxes, retours et frais de plateforme). */
export function computeProfitAmount(price, costPrice) {
  const p = parseAmount(price), c = parseAmount(costPrice);
  return p === null || c === null ? null : round2(p - c);
}

/** Palier visuel de la marge : unknown · loss · low (<20) · mid (20–39,9) · high (≥40). */
export function marginTier(margin) {
  if (margin === null || margin === undefined || !Number.isFinite(Number(margin))) return "unknown";
  const m = Number(margin);
  return m < 0 ? "loss" : m < 20 ? "low" : m < 40 ? "mid" : "high";
}

export const byMarginDesc = (a, b) => (b.profitMargin ?? -Infinity) - (a.profitMargin ?? -Infinity);

export const formatPercent = n => Number.isFinite(Number(n)) && n !== null
  ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(n)) + " %" : "—";
