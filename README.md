# Maps Area Finder — GitHub Pages

موقع Static جاهز لتحديد:

1. المنطقة الرئيسية: **العبور / مصر الجديدة-هليوبوليس / العباسية / التجمع الخامس**.
2. الحي/المجاورة/المنطقة الأدق التي تُرجعها خدمة Reverse Geocoding.
3. العنوان الأقرب والإحداثيات.

## تشغيله على GitHub Pages

1. ارفع محتويات المجلد إلى Repository على GitHub.
2. من `Settings > Pages` اختر `Deploy from a branch`.
3. اختر فرع `main` والمجلد `/ (root)` ثم Save.
4. لا يوجد build step ولا npm مطلوب.

ملف `.nojekyll` موجود بالفعل.

## طريقة تحديد المنطقة

- التطبيق يستخرج الإحداثيات من رابط Google Maps الكامل (`@lat,lng` أو `!3d...!4d...` أو `query=` وغيرها).
- افتراضيًا يستخدم Nominatim/OpenStreetMap للـ Reverse Geocoding.
- يطابق اسم المنطقة أولًا من بيانات العنوان، ثم يستخدم Geofence كخيار احتياطي.
- يعرض أكثر مستوى محلي مفيد مثل `neighbourhood / quarter / suburb / city_district`، لذلك قد تظهر نتيجة مثل `الحي التاسع — المجاورة الأولى` عندما تكون هذه البيانات متاحة.

## روابط maps.app.goo.gl القصيرة

GitHub Pages Static فقط، والمتصفح غالبًا لا يستطيع قراءة وجهة رابط `maps.app.goo.gl` بسبب CORS. لذلك يوجد Worker اختياري داخل مجلد `worker/`.

بعد نشر الـ Worker على Cloudflare Workers، ضع رابطه في:

```js
window.APP_CONFIG = {
  geocoder: "osm",
  googleMapsApiKey: "",
  shortLinkResolverUrl: "https://YOUR-WORKER.workers.dev",
  language: "ar"
};
```

بدون Worker، الروابط الكاملة والإحداثيات تعمل بشكل طبيعي.

## استخدام Google Geocoding بدل OpenStreetMap (اختياري)

إذا أردت أن تكون أسماء العناوين من Google نفسها:

1. فعّل Google Geocoding API في Google Cloud.
2. أنشئ API key وقيده بـ HTTP referrer لدومين GitHub Pages الخاص بك.
3. غيّر `config.js` إلى:

```js
window.APP_CONFIG = {
  geocoder: "google",
  googleMapsApiKey: "YOUR_RESTRICTED_KEY",
  shortLinkResolverUrl: "",
  language: "ar"
};
```

> ملاحظة: مفتاح الواجهة الأمامية ظاهر للمتصفح؛ لذلك يجب تقييده بالدومين والـ API المسموح بها.

## ملاحظات الدقة

- النطاقات الجغرافية الأربعة داخل `assets/app.js` هي Fallback فقط، وليست بديلًا عن بيانات العنوان.
- دقة اسم الحي تعتمد على تغطية مزود الـ Reverse Geocoding للنقطة نفسها.
- الاستعلامات إلى Nominatim يتم تهدئتها إلى أقل من طلب واحد في الثانية وتُخزّن محليًا لمدة 30 يومًا لتقليل الحمل.

## الملفات

- `index.html`: الواجهة.
- `assets/style.css`: التصميم responsive RTL.
- `assets/app.js`: parsing + reverse geocoding + classification.
- `config.js`: إعداد المزود والـ Worker.
- `worker/`: دعم اختياري للروابط المختصرة.
