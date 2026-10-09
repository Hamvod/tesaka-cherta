import { getApps, initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

if (getApps().length === 0) {
  initializeApp();
}
setGlobalOptions({ region: "us-central1", maxInstances: 10, memory: "256MiB", concurrency: 20 });
