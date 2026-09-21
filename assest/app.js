(() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const els = {
    input: $("mapsLink"),
    button: $("lookupBtn"),
    status: $("status"),
    resultCard: $("resultCard"),
    errorCard: $("errorCard"),
    errorMessage: $("errorMessage"),
    mainArea: $("mainArea"),
    exactArea: $("exactArea"),
    formattedAddress: $("formattedAddress"),
    coords: $("coords"),
    provider: $("provider"),
    confidence: $("confidenceBadge"),
    openMaps: $("openMaps"),
    copyBtn: $("copyBtn")
  };

  // Bounds are intentionally conservative fallbacks. Alias matching from the
  // reverse-geocoded address is preferred whenever available.
  const AREA_RULES = [
    {
      id: "obour",
      label: "العبور",
      aliases: ["العبور", "مدينة العبور", "obour", "el obour", "al obour", "al-obour", "el-obour"],
      bounds: { minLat: 30.145, maxLat: 30.285, minLng: 31.405, maxLng: 31.565 }
    },
    {
      id: "heliopolis",
      label: "مصر الجديدة / هليوبوليس",
      aliases: ["مصر الجديدة", "هليوبوليس", "هليوبولس", "heliopolis", "masr el gedida", "masr el gededa"],
      bounds: { minLat: 30.067, maxLat: 30.135, minLng: 31.288, maxLng: 31.375 }
    },
    {
      id: "abbassia",
      label: "العباسية",
      aliases: ["العباسية", "عباسية", "abbassia", "abbasseya", "abbaseya", "abbasiya"],
      bounds: { minLat: 30.052, maxLat: 30.090, minLng: 31.252, maxLng: 31.302 }
    },
    {
      id: "fifth-settlement",
      label: "التجمع الخامس",
      aliases: ["التجمع الخامس", "التجمع 5", "fifth settlement", "5th settlement", "tagamoa el khames", "tagamo3 el 5ames"],
      bounds: { minLat: 29.935, maxLat: 30.070, minLng: 31.385, maxLng: 31.535 }
    }
  ];

  const GENERIC_NAMES = new Set([
    "القاهرة", "cairo", "محافظة القاهرة", "cairo governorate",
    "القليوبية", "محافظة القليوبية", "qalyubia", "qalyubia governorate",
    "مصر", "egypt"
  ]);

  let lastResult = null;
  let lastNominatimCall = 0;

  function normalizeText(value = "") {
    return String(value)
      .normalize("NFKD")
      .replace(/[ًٌٍَُِّْـ]/g, "")
      .replace(/[إأآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .toLowerCase()
      .replace(/[\u200e\u200f]/g, "")
      .replace(/[-_/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isWithinBounds(lat, lng, bounds) {
    return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
  }

  function isValidCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  function parseCoordinatePair(text) {
    if (!text) return null;
    const decoded = decodeURIComponent(String(text)).replace(/\+/g, " ");
    const match = decoded.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return isValidCoordinate(lat, lng) ? { lat, lng } : null;
  }

  function extractCoordinates(rawValue) {
    const raw = String(rawValue || "").trim();
    const direct = parseCoordinatePair(raw);
    if (direct && !/^https?:/i.test(raw)) return direct;

    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch (_) {}

    // Google place payload often contains the exact place coordinate as !3dLAT!4dLNG.
    const dataMatches = [...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
    if (dataMatches.length) {
      const m = dataMatches[dataMatches.length - 1];
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValidCoordinate(lat, lng)) return { lat, lng };
    }

    try {
      const url = new URL(raw);
      // Prefer explicit target-like parameters over viewport center.
      for (const key of ["destination", "query", "q", "center", "viewpoint", "origin"]) {
        const pair = parseCoordinatePair(url.searchParams.get(key));
        if (pair) return pair;
      }
    } catch (_) {}

    // Common browser URL: /maps/place/.../@30.0123,31.4567,17z
    const atMatches = [...decoded.matchAll(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/g)];
    if (atMatches.length) {
      const m = atMatches[atMatches.length - 1];
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValidCoordinate(lat, lng)) return { lat, lng };
    }

    return null;
  }

  function isShortGoogleMapsUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host === "maps.app.goo.gl" || host === "goo.gl";
    } catch (_) {
      return false;
    }
  }

  async function expandShortUrl(shortUrl) {
    // Some environments may allow this directly; most browsers block it via CORS.
    try {
      const response = await fetch(shortUrl, { method: "GET", redirect: "follow", cache: "no-store" });
      if (response.url && response.url !== shortUrl) return response.url;
    } catch (_) {
      // Continue to the optional resolver.
    }

    if (!config.shortLinkResolverUrl) {
      throw new Error(
        "الرابط مختصر (maps.app.goo.gl). على GitHub Pages يحتاج مُحلّل روابط صغير بسبب قيود CORS. فعّل الـ Worker المرفق في مجلد worker ثم ضع رابطه في config.js، أو الصق رابط Google Maps الكامل من شريط العنوان."
      );
    }

    const endpoint = new URL(config.shortLinkResolverUrl);
    endpoint.searchParams.set("url", shortUrl);
    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر فك الرابط المختصر. راجع إعداد shortLinkResolverUrl.");
    const payload = await response.json();
    if (!payload.url) throw new Error("مُحلّل الرابط لم يُرجع رابطًا صالحًا.");
    return payload.url;
  }

  function cacheKey(lat, lng, provider) {
    return `maps-area:${provider}:${lat.toFixed(5)},${lng.toFixed(5)}`;
  }

  function getCached(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (Date.now() - item.savedAt > 1000 * 60 * 60 * 24 * 30) {
        localStorage.removeItem(key);
        return null;
      }
      return item.data;
    } catch (_) { return null; }
  }

  function setCached(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  }

  async function reverseGeocodeOSM(lat, lng) {
    const key = cacheKey(lat, lng, "osm");
    const cached = getCached(key);
    if (cached) return cached;

    const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimCall));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", config.language || "ar");

    lastNominatimCall = Date.now();
    const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("خدمة تحديد العنوان لم تستجب الآن. حاول مرة أخرى.");
    const json = await response.json();

    const data = {
      provider: "OpenStreetMap / Nominatim",
      formattedAddress: json.display_name || "غير متوفر",
      address: json.address || {},
      raw: json
    };
    setCached(key, data);
    return data;
  }

  async function reverseGeocodeGoogle(lat, lng) {
    const apiKey = String(config.googleMapsApiKey || "").trim();
    if (!apiKey) throw new Error("تم اختيار Google Geocoding لكن googleMapsApiKey فارغ في config.js.");

    const key = cacheKey(lat, lng, "google");
    const cached = getCached(key);
    if (cached) return cached;

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("language", config.language || "ar");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error("Google Geocoding لم يستجب الآن.");
    const json = await response.json();
    if (json.status !== "OK" || !json.results?.length) {
      throw new Error(`Google Geocoding: ${json.status || "NO_RESULT"}`);
    }

    const best = json.results[0];
    const address = {};
    for (const component of best.address_components || []) {
      for (const type of component.types || []) {
        if (!(type in address)) address[type] = component.long_name;
      }
    }

    const data = {
      provider: "Google Geocoding API",
      formattedAddress: best.formatted_address || "غير متوفر",
      address,
      raw: json
    };
    setCached(key, data);
    return data;
  }

  function reverseGeocode(lat, lng) {
    return config.geocoder === "google"
      ? reverseGeocodeGoogle(lat, lng)
      : reverseGeocodeOSM(lat, lng);
  }

  function addressValues(geocode) {
    return Object.values(geocode.address || {}).filter((v) => typeof v === "string" && v.trim());
  }

  function classifyMainArea(lat, lng, geocode) {
    const haystack = normalizeText([geocode.formattedAddress, ...addressValues(geocode)].join(" | "));

    for (const area of AREA_RULES) {
      const aliasMatch = area.aliases.some((alias) => haystack.includes(normalizeText(alias)));
      if (aliasMatch) return { area, confidence: "high", reason: "address" };
    }

    const candidates = AREA_RULES.filter((area) => isWithinBounds(lat, lng, area.bounds));
    if (candidates.length === 1) return { area: candidates[0], confidence: "medium", reason: "geofence" };

    return null;
  }

  function isSameAsMainArea(name, area) {
    const n = normalizeText(name);
    if (!n) return true;
    return area.aliases.some((alias) => n === normalizeText(alias) || n.includes(normalizeText(alias)));
  }

  function getExactArea(geocode, mainArea) {
    const address = geocode.address || {};

    // Priority lists differ slightly between Nominatim and Google.
    const orderedKeys = [
      "neighbourhood", "quarter", "suburb", "residential", "city_district",
      "sublocality_level_3", "sublocality_level_2", "sublocality_level_1", "sublocality",
      "town", "village", "hamlet"
    ];

    const candidates = [];
    for (const key of orderedKeys) {
      const value = address[key];
      if (typeof value === "string") candidates.push(value.trim());
    }

    // Catch useful Arabic administrative labels that may be stored under provider-specific keys.
    for (const value of addressValues(geocode)) {
      if (/\b(حي|مجاوره|مجاورة|محليه|محلية|منطقه|منطقة)\b/u.test(value)) candidates.push(value.trim());
    }

    const unique = [];
    const seen = new Set();
    for (const value of candidates) {
      const normalized = normalizeText(value);
      if (!normalized || GENERIC_NAMES.has(normalized) || isSameAsMainArea(value, mainArea)) continue;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(value);
      }
    }

    if (unique.length >= 2) return `${unique[0]} — ${unique[1]}`;
    if (unique.length === 1) return unique[0];

    // Last-resort useful locality label, but avoid presenting a road as a neighborhood.
    const fallbackKeys = ["municipality", "county", "administrative_area_level_3", "administrative_area_level_2"];
    for (const key of fallbackKeys) {
      const value = address[key];
      if (typeof value === "string" && !isSameAsMainArea(value, mainArea)) return value;
    }

    return "لم تُرجع خدمة الخرائط اسم حي فرعي موثوق لهذه النقطة";
  }

  function setBusy(isBusy, message = "") {
    els.button.disabled = isBusy;
    els.button.textContent = isBusy ? "جارٍ التحديد…" : "تحديد المنطقة";
    els.status.textContent = message;
  }

  function showError(message) {
    els.resultCard.classList.add("hidden");
    els.errorCard.classList.remove("hidden");
    els.errorMessage.textContent = message;
  }

  function hideMessages() {
    els.resultCard.classList.add("hidden");
    els.errorCard.classList.add("hidden");
    els.status.textContent = "";
  }

  function renderResult(result) {
    lastResult = result;
    els.errorCard.classList.add("hidden");
    els.resultCard.classList.remove("hidden");
    els.mainArea.textContent = result.mainArea;
    els.exactArea.textContent = result.exactArea;
    els.formattedAddress.textContent = result.formattedAddress;
    els.coords.textContent = `${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`;
    els.provider.textContent = result.provider;
    els.confidence.textContent = result.confidence === "high" ? "ثقة عالية" : "ثقة متوسطة";
    els.confidence.className = `badge ${result.confidence}`;
    els.openMaps.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${result.lat},${result.lng}`)}`;
  }

  async function runLookup() {
    hideMessages();
    const original = els.input.value.trim();
    if (!original) return showError("الصق رابط Google Maps أولًا.");

    try {
      setBusy(true, "أقرأ الرابط وأستخرج الإحداثيات…");
      let workingUrl = original;

      if (isShortGoogleMapsUrl(workingUrl)) {
        setBusy(true, "أفك الرابط المختصر…");
        workingUrl = await expandShortUrl(workingUrl);
      }

      const coords = extractCoordinates(workingUrl);
      if (!coords) {
        throw new Error("لم أجد إحداثيات داخل الرابط. استخدم رابط Google Maps الكامل الذي يحتوي على موقع محدد، أو الصق الإحداثيات مباشرة بالشكل 30.0000,31.0000.");
      }

      setBusy(true, "أحدد اسم الحي والمنطقة الدقيقة…");
      const geocode = await reverseGeocode(coords.lat, coords.lng);
      const classification = classifyMainArea(coords.lat, coords.lng, geocode);

      if (!classification) {
        throw new Error("الموقع لا يبدو داخل إحدى المناطق الأربع المسموح بها: العبور، مصر الجديدة/هليوبوليس، العباسية، التجمع الخامس.");
      }

      const exactArea = getExactArea(geocode, classification.area);
      renderResult({
        lat: coords.lat,
        lng: coords.lng,
        mainArea: classification.area.label,
        exactArea,
        formattedAddress: geocode.formattedAddress,
        provider: geocode.provider,
        confidence: classification.confidence
      });
      setBusy(false, "تم تحديد المنطقة.");
    } catch (error) {
      showError(error?.message || "حدث خطأ غير متوقع.");
      setBusy(false, "");
    }
  }

  els.button.addEventListener("click", runLookup);
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runLookup();
  });

  els.copyBtn.addEventListener("click", async () => {
    if (!lastResult) return;
    const text = [
      `المنطقة الرئيسية: ${lastResult.mainArea}`,
      `المنطقة الدقيقة: ${lastResult.exactArea}`,
      `العنوان الأقرب: ${lastResult.formattedAddress}`,
      `الإحداثيات: ${lastResult.lat.toFixed(6)}, ${lastResult.lng.toFixed(6)}`
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      els.copyBtn.textContent = "تم النسخ";
      setTimeout(() => { els.copyBtn.textContent = "نسخ النتيجة"; }, 1400);
    } catch (_) {
      els.copyBtn.textContent = "تعذر النسخ";
    }
  });
})();
