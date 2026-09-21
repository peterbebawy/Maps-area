/**
 * إعدادات التطبيق.
 * - الوضع الافتراضي مجاني ويستخدم Nominatim / OpenStreetMap.
 * - لنتائج Google نفسها، ضع مفتاح Google Geocoding API المقيّد بدومين GitHub Pages.
 * - روابط maps.app.goo.gl القصيرة تحتاج Worker اختياري؛ ضع رابطه في shortLinkResolverUrl.
 */
window.APP_CONFIG = Object.freeze({
  geocoder: "osm", // "osm" أو "google"
  googleMapsApiKey: "",
  shortLinkResolverUrl: "",
  language: "ar"
});
