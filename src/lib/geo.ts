// Great-circle distance in metres. Same formula and Earth radius as the server's
// private.distance_m(), so the phone's geofence check agrees with the server's flag.
export const distanceM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

export interface Fix {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

// For organisations in "block" mode: is this fix clearly outside the site?
// Only blocks when the GPS fix is reasonably precise (<= 100 m); otherwise the
// clock-in is allowed and the server flags it.
export const outsideSite = (fix: Fix, site: { latitude: number; longitude: number; radius_m: number }) =>
  fix.accuracyM <= 100 && distanceM(fix.latitude, fix.longitude, site.latitude, site.longitude) > site.radius_m;
