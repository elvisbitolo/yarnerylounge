// One rule for "this member is visible", shared by every member listing.
//
// `User.suspended` is a nullable Boolean, and Prisma's `{ not: true }` and
// `{ NOT: { suspended: true } }` both compile to SQL that drops NULL rows:
// "suspended <> true" is NULL (not true) when the column is NULL, and
// "NOT (suspended = true)" is NULL for the same reason. A WHERE clause keeps
// only the rows that evaluate to TRUE, so every member whose flag was never
// set was filtered out. Almost every member has suspended = NULL, so those
// filters hid the whole member list — the followers/following dialog came
// back empty while the count beside it said otherwise.
//
// Match the two visible states explicitly instead. This stays correct whether
// the column is nullable (today) or made NOT NULL later.
export const NOT_SUSPENDED = { OR: [{ suspended: null }, { suspended: false }] };

// Combine the visibility rule with other conditions. Prisma ANDs a top-level
// `OR` with its sibling keys, so the extra conditions have to ride along
// inside the same AND rather than beside it.
export function withNotSuspended(conditions) {
  return { AND: [NOT_SUSPENDED, conditions] };
}

// The same rule applied to a relation, for example the `follower` or
// `following` side of a follow row.
export function notSuspendedRelation() {
  return { is: NOT_SUSPENDED };
}
