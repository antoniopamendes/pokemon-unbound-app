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

function loadImageFromObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to decode image (${objectUrl}).`));
    image.src = objectUrl;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Fetches an indexed Unbound sprite and removes its opaque palette background.
 * The source files are game assets whose transparent palette entry is emitted
 * as a normal PNG color, so this is intentionally only used for fallback
 * sprites—not for PokeAPI artwork that already carries alpha transparency.
 */
export async function fetchTransparentFallbackImageObjectUrl(
  url: string,
): Promise<string> {
  const response = await fetchWithPersistentCache(url);
  if (!response.ok) {
    throw new Error(`Unable to load image (${response.status}).`);
  }

  const imageBlob = await response.blob();
  const sourceObjectUrl = URL.createObjectURL(imageBlob);

  try {
    const image = await loadImageFromObjectUrl(sourceObjectUrl);
    if (!image.naturalWidth || !image.naturalHeight) return sourceObjectUrl;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return sourceObjectUrl;

    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const backgroundRed = data[0];
    const backgroundGreen = data[1];
    const backgroundBlue = data[2];
    const backgroundAlpha = data[3];

    // If the source already has transparency, preserve it as-is instead of
    // applying a color key that could remove a legitimate foreground pixel.
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 255) return sourceObjectUrl;
    }

    for (let index = 0; index < data.length; index += 4) {
      if (
        data[index] === backgroundRed
        && data[index + 1] === backgroundGreen
        && data[index + 2] === backgroundBlue
        && data[index + 3] === backgroundAlpha
      ) {
        data[index + 3] = 0;
      }
    }

    context.putImageData(imageData, 0, 0);
    const processedBlob = await canvasToPngBlob(canvas);
    if (!processedBlob) return sourceObjectUrl;

    const processedObjectUrl = URL.createObjectURL(processedBlob);
    URL.revokeObjectURL(sourceObjectUrl);
    return processedObjectUrl;
  } catch {
    // Keep the sprite visible if a browser cannot decode or re-encode it.
    return sourceObjectUrl;
  }
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
