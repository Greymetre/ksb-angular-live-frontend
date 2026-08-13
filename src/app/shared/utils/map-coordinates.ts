export interface MapCoordinates {
  latitude: number;
  longitude: number;
  swapped: boolean;
}

const inGlobalRange = (latitude: number, longitude: number): boolean =>
  Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

// FieldKonnect's operational locations are in India. These bounds let us
// detect reversed values such as 73.85,18.52 even though both orientations
// are technically valid global coordinates.
const inIndiaRange = (latitude: number, longitude: number): boolean =>
  latitude >= 6 && latitude <= 38 && longitude >= 68 && longitude <= 98;

export function normalizeMapCoordinates(latitudeValue: unknown, longitudeValue: unknown): MapCoordinates | null {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const originalValid = inGlobalRange(latitude, longitude);
  const swappedValid = inGlobalRange(longitude, latitude);
  if (!originalValid && !swappedValid) return null;
  if (!originalValid && swappedValid) return { latitude: longitude, longitude: latitude, swapped: true };

  const originalInIndia = inIndiaRange(latitude, longitude);
  const swappedInIndia = swappedValid && inIndiaRange(longitude, latitude);
  if (!originalInIndia && swappedInIndia) return { latitude: longitude, longitude: latitude, swapped: true };

  return { latitude, longitude, swapped: false };
}
