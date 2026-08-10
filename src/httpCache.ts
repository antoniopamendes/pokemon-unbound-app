const APP_HTTP_CACHE = "unbound-tracker-http-cache-v1";

export async function fetchWithPersistentCache(url: string): Promise<Response> {
  if (!("caches" in window)) {
    return fetch(url, { cache: "no-store" });
  }

  const cache = await caches.open(APP_HTTP_CACHE);
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    return cachedResponse.clone();
  }

  const response = await fetch(url, { cache: "no-store" });
  if (response.ok) {
    await cache.put(url, response.clone());
  }

  return response;
}

export async function fetchImageObjectUrlWithPersistentCache(
  url: string,
): Promise<string> {
  const response = await fetchWithPersistentCache(url);
  if (!response.ok) {
    throw new Error(`Unable to load image (${response.status}).`);
  }

  const imageBlob = await response.blob();
  return URL.createObjectURL(imageBlob);
}

export async function readJsonFromPersistentCache<T>(
  key: string,
): Promise<T | null> {
  if ("caches" in window) {
    const cache = await caches.open(APP_HTTP_CACHE);
    const cachedResponse = await cache.match(key);
    if (!cachedResponse) {
      return null;
    }

    return (await cachedResponse.json()) as T;
  }

  const raw = localStorage.getItem(`cache:${key}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Persistent JSON cache is invalid and will be reset.", error);
    return null;
  }
}

export async function writeJsonToPersistentCache<T>(
  key: string,
  value: T,
): Promise<void> {
  if ("caches" in window) {
    const cache = await caches.open(APP_HTTP_CACHE);
    await cache.put(
      key,
      new Response(JSON.stringify(value), {
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    return;
  }

  localStorage.setItem(`cache:${key}`, JSON.stringify(value));
}
