const DEFAULT_PRODUCT_TTL_MS = 45_000;
const PRODUCT_CACHE_PREFIX = "products:";

class MemoryCacheAdapter {
  constructor() {
    this.entries = new Map();
    this.prefixVersions = new Map();
  }

  async get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key, value, ttlMs) {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  getPrefixVersion(prefix) {
    return this.prefixVersions.get(prefix) ?? 0;
  }

  async setIfPrefixVersion(key, value, ttlMs, prefix, expectedVersion) {
    if (this.getPrefixVersion(prefix) !== expectedVersion) return false;
    await this.set(key, value, ttlMs);
    return true;
  }

  async deleteByPrefix(prefix) {
    this.prefixVersions.set(prefix, this.getPrefixVersion(prefix) + 1);
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }
}

class CacheService {
  constructor(adapter) {
    this.adapter = adapter;
  }

  get(key) {
    return this.adapter.get(key);
  }

  set(key, value, ttlMs) {
    return this.adapter.set(key, value, ttlMs);
  }

  getPrefixVersion(prefix) {
    return this.adapter.getPrefixVersion(prefix);
  }

  setIfPrefixVersion(key, value, ttlMs, prefix, expectedVersion) {
    return this.adapter.setIfPrefixVersion(
      key,
      value,
      ttlMs,
      prefix,
      expectedVersion,
    );
  }

  deleteByPrefix(prefix) {
    return this.adapter.deleteByPrefix(prefix);
  }
}

function getProductCacheTtlMs() {
  const configured = Number(process.env.PRODUCT_CACHE_TTL_SECONDS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_PRODUCT_TTL_MS;
  }

  // Keep this read cache conservative even if the environment is misconfigured.
  return Math.min(Math.max(configured * 1000, 30_000), 60_000);
}

function buildProductCacheKey({ itemType, includeRawMaterials }) {
  return `${PRODUCT_CACHE_PREFIX}item_type=${itemType || "all"};include_raw=${
    includeRawMaterials ? "1" : "0"
  }`;
}

const cache = new CacheService(new MemoryCacheAdapter());

async function invalidateProductCache(reason = "product data changed") {
  await cache.deleteByPrefix(PRODUCT_CACHE_PREFIX);
  console.info(`[CACHE INVALIDATE] products reason=${reason}`);
}

module.exports = {
  buildProductCacheKey,
  cache,
  getProductCacheTtlMs,
  invalidateProductCache,
  PRODUCT_CACHE_PREFIX,
};
