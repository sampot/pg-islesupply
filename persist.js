const BEST_URL = "/api/kv/islesupply:best";
const UNLOCKS_URL = "/api/kv/islesupply:unlocks";

export async function loadBest(fetcher = fetch) {
  try {
    const response = await fetcher(BEST_URL);
    if (!response.ok) return 0;
    const value = Number(await response.text());
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export async function loadUnlocks(fetcher = fetch) {
  try {
    const response = await fetcher(UNLOCKS_URL);
    if (!response.ok) return [];
    const value = JSON.parse(await response.text());
    return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : [];
  } catch {
    return [];
  }
}

export async function saveBest(score, currentBest, fetcher = fetch) {
  const nextBest = Math.max(score, currentBest);
  if (nextBest <= currentBest) return currentBest;
  try {
    await fetcher(BEST_URL, { method: "PUT", body: String(nextBest) });
  } catch {
    // Static previews stay fully playable without the Playgrounds KV API.
  }
  return nextBest;
}

export async function saveUnlocks(unlocks, fetcher = fetch) {
  const unique = [...new Set(unlocks.filter((item) => typeof item === "string"))];
  try {
    await fetcher(UNLOCKS_URL, { method: "PUT", body: JSON.stringify(unique) });
  } catch {
    // Static previews stay fully playable without the Playgrounds KV API.
  }
  return unique;
}
