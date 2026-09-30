// A Blob write can fail for reasons the upload route does not control: a
// revoked or rotated token, a store that no longer exists, or a project
// transfer that dropped the store link. That happened in production on
// 2026-09-30 -- BLOB_STORE_ID pointed at a deleted store, every kind failed,
// and because put() was unhandled the client only ever saw a bare
// "Failed to upload". These helpers keep that failure legible and tell a
// misconfiguration apart from a transient outage.
const CONFIG_ERROR = /access denied|valid token|store not found|unauthorized|forbidden/i;

export function isBlobConfigError(err) {
  return CONFIG_ERROR.test(String(err?.message || err || ""));
}

export function blobUploadFailureMessage(err) {
  return isBlobConfigError(err)
    ? "File storage is not configured. Please contact support."
    : "File storage is unavailable right now. Please try again.";
}
