const { invalidateProductCache } = require("../services/cacheService");
const {
  EVENT_TOPICS,
  publish,
} = require("../services/applicationEvents");

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

function publishMutationEvents(req) {
  const reason = `${req.method} ${req.path}`;

  if (/^\/api\/products(?:\/|$)/.test(req.path)) {
    publish(EVENT_TOPICS.PRODUCTS_CHANGED, { reason });
    publish(EVENT_TOPICS.INVENTORY_CHANGED, { reason });
    return;
  }

  if (
    /^\/api\/(?:inventory|batches|stock-status)(?:\/|$)/.test(req.path)
  ) {
    publish(EVENT_TOPICS.INVENTORY_CHANGED, { reason });
    return;
  }

  if (/^\/api\/purchase-orders(?:\/|$)/.test(req.path)) {
    publish(EVENT_TOPICS.PURCHASE_ORDERS_CHANGED, { reason });
    if (/\/receive\/?$/.test(req.path)) {
      publish(EVENT_TOPICS.INVENTORY_CHANGED, { reason });
    }
  }
}

function productCacheInvalidation(req, res, next) {
  if (!affectsProductReads(req)) return next();

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      publishMutationEvents(req);
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
module.exports.publishMutationEvents = publishMutationEvents;
