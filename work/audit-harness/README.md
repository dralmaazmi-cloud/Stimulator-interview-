# أدوات قبول التدقيق — مدرّب المقابلات القيادية

ضع هذا المجلد باسم `audit-harness/` بجوار مجلد المشروع (الذي يحتوي `api/` و`dist/`)، وعدّل `ROOT` في `server.mjs` إلى مسار المشروع إن لزم.

- `server.mjs` — خادم محلي يشغّل ملفات `api/` الحقيقية مع مزود وهمي قابل للتوجيه برموز داخل نص الإجابة:
  `BADQUOTES` اقتباسات مختلقة · `BADJSON` مخرجات غير صالحة · `BADSCHEMA` مخطط خاطئ · `NOQUOTES` بلا أي اقتباس · `NOFOLLOWUP` بلا متابعة · `SEQX` اقتباسات ثم مخطط ثم نجاح · `ADDFACT` (تقديم الذات) اختلاق معلومة.
  متغيرات البيئة: `MOCK_SHAPE=rest` (شكل الاستجابة الموثق من Google: steps[]) · `MOCK_UNCONFIGURED=1` · `MOCK_PROVIDER_429=1` · `MOCK_PROVIDER_400=1` · `MOCK_PROVIDER_503=1` (ازدحام دائم) · `MOCK_SLOW_MS=9000` (تأخير المزود) · `PORT`.
- `api-scenarios.mjs` — 32 سيناريو API؛ يفترض سبعة خوادم على المنافذ 4173–4179 للحالة العادية وشكل REST وغياب المفتاح وأخطاء 429/400/503 والاستجابة البطيئة.
- `ui-sweep.mjs` — فحص 16 مسارًا بمقاس iPhone 14 في المظهرين (null/undefined، تمرير أفقي، أهداف لمس <44px، قص، زر الرجوع) + لقطات شاشة.
- `journeys.mjs` — رحلات كاملة: نصي، صوتي (ميكروفون وهمي)، دون اتصال، بلا مفتاح، أخطاء المزود، الأوضاع الأربعة ومنها «مقابلة كاملة»، وتقديم الذات.

التشغيل (Node 22 + Playwright مع Chromium):
```
bash run-servers.sh
node api-scenarios.mjs
node ui-sweep.mjs
node journeys.mjs
```
