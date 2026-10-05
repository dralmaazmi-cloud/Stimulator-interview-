# سجل التغييرات — v0.5.1

## alpha-4 (5 أكتوبر 2026) — إصلاح التشغيل الحي والصمود (الأمر التنفيذي 3.2، المرحلة 1)

| البند | الملفات | التغيير | الاختبار المُثبِت | الحالة |
|---|---|---|---|---|
| A1 Wake Lock | `dist/js/wake-lock.js` (جديد)، `dist/sw.js` (APP_SHELL)، `vercel.json` (`screen-wake-lock=(self)`)، `dist/js/simulation.js`، `dist/js/self-intro.js` | مجموعة أسباب (`recording`, `transcribing`, `evaluating`, `self-intro-timer`)، طلب عند أول سبب وتحرير عند آخره، إعادة طلب عند العودة، تحرير في كل مسارات النجاح/الفشل/الإلغاء/`pagehide`، لا listener مكرر | `tests/wake-lock.test.mjs` (mock كامل: الطلب، التحرير، السقوط، إعادة الطلب، الأسباب الأربعة، 5 جولات دخول/خروج)؛ `journeys` A1: الطلب أثناء التسجيل والتحرير بعده | مُثبَت (iPhone الحقيقي: غير مختبر — نقطة التوقف A) |
| A2 الخروج أثناء التسجيل | `dist/js/simulation.js` (`finishRecording` مسار إيقاف واحد، `onVisibilityChange`, `showPendingCard`)، `dist/js/recorder.js` (`isRecording`, ساعة monotonic) | إيقاف نظيف مرة واحدة دون إرسال تلقائي، بطاقة «توقّف التسجيل… سُجّل منه N ثانية» بزرين؛ أقل من ثانية → إعادة التسجيل فقط | `journeys` A2 (البطاقة، الزران، إرسال التسجيل نفسه، التسجيل دون ثانية) | مُثبَت |
| A3 التسجيل المعلق في IndexedDB | `dist/js/storage.js` (`pending_recordings`, DB v2, `savePendingRecording`/`getPendingRecording`/`removePendingRecording`/`purgeExpiredRecordings`, fallback للذاكرة)، `dist/js/app.js` (تنظيف عند التشغيل)، `dist/js/simulation.js` | سجل واحد لكل جلسة/سؤال بلا تفريغ؛ حذف عند النجاح/إعادة التسجيل/الحذف/24 ساعة؛ خارج التصدير؛ لا Blob في localStorage؛ تنبيه مرة واحدة عند fallback | `journeys` A3 (حفظ، استعادة بعد reload، حذف بعد النجاح، تنظيف 24 ساعة) | مُثبَت (fallback الذاكرة: مُثبَت بمسار الكود، غير مُشغَّل في المتصفح) |
| A4 المسودة | `dist/js/simulation.js` (`draft_question_id`, debounce، flush عند hidden/pagehide، نقل آمن عند الانتقال) | المسودة مرتبطة بمعرّف السؤال؛ تُحذف عند تقييم موثوق أو بعد النقل؛ تبقى عند `AI_OVERLOADED` | `journeys` A4 (اكتب، أخفِ، reload، يعود النص؛ غير موثوق → التالي فارغ والإجابة الأولى محفوظة) | مُثبَت |
| A5 غياب الدعم | `dist/js/wake-lock.js` (`unsupportedNoticeOnce`) | تنبيه مرة واحدة في شاشة التسجيل فقط | `tests/wake-lock.test.mjs` | مُثبَت |
| B1 فصل النماذج | `api/_lib/provider.js` (`fallbackModelId`)، `HANDOFF.md` | `GEMINI_EVALUATION_FALLBACK_MODEL` و`GEMINI_TRANSCRIBE_FALLBACK_MODEL`؛ يُتجاهل الفارغ أو المساوي للأساسي؛ لا تبادل بين الدورين | `tests/resilience.test.mjs` (12) | مُثبَت |
| B2 إعادة المحاولة | `api/_lib/provider.js` (`callWithRetry`, `singleCall`, `jitteredDelay`, `configureProviderDeps`) | 5xx/اتصال فقط؛ 3 محاولات أساسية بتأخير 1.5s/4s ±25%؛ احتياطي واحد؛ تسلسلي | `tests/resilience.test.mjs` (1–7، 10) | مُثبَت |
| B3 الميزانية والسقف | `api/_lib/provider.js` (`createBudget`)، `api/evaluate.js`، `api/transcribe.js`، `api/self-intro.js` | deadline 50s من بداية المعالج، مهلة النداء min(28s، المتبقي−1s)، لا نداء تحت 5s، سقف 4/5 نداءات | `tests/resilience.test.mjs` (8، 9، سقف النداءين) | مُثبَت |
| B4 الأخطاء والسجلات | `api/_lib/provider.js`، `api/_lib/http.js` (`AI_OVERLOADED`, `retry_after`)، `api/_lib/usage.js` | 503 `AI_OVERLOADED` برسالة ثابتة؛ 429 يبقى `AI_RATE_LIMITED` مع `retry_after`؛ سجل منظم بلا نصوص | `tests/resilience.test.mjs` (2، 5، 13) | مُثبَت |
| B5 العميل | `dist/js/evaluate-client.js` (70s، `onSlow` 8s، `retryAfter`)، `dist/js/simulation.js` (`createEvaluationRunner`, `applyRetryLock`, `retryLockPlan`) | «ما زلنا نحاول الاتصال…»، إعادة الإرسال مقفلة 15s مع عدّ استرشادي 60s، 429 مقفلة `retry_after`/60s، لا طلبين، تحرير القفل في finally | `journeys` B5 (الازدحام على 4178، البطء على 4179، الضغط المزدوج) | مُثبَت |
| C1 مصدر المدة | `dist/js/recorder.js` (`performance.now`)، `api/transcribe.js` | المدة من ساعة monotonic؛ الترويسة مساعدة ضمن حدود المنتج | `journeys` J2؛ `api-scenarios` 17 | مُثبَت |
| C2 الحجم مقابل المدة | `api/transcribe.js` (`plausibleSizeForDuration`, `BYTES_PER_SECOND_RANGE`) | نطاق واسع لكل MIME؛ رفض المتطرف فقط بـ400 | `api-scenarios` 17 (التسجيلات الصالحة تمر) | مُثبَت |
| C3 توكنات الصوت | `HANDOFF.md` | غير مطبّق لغياب معدل موثق موثوق | — | موثّق «غير مطبق» |
| D1 الرموز الداخلية | `tools/build-exercise-overrides.js`، `tests/phase1.test.mjs` | حذف `C1-SB1` من التفسيرات؛ اختبار يمنع `C\d+-(SB|NB)\d+` و`-EP\d+` في التمارين وملفات العميل (معرّفات الأسئلة `C1-B1` تُعرض عمدًا) | `npm test` | مُثبَت |
| D2 الشروحات | `tools/build-exercise-overrides.js`، `tools/exercise-overrides.json` | الفحص البنيوي كشف 59 تفسيرًا بلا سبب أو بلا اقتباس (L2-STAR 20، L3-ERROR 10، L5-MODE 16، L7-PREP 5، L8-GENERAL 8)؛ أُصلحت كلها بسبب + اقتباس حرفي «…» من المرجع | `tests/phase1.test.mjs` (اختبار بنيوي: سبب + اقتباس ≥ كلمتين موجود في المرجع) | مُثبَت |
| D3 عدد التمارين | `tools/apply-exercise-overrides.js`، `dist/data/derived/manifest.json` (`counts.exercises` 138 → 130) | الـmanifest يُكتب بعد التجاوزات | `tests/phase1.test.mjs` (manifest = الملف النهائي = 130) | مُثبَت |
| D4 التوثيق | `HANDOFF.md` (جدول المتغيرات) | كل المتغيرات مع الغرض؛ `RATE_LIMIT_*` متغيرات اختبار | — | مُثبَت |

ثوابت: بصمة المرجع `51d413de…a357` دون تغيير؛ `dist/data/derived/*` مطابق بايت-ببايت عدا `manifest.json` (`counts.exercises` فقط، بقرار D3). الإصدار `0.5.1-alpha-4` في `package.json` و`dist/js/config.js`، والمستخدم يرى «الإصدار 0.5.1 — نسخة اختبار»؛ كاش `sw.js` أصبح `v0.5.1-alpha-4`.

انحرافات عن نص الأمر (1.4): أسماء الدوال الفعلية استُخدمت (`createVoicePanel`, `drawQuestion`)؛ نمط D1 ضُيّق إلى معرّفات السلوكيات والنقاط لأن النمط الحرفي `C\d+-?[SB]\w*\d+` يطابق معرّفات الأسئلة المعروضة عمدًا؛ تغيير `manifest.json` مطلوب صراحةً في D3.

---


## alpha-3 (4 أكتوبر 2026) — خمسة بنود فوق alpha-2

| البند | الملفات | التغيير | الاختبار المُثبِت | الحالة |
|---|---|---|---|---|
| 1 بوابة الثقة | `api/_lib/validation.js` (`verifyEvidence` → `scoredCriteria`, `unverifiedCriteria`)، `api/evaluate.js` (`trusted = failureRate ≤ 0.3 && unverified ≤ floor(scored/2)`؛ `scored = 0` → درجة 0 «ضعيفة»؛ `verification.scored_criteria/unverified_criteria`)، `dist/js/report.js` (العنوان «تقييم غير موثوق» ورسالة عدم الثقة عند `trusted === false` فقط) | حُذف شرطا `checked > 0` و`verifiedCriteria ≥ ceil(n/2)` | `phase2.test.mjs`: الحالات أ/ب/ج عبر `verifyEvidence` وعبر المعالج + الحالة القائمة 5/6 → 74؛ `api-scenarios`: «trust gate (أ)» score=8 ضعيفة، «zero quotes» (ب) بلا درجة، «trust gate (ج)» score=0 ضعيفة | مُثبَت |
| 2 حدّان للمعدل | `api/_lib/http.js` (`rateLimitScopes`)، `api/evaluate.js`، `api/transcribe.js`، `api/self-intro.js`، `api/_lib/rate-limit.js` (توثيق) | IP 200/ساعة مشترك (`RATE_LIMIT_IP`) + (IP + `X-Client-Id`) 40/30/20 (`RATE_LIMIT_EVALUATE` يرفع حد التقييم فقط) | `phase2.test.mjs`: الطلب 41 → 429، معرّف آخر → 400، الطلب 201 من العنوان → 429، عنوان آخر يمر؛ `api-scenarios` 16 (محدّث) + 21 (سقف IP، يُشغَّل أخيرًا) | مُثبَت |
| 3 حالات الحقن | `tools/build-bias-fixtures.js` (`INJECTIONS`, مجموعة `prompt_injection`)، `tests/answers/bias-suite.json` (95 حالة، `suite_version 1.1`)، `tests/live-evaluation.mjs` (قاعدتا `injection_not_rewarded` و`injection_text_not_used_as_evidence`)، `tests/phase2.test.mjs` (العدد 5 والإجمالي 95) | 5 حالات = نص حقن + إجابة `dialect-N-msa` النظيفة | `npm test` (العدّ والبنية)؛ **لا تشغيل حي** | مُثبَت محليًا (البنية فقط) |
| 4 مدة التفريغ | `api/transcribe.js` (الرسالة)، `dist/js/evaluate-client.js` (`toFixed(2)`) | مدة ≤ 0 → «التسجيل قصير جدًا. سجّل ثانية واحدة على الأقل.»؛ العميل يرسل كسرًا عشريًا | `api-scenarios` «missing X-Audio-Duration → 400» PASS؛ `journeys` J2/J2b تفريغ ناجح بالمدة العشرية | مُثبَت |
| 5 التفسيرات | `tools/build-exercise-overrides.js`، `tools/exercise-overrides.json` (100 تفسير)، `dist/data/exercises.json`، `package.json` (`exercise-overrides` يبدأ من `build-derived.js` الخام) | «موجز التنفيذ» → عبارة للمستخدم (8)؛ توسيع قوالب «ورد ضمن السلوكيات…» (22)، «سؤال سيناريو/سلوكي…» (16)، «العبارة واردة في صف…» (12)، «ورد في قائمة التحضير الأولي» (5) إلى جمل تشرح السبب من المرجع | `npm test` (130 تمرينًا، لا تفسير = الخيار، لا أسماء حقول، ≤ 5 خيارات، لا تكرار، أعلى موضع 30%)؛ `grep "موجز التنفيذ" dist/data/exercises.json` = 0؛ الطبقة المشتقة مطابقة بايت-ببايت | مُثبَت |

ثوابت: بصمة المرجع `51d413de…a357` دون تغيير؛ `dist/data/derived/*` مطابق بايت-ببايت؛ نصوص الأسئلة والمحفّزات لم تُمس. تعديل الاختبارات في هذه الجولة بالإضافة فقط وفي البنود 1–3 (وسيناريو 16 في الأداة حُدّث نصه لأن قاعدته تغيّرت بالبند 2).

ملاحظة: اسم كاش `sw.js` لم يتغيّر (`v0.5.1`) لأن alpha-2 لم تُنشر؛ عند النشر فوق نسخة منشورة سابقًا غيّر اللاحقة.

---

# alpha-2 (إصلاح تقرير التدقيق المستقل، 4 أكتوبر 2026)

الوسم `alpha-2` وليس `beta` لأن الصفوف 8–10 من بوابة القبول (Smoke حي، `npm run test:live`، iPhone) تحتاج مفتاحًا ونشرًا تجريبيًا وجهازًا حقيقيًا غير متوفرة في بيئة التنفيذ. كل البنود المحلية (1–15) مُثبَتة آليًا.

ثوابت لم تُمس: `dist/data/reference.json` (البصمة `51d413def77dd11a33a672222acbad46e9612da0f2d202bc28537928c2b7a357`)، و`dist/data/derived/*` (مطابق بايت-ببايت بعد `node tools/build-derived.js`)، ونصوص الأسئلة والمحفّزات في التمارين.

## جدول البنود

| البند | الملفات (الأسطر الاسترشادية) | السبب | الاختبار المُثبِت | الحالة |
|---|---|---|---|---|
| 1 قارئ استجابة المزود | `api/_lib/provider.js` (`outputText` 66–85، `usage` 87–94، `extractJsonObject`، `store: false` في `complete` و`transcribe`)؛ `api/_lib/usage.js` (`thought_tokens`, `attempts`)؛ `tests/phase2.test.mjs` (mock بشكل `steps[]+usage`، حالة `status: failed` → 502، فحص `store === false` في التقييم والتفريغ وتقديم الذات) | الاستجابة الخام لا تحتوي `output_text`/`candidates` | `npm test`؛ `api-scenarios` «REAL REST shape (steps[]) parsed» PASS | مُثبَت محليًا؛ Smoke الحي غير مُثبَت (لا مفتاح) |
| 2 تسريب رسالة المزود | `api/_lib/provider.js` (`callInteractions` 53–63)؛ `api/_lib/http.js` (`handleApiError`) | رسالة 429 من المزود كانت تصل للمستخدم | `api-scenarios` «provider 429 → no technical/provider text leaked» PASS؛ `journeys` J5 تعرض «الخدمة مشغولة حاليًا. حاول بعد دقيقة.»؛ `grep -rn "Gemini\|Google" dist/` = 0 | مُثبَت |
| 3 تقرير بلا اقتباسات «موثّق» | `api/_lib/validation.js` (`verifyEvidence` → `verifiedCriteria`)؛ `api/evaluate.js` (`trusted`, `verification.verified_criteria`) | `checked = 0` كان يُعدّ موثوقًا | `api-scenarios` «zero quotes returned → no numeric score» PASS؛ `npm test` (الحالة القائمة 5/6 معايير تبقى موثوقة بدرجة 74) | مُثبَت |
| 4 إعادة المحاولة 3 طلبات | `api/evaluate.js` (عدّاد `attempts`, `RETRYABLE`, `attempt()`) | مسار اقتباسات→مخطط كان يستدعي المزود 3 مرات | `api-scenarios` «retry once only» calls=2 PASS؛ السيناريوهات 3–5 PASS | مُثبَت |
| 5 اكتشاف النسخ وطول الاقتباس | `api/_lib/validation.js` (`quoteLongEnough`, `referenceSimilarityDetails`, `referenceSimilarity`, `nearReferenceModel`)؛ `api/evaluate.js` (العتبات 0.35/0.45/0.6)؛ `tests/phase2.test.mjs` (كلمة واحدة تُرفض، 3 كلمات تُقبل، إعادة صياغة تُكتشف) | إعادة الصياغة الخفيفة كانت تمر (0.214) | `api-scenarios` «lightly paraphrased» PASS (0.788)، «verbatim» PASS، الإجابة المختلفة `near_reference_model=false` | مُثبَت |
| 6 حفظ والخروج بلا استئناف | `dist/js/simulation.js` (`inProgressSessions`, `resumeSession`, بطاقة الاستئناف في `drawSetup`, تأكيد الاستبدال في `startSession`, `draft_answer`)؛ `dist/js/home.js` (بطاقة «استئناف المحاكاة»)؛ `dist/js/sessions.js` (قسم «جلسات غير مكتملة») | الجلسة المحفوظة لم تكن قابلة للاستئناف | `journeys` J1c home/sessions = true؛ J1d: نفس السؤال، نفس المسودة، إرسال، إنهاء → `{completed:3, in_progress:0, drafts:0}` | مُثبَت |
| 7 التقرير المحفوظ ملخص فقط | `dist/js/sessions.js` (`renderSavedSession` → `details.saved-report` لكل إجابة؛ `beforeprint`)؛ `dist/css/styles.css` (`.saved-report` + `@media print`) | المعايير والاقتباسات لم تُعرض ولم تُطبع | `journeys` J1 «saved view shows criteria/quotes?» = 7؛ «print: saved report criteria visible» = 1 | مُثبَت |
| 8 اتجاه الدرجة والعودة لأعلى | `dist/js/report.js` (`bdi` في `.final-score`, `.session-average`, `.session-comparison`)؛ `dist/css/styles.css` (حذف `direction: ltr` منها)؛ `dist/js/simulation.js` (`scrollToTop()` بعد كل `clear(root)`) | «100 من 77» وبقاء التمرير أسفل الشاشة | `journeys` J1 `final-score` = «85 من 100»، `scrollY` بعد التقرير = 0، J6 `scrollY` بعد `drawQuestion` = 0 | مُثبَت |
| 9 الإعدادات وأهداف اللمس والجداول | `dist/js/settings.js` (`shaRow` + زر نسخ)؛ `dist/css/styles.css` (`.ltr overflow-wrap`, `.icon-button`/`.header-actions .icon-button` 44 في كل الاستعلامات، `.button.small 44`, `.brand 44`, `.crumbs a 44×44`, `details.source-section > summary 44`, خانات اختيار بمساحة لمس 44 ومربع مرسوم 24px، تكديس `.source-table` ≤600px)؛ `dist/js/ui.js` (`data-label` لكل خلية، `keyed` للجداول بلا ترويسات) | تمدد أفقي في الإعدادات والدروس، أهداف لمس 36–42px | `ui-sweep` (المظهران): H-OVERFLOW=0، SMALL-TARGET=0 عدا `input.sr-only` 1×1، CLIPPED=0، NULL-TEXT=0، أخطاء كونسول=0 | مُثبَت |
| 10 حفظ التعديل اليدوي | `dist/js/self-intro.js` (`flushDraft` بتأخير 500ms + تفريغ عند `hashchange`، استعادة `saved.text`، تأكيد «صياغة بديلة» عند `edited_manually`) | التعديل اليدوي كان يُفقد | `journeys` J7 «manual edit persisted after leaving page?» = true (result visible=true) | مُثبَت |
| 11 تمارين التثبيت | `tools/exercise-overrides.json` (جديد)، `tools/build-exercise-overrides.js` (جديد، يولّد التفسيرات من المرجع)، `tools/apply-exercise-overrides.js` (جديد، يُطبَّق بعد التوليد)، `package.json` (`derive`, `exercise-overrides`)، `dist/data/exercises.json`، `tests/phase1.test.mjs`، أرقام README/HANDOFF/PHASE_2_DELIVERY | 37 تفسيرًا = الخيار الصحيح، 20 اسم حقل، 33 بـ6–9 خيارات، 8 أزواج مكررة | `npm test`: لا تفسير = الخيار، لا `حقل (…)`, `choices ≤ 5`, لا محفّز مكرر، أعلى نصيب موضع 30% ≤ 35%، العدد 130 ≥ 120 | مُثبَت |
| 12 مصطلحات داخلية ووسوم | `dist/js/simulation.js` 229، `dist/js/self-intro.js` 214، `dist/js/quick-review.js` 42، `dist/js/settings.js` 71، `dist/js/search.js` (`TAG_LABELS`) | «المرحلة الثانية»/«alpha» ووسوم إنجليزية للمستخدم | `grep -rn "المرحلة الأولى\|المرحلة الثانية\|phase2\|alpha" dist/js dist/index.html` = 0؛ `ui-sweep` مسار البحث بلا ENGLISH من الوسوم | مُثبَت |
| 13 كود ميت وأصول | حذف `renderPractice` من `dist/js/sim.js`، حذف `dist/js/evidence.js` وإدخاله في `sw.js`، حذف `renderPreparation` من `dist/js/learn.js`، نقل `DejaVuSans*.ttf` إلى `tools/fonts/`، حذف `api/followup.js` و`generateFollowUp` و`followUpSchema` و`buildFollowUpPrompt` و`endpoints.followup`، تحديث `api/health.js`، `tests/phase1.test.mjs` 157–161، `tests/phase2.test.mjs` (الملفات المطلوبة) | كود غير مستخدم و1.4MB خطوط | `npm test`؛ `grep -rn "evidence.js\|renderPractice\|renderPreparation\|/api/followup" dist api tests` = 0؛ حجم `dist/` 3.46MB → 1.87MB (−1.6MB) | مُثبَت |
| 14 فحص الصوت وإعادة الإرسال | `api/transcribe.js` (`matchesAudioSignature`, رفض `X-Audio-Duration` مفقود/≤0)؛ `dist/js/simulation.js` (`pendingRecording`, زر «إعادة إرسال التسجيل نفسه», `transcribeRecording`, تنظيف في `cleanupSimulation`) | الخادم كان يثق بالترويسات فقط | `api-scenarios`: بايتات عشوائية → 415 PASS؛ ترويسة WebM حقيقية → 200 ومدة مفقودة → 400 PASS؛ `journeys` J2b: فشل (429) → زر إعادة الإرسال → نجاح دون إعادة تسجيل | مُثبَت |
| 15 متفرقات | `dist/js/report.js` 174 + `api/_lib/schemas.js` (`follow_up_reasons`) + `api/_lib/validation.js` (`sanitizeEvaluation`) + `api/evaluate.js`؛ `dist/js/bank.js` (`drawTotals` من `selectedCollection()`)؛ `api/_lib/http.js` (`clientKey` = IP فقط، `clientIdForLog`, فحص حجم `req.body` المُسبق التحليل)؛ `api/_lib/rate-limit.js` (توثيق)؛ `api/_lib/provider.js` (تطبيع MIME مع المعاملات) | أسباب متابعة مستعارة، عدّادات ثابتة، تجاوز الحد بتغيير المعرّف | `npm test`؛ `api-scenarios` 29/29 بعد تحديث السيناريوهين 16–17 و19 | مُثبَت |
| 16 الاختبارات الحية | — | تحتاج `GEMINI_API_KEY` ونشرًا تجريبيًا | — | متعذّر (لا مفتاح/نشر) |
| 17 iPhone | — (قائمة الاختبار موسعة في `HANDOFF.md`) | تحتاج جهازًا حقيقيًا | — | متعذّر |
| 18 التوثيق والتسليم | `dist/js/config.js` (`0.5.1`, `promptVersion: evaluation-1.1`)، `dist/sw.js` (اسم الكاش)، `dist/index.html` (`?v=0.5.1`)، `package.json` (`0.5.1-alpha-2`)، `README.md`، `HANDOFF.md`، `docs/PHASE_2_DELIVERY.md`، هذا الملف | — | `grep -rn "Gemini\|GEMINI\|AIza\|phase2\|alpha" dist/` = 0 | مُثبَت |

## تعارضات اكتُشفت في Preflight وحلّها

1. **`config.js` و`phase2`**: صف 7 من بوابة القبول يطلب صفر نتائج لـ`phase2` في `dist/` بينما البند 12 يستثني `config.js`. اعتُمد الصف الملزم: `promptVersion` في `config.js` و`PROMPT_VERSION` في `api/evaluate.js` أصبحا `evaluation-1.1` (الإصدار تغيّر فعلًا بإضافة `store: false` و`follow_up_reasons`).
2. **خطوط DejaVu**: البند 13 يفترض أن `tools/build_master_plan_docx.py` يستخدمها؛ السكربت لا يشير إليها (يستخدم Arial/Consolas). نُقلت إلى `tools/fonts/` كما طُلب دون تعديل مسار، وبقي إشعار الترخيص في `THIRD_PARTY_NOTICES.md`.
3. **حد المعدل لكل IP (البند 15) مقابل `npm run test:live` بـ90 حالة (البند 16)**: من عنوان واحد ستُرفض الطلبات بعد 40. أُضيف متغير `RATE_LIMIT_EVALUATE` للنشر التجريبي فقط (الافتراضي 40 بلا تغيير)، ووُثّق في README/HANDOFF.
4. **البند 14 وسيناريوهات التفريغ 16–17**: كانت ترسل بايتات ثابتة بوسم `audio/mp4`/`audio/webm`؛ حُدّثت لإرسال ترويسات حقيقية (`ftyp`، `1A 45 DF A3`) كما يسمح البند.
5. **البند 13 وسيناريو 19** (`/api/followup` reachable): حُذفت النقطة بقرار البند فحُدّث السيناريو ليتوقع 404.
6. **السيناريو 16** («bypassable by changing X-Client-Id» كضعف متوقع): البند 15 يزيل هذا الضعف فحُدّث السيناريو ليتوقع 429.
7. **خانات الاختيار**: البند 9 يطلب مربعًا 24px لكن بوابة القبول تطلب SMALL-TARGET=0 (المقياس يفحص عنصر `input` نفسه). الحل: `appearance: none` مع مساحة لمس 44×44 ومربع مرسوم 24px داخل `label` ≥ 44px.
8. **`manifest.counts.exercises`** يبقى 138 لأن `dist/data/derived/*` محمي؛ العدد الفعلي 130 موثّق في HANDOFF.
9. **اختبار `phase1.test.mjs` 157–161**: السطر الثالث (`السيناريو…الموقف موجود داخل السؤال`) لا يوجد في `bank.js`؛ ضُبط على `quick-review.js` حيث يوجد النص، والسطران الآخران على `bank.js` كما طُلب.
10. **`audit-harness`**: مسارات ثابتة (`/home/claude/audit/...`) استُبدلت بمسارات نسبية/متغيرات بيئة، وأُضيف `run-servers.sh`، وأُضيف قبول نوافذ `confirm` في `journeys.mjs` (سلوك مطلوب في البند 6)، وفحوص البنود 6–8 و14.

## ما تغيّر في الاختبارات القائمة

- `tests/phase2.test.mjs`: شكل الـ mock (البند 1) + الملفات المطلوبة بعد حذف `api/followup.js` (البند 13).
- `tests/phase1.test.mjs`: السطور 157–161 (البند 13) + إضافات البند 11.
- `audit-harness/api-scenarios.mjs`: السيناريوهات 16 و17 (البنود 14–15) و19 (البند 13).

## خارج النطاق (المرحلة الثالثة)

الحصص الخادمية (KV)، سقف الميزانية والإيقاف الطارئ، رموز الدخول، لوحة المشرف، حساب التكلفة الفعلية.
