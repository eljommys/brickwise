const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MIN_INTERVAL_MS = 1000;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function doFetch(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) throw Object.assign(new Error(`404: ${url}`), { permanent: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      const e = err as Error & { permanent?: boolean };
      if (e.permanent || attempt === 3) throw e;
      await sleep(1500 * attempt);
    }
  }
  throw new Error("unreachable");
}

/** Serialized, rate-limited fetch against propertyfinder.ae. */
export function fetchPfPage(url: string): Promise<string> {
  const task = queue.then(() => doFetch(url));
  queue = task.catch(() => {});
  return task;
}
