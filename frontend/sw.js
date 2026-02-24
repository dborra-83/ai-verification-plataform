// Service Worker for AI Verification Platform
// Provides basic offline functionality

const CACHE_NAME = "ai-verification-v10"; // Bumped to force full cache clear
const urlsToCache = [
  "/",
  "/index.html",
  "/login.html",
  "/signup.html",
  "/verify.html",
  "/forgot-password.html",
  "/detail.html",
  "/css/styles.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.min.js",
];

// Install event - cache resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Opened cache");
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log("Cache install failed:", error);
      }),
  );
});

// Fetch event - serve from cache when offline
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip caching for API calls and all JS/CSS assets - always fetch from network
  if (
    url.hostname.includes("execute-api") ||
    url.hostname.includes("amazonaws.com") ||
    url.pathname.includes("/prod/") ||
    url.pathname.includes("/api/") ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.search.length > 0
  ) {
    // Don't intercept - let them pass through to network
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      if (response) {
        return response;
      }

      // Clone the request because it's a stream
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest)
        .then((response) => {
          // Check if we received a valid response
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          // Clone the response because it's a stream
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Return offline page for navigation requests
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
    }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});
