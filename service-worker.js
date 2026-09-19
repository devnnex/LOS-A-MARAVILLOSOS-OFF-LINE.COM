const OFFLINE_CACHE = "los-anos-offline-shell-v1";
const REMOTE_CACHE = "los-anos-offline-remote-v1";
const OFFLINE_DB = "los-anos-offline-sync-v1";
const OFFLINE_STORE = "entries";
const CONFIRMED_RETENTION_MS = 60_000;
const BRAND_CACHE = "tienda-napoles-pwa-brand-v1";
const DYNAMIC_BRAND_ASSETS = new Set(["pwa-manifest.webmanifest", "pwa-icon-192.png", "pwa-icon-512.png"]);
const APP_SHELL = [
  "./", "./index.html", "./admin.html", "./app.js", "./style.css",
  "./manifest.webmanifest", "./pwa-icon.svg", "./sound/alarm.mp3",
  "./sound/receipt-received.mp3", "./images/check.png", "./images/mesero.png",
  "./vendor/supabase-js.min.js", "./vendor/lucide.min.js",
  "./vendor/qrcode.min.js", "./vendor/jspdf.umd.min.js"
];

const isRemoteDataRequest = (url) =>
  url.hostname.endsWith(".supabase.co") || url.hostname === "script.google.com";

const openOfflineDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(OFFLINE_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(OFFLINE_STORE, { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const withStore = async (mode, action) => {
  const database = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_STORE, mode);
    const request = action(transaction.objectStore(OFFLINE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
};

const queueRequest = (entry) => withStore("readwrite", (store) => store.put(entry));
const listQueuedRequests = () => withStore("readonly", (store) => store.getAll());
const removeQueuedRequest = (id) => withStore("readwrite", (store) => store.delete(id));
const markRequestConfirmed = async (entry) => queueRequest({
  ...entry,
  status: "confirmed",
  confirmedAt: new Date().toISOString()
});

const purgeConfirmedRequests = async () => {
  const now = Date.now();
  const entries = await listQueuedRequests();
  await Promise.all(entries
    .filter((entry) => entry.status === "confirmed" && now - new Date(entry.confirmedAt || 0).getTime() >= CONFIRMED_RETENTION_MS)
    .map((entry) => removeQueuedRequest(entry.id)));
};

const scheduleConfirmedCleanup = () => {
  setTimeout(() => { void purgeConfirmedRequests(); }, CONFIRMED_RETENTION_MS);
};

const serializeRequest = async (request) => ({
  id: crypto.randomUUID(),
  url: request.url,
  method: request.method,
  headers: [...request.headers.entries()],
  body: ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text(),
  queuedAt: new Date().toISOString()
});

const wantsObject = (request) => String(request.headers.get("accept") || "").includes("application/vnd.pgrst.object+json");

const queuedWriteResponse = async (request) => {
  const text = await request.clone().text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }
  const timestamp = new Date().toISOString();
  const makeRow = (row) => ({
    ...(row && typeof row === "object" ? row : {}),
    id: row?.id || crypto.randomUUID(),
    created_at: row?.created_at || timestamp,
    updated_at: timestamp
  });
  const body = request.method === "DELETE"
    ? []
    : request.url.includes("/rpc/")
      ? { ok: true, offline_queued: true }
      : Array.isArray(payload)
        ? payload.map(makeRow)
        : wantsObject(request)
          ? makeRow(payload)
          : [makeRow(payload)];
  return new Response(JSON.stringify(body), {
    status: request.method === "DELETE" ? 200 : 201,
    headers: { "Content-Type": "application/json", "X-Offline-Queued": "1" }
  });
};

const flushQueue = async () => {
  await purgeConfirmedRequests();
  const entries = (await listQueuedRequests())
    .filter((entry) => entry.status !== "confirmed")
    .sort((left, right) => String(left.queuedAt).localeCompare(String(right.queuedAt)));
  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: ["GET", "HEAD"].includes(entry.method) ? undefined : entry.body
      });
      if (!response.ok) break;
      await markRequestConfirmed(entry);
      scheduleConfirmedCleanup();
    } catch (_) {
      break;
    }
  }
  await purgeConfirmedRequests();
};

const saveThenSend = async (request) => {
  const entry = { ...await serializeRequest(request), status: "pending" };
  await queueRequest(entry);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      await markRequestConfirmed(entry);
      scheduleConfirmedCleanup();
    } else {
      await removeQueuedRequest(entry.id);
    }
    return response;
  } catch (_) {
    if (self.registration.sync) {
      try { await self.registration.sync.register("los-anos-sync"); } catch (_) { /* El evento online reintenta. */ }
    }
    return queuedWriteResponse(request);
  }
};

const networkFirst = async (request) => {
  const cache = await caches.open(REMOTE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("los-anos-offline-") && ![OFFLINE_CACHE, REMOTE_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    await flushQueue();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === "GET") {
    if (url.origin === self.location.origin) {
      if (DYNAMIC_BRAND_ASSETS.has(url.pathname.split("/").pop())) {
        event.respondWith((async () => {
          const brandCache = await caches.open(BRAND_CACHE);
          const branded = await brandCache.match(request, { ignoreSearch: true });
          return branded || networkFirst(request);
        })());
        return;
      }
      event.respondWith(networkFirst(request).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(request, { ignoreSearch: true })) || (await cache.match("./index.html"));
      }));
      return;
    }
    if (isRemoteDataRequest(url)) event.respondWith(networkFirst(request));
    return;
  }
  if (isRemoteDataRequest(url) && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    event.respondWith(saveThenSend(request));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "los-anos-sync") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_OFFLINE_QUEUE") event.waitUntil(flushQueue());
});
