export function serializeTimestamp(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

export function serialize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    // Blob
    if (typeof value.toBase64 === "function") {
      return { _type: "blob", base64: value.toBase64() };
    }
    // GeoPoint
    if (typeof value.latitude === "number" && typeof value.longitude === "number") {
      return { _type: "geopoint", latitude: value.latitude, longitude: value.longitude };
    }
    // DocumentReference
    if (typeof value.path === "string" && typeof value.id === "string") {
      return value.path;
    }
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = serialize(value[key]);
    }
    return out;
  }
  return value;
}