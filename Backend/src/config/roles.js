/**
 * Role configuration for the application.
 * Mapping numeric role_id from the database to readable role_name.
 */
const ROLES = {
  ADMIN: { id: 1, name: "admin" },
  MANAGER: { id: 2, name: "manager" },
  MEMBER: { id: 3, name: "member" },
};

/**
 * Helper to get role name from role_id.
 * @param {number|string} id 
 * @returns {string}
 */
const getRoleName = (id) => {
  const n = Number(id);
  if (n === ROLES.ADMIN.id) return ROLES.ADMIN.name;
  if (n === ROLES.MANAGER.id) return ROLES.MANAGER.name;
  return ROLES.MEMBER.name; // Default to member
};

module.exports = {
  ROLES,
  getRoleName,
};
