const { invalidateProductCache } = require("../services/cacheService");

const PRODUCT_MUTATION_PATHS = [
  /^\/api\/products(?:\/|$)/,
  /^\/api\/inventory(?:\/|$)/,
  /^\/api\/batches(?:\/|$)/,
  /^\/api\/stock-status(?:\/|$)/,
  /^\/api\/purchase-orders(?:\/|$)/,
  /^\/api\/orders(?:\/|$)/,
];

function affectsProductReads(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  return PRODUCT_MUTATION_PATHS.some((pattern) => pattern.test(req.path));
}

function productCacheInvalidation(req, res, next) {
  if (!affectsProductReads(req)) return next();

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void invalidateProductCache(`${req.method} ${req.path}`).catch((error) => {
        console.error(
          "Product cache invalidation failed:",
          error && error.message ? error.message : error,
        );
      });
    }
  });

  return next();
}

module.exports = productCacheInvalidation;
