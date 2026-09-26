// Minimal smoke tests mirroring the parser patterns used in assets/app.js.
function extractCoordinates(rawValue) {
  const raw = String(rawValue || "").trim();
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch (_) {}
  const dataMatches = [...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (dataMatches.length) return { lat: Number(dataMatches.at(-1)[1]), lng: Number(dataMatches.at(-1)[2]) };
  try {
    const url = new URL(raw);
    for (const key of ["destination", "query", "q", "center", "viewpoint", "origin"]) {
      const v = url.searchParams.get(key);
      const m = v && decodeURIComponent(v).match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
      if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }
  } catch (_) {}
  const atMatches = [...decoded.matchAll(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/g)];
  if (atMatches.length) return { lat: Number(atMatches.at(-1)[1]), lng: Number(atMatches.at(-1)[2]) };
  return null;
}

const cases = [
  ["https://www.google.com/maps/place/X/@30.123456,31.654321,17z", 30.123456, 31.654321],
  ["https://www.google.com/maps/search/?api=1&query=30.01234%2C31.45678", 30.01234, 31.45678],
  ["https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x0!3d30.111111!4d31.222222", 30.111111, 31.222222]
];

for (const [url, lat, lng] of cases) {
  const got = extractCoordinates(url);
  if (!got || Math.abs(got.lat - lat) > 1e-9 || Math.abs(got.lng - lng) > 1e-9) {
    throw new Error(`Failed: ${url} -> ${JSON.stringify(got)}`);
  }
}
console.log(`Parser smoke tests passed: ${cases.length}/${cases.length}`);
