import { adminDb } from "./_lib/firebase-admin.js";
import { json, requireUser } from "./_lib/http.js";

export const config = { path: "/api/products/:id/history", method: "GET" };

export default async function handler(request, context) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  try {
    const id = decodeURIComponent(context.params?.id || "");
    const safeId = Buffer.from(id).toString("base64url");
    const snapshot = await adminDb().collection("catalogProducts").doc(safeId).get();
    if (!snapshot.exists) return json(200, { history: [] });
    return json(200, { history: snapshot.data()?.priceHistory || [] });
  } catch (error) {
    console.error("[MyShop history] Firestore unavailable:", error.message);
    return json(503, { error: "Historique temporairement indisponible." });
  }
}
