import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app;
export function getAdminApp() {
  if (app) return app;
  if (getApps().length) app = getApps()[0];
  else {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    app = initializeApp(raw
      ? { credential: cert(JSON.parse(raw)), projectId: process.env.FIREBASE_PROJECT_ID }
      : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  }
  return app;
}
export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
