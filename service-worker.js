const OFFLINE_CACHE = "los-anos-offline-shell-v2";
const REMOTE_CACHE = "los-anos-offline-remote-v2";
const OFFLINE_DB = "los-anos-offline-sync-v1";
const OFFLINE_STORE = "entries";
const CONFIRMED_RETENTION_MS = 2_000;
const REMOTE_READ_TIMEOUT_MS = 1_200;
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

const READ_RPC_NAMES = new Set([
  "get_bootstrap_data", "get_admin_snapshot", "get_client_snapshot",
  "get_client_table_state", "get_initial_setup_status", "get_current_user",
  "list_users", "list_chat_messages"
]);
const UUID_REST_TABLES = new Set([
  "menu_categories", "menu_items", "restaurant_tables", "service_requests",
  "session_items", "table_sessions"
]);

const rpcNameFor = (url) => url.pathname.split("/").pop() || "";
const isReadRpcRequest = (request, url) =>
  request.method === "POST" && url.pathname.includes("/rpc/") && READ_RPC_NAMES.has(rpcNameFor(url));

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

const serializeRequest = async (request) => {
  let body = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
  const url = new URL(request.url);
  const table = url.pathname.split("/").pop();
  // El id se genera antes de responder a la pantalla: la fila local y la fila
  // que llegara a Supabase conservan exactamente la misma identidad.
  if (request.method === "POST" && url.pathname.includes("/rest/v1/") && UUID_REST_TABLES.has(table)) {
    try {
      const payload = JSON.parse(body || "{}");
      const withId = (row) => row && typeof row === "object" && !row.id ? { ...row, id: crypto.randomUUID() } : row;
      body = JSON.stringify(Array.isArray(payload) ? payload.map(withId) : withId(payload));
    } catch (_) { /* La solicitud original se conserva si no es JSON. */ }
  }
  return {
    id: crypto.randomUUID(),
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body,
    queuedAt: new Date().toISOString()
  };
};

const wantsObject = (request) => String(request.headers.get("accept") || "").includes("application/vnd.pgrst.object+json");

const queuedWriteResponse = (entry) => {
  const text = entry.body;
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }
  const timestamp = new Date().toISOString();
  const makeRow = (row) => ({
    ...(row && typeof row === "object" ? row : {}),
    id: row?.id || crypto.randomUUID(),
    created_at: row?.created_at || timestamp,
    updated_at: timestamp
  });
  const body = entry.method === "DELETE"
    ? []
    : new URL(entry.url).hostname === "script.google.com" || entry.url.includes("/rpc/")
      ? { ok: true, offline_queued: true }
    : Array.isArray(payload)
      ? payload.map(makeRow)
        : wantsObject({ headers: new Headers(entry.headers) })
          ? makeRow(payload)
          : [makeRow(payload)];
  return new Response(JSON.stringify(body), {
    status: entry.method === "DELETE" ? 200 : 201,
    headers: { "Content-Type": "application/json", "X-Offline-Queued": "1" }
  });
};

let flushingQueue = null;

const notifyQueueFlushed = async () => {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: "OFFLINE_QUEUE_FLUSHED" }));
};

const flushQueue = () => {
  if (flushingQueue) return flushingQueue;
  flushingQueue = (async () => {
    let flushed = false;
    await purgeConfirmedRequests();
    while (true) {
      const entry = (await listQueuedRequests())
        .filter((candidate) => candidate.status !== "confirmed")
        .sort((left, right) => String(left.queuedAt).localeCompare(String(right.queuedAt)))[0];
      if (!entry) break;
      try {
        const response = await fetch(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: ["GET", "HEAD"].includes(entry.method) ? undefined : entry.body
        });
        if (!response.ok) break;
        await markRequestConfirmed(entry);
        scheduleConfirmedCleanup();
        flushed = true;
      } catch (_) {
        break;
      }
    }
    await purgeConfirmedRequests();
    if (flushed) await notifyQueueFlushed();
  })().finally(() => { flushingQueue = null; });
  return flushingQueue;
};

const saveThenSend = async (request) => {
  const entry = { ...await serializeRequest(request), status: "pending" };
  await queueRequest(entry);
  if (self.registration.sync) {
    try { await self.registration.sync.register("los-anos-sync"); } catch (_) { /* El evento online reintenta. */ }
  }
  void flushQueue();
  return queuedWriteResponse(entry);
};

const networkFirst = async (request) => {
  const cache = await caches.open(REMOTE_CACHE);
  try {
    if (isRemoteDataRequest(new URL(request.url)) && !self.navigator.onLine) throw new Error("offline");
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
};

const readRpc = async (request) => {
  if (!self.navigator.onLine) return new Response('{"message":"offline"}', { status: 503, headers: { "Content-Type": "application/json" } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_READ_TIMEOUT_MS);
  try {
    return await fetch(new Request(request, { signal: controller.signal }));
  } catch (_) {
    return new Response('{"message":"offline"}', { status: 503, headers: { "Content-Type": "application/json" } });
  } finally {
    clearTimeout(timer);
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
  if (isRemoteDataRequest(url) && isReadRpcRequest(request, url)) {
    event.respondWith(readRpc(request));
    return;
  }
  if (isRemoteDataRequest(url) && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    const response = saveThenSend(request);
    event.respondWith(response);
    event.waitUntil(response.then(() => flushQueue()));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "los-anos-sync") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_OFFLINE_QUEUE") event.waitUntil(flushQueue());
});
