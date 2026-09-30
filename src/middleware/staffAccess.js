const { requireRoleAccess } = require("./cookViewAccess");

const requireAdministratorAccess = requireRoleAccess(
  ["administrator"],
  "Administrator access required",
);

const requireInventoryManagerAccess = requireRoleAccess(
  ["inventory_manager"],
  "Inventory Manager access required",
);

const requireKitchenInventoryAccess = requireRoleAccess(
  ["inventory_manager", "cook"],
  "Kitchen inventory access required",
);

module.exports = {
  requireAdministratorAccess,
  requireInventoryManagerAccess,
  requireKitchenInventoryAccess,
};
