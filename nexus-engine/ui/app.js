/* Nexus app client (protocol v2). Shared by indicator-build and brain-app/indicators; built by nexus-engine/ui/build-ui.mjs */
(function () {
  'use strict';
  var CFG = window.NEXUS_CONFIG || {};
  var ENDPOINT = CFG.endpoint || '/api/indicator';
  var STORE = CFG.store || 'nexus_v2';
  var TPL = CFG.templates || [];
  var LANDING = !!CFG.landing;
  var LIB = CFG.library || '';
  var CHATS = CFG.chats || '';
  var PREVIEW = CFG.preview || '';
  var MAX_CODE = 120000; // same limit as the server
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  /* Web fonts load after first paint: the page never waits for them. */
  if (CFG.fonts) { try { var fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.href = CFG.fonts; document.head.appendChild(fl); } catch (e) {} }

  /* ---------- i18n: [Arabic, English] ---------- */
  var I18N = {
    btn_new: ['+ جديد', '+ New'],
    pv_title: ['معاينة على الشارت', 'Chart preview'], pv_show: ['▶ اعرضه على الشارت', '▶ Show on the chart'], pv_sym: ['الرمز', 'Symbol'],
    pv_loading: ['عم نجيب الأسعار ونرسم المؤشر…', 'Loading prices and drawing the indicator…'],
    pv_note: ['معاينة تقريبية بمحرّكنا الخاص · التأكيد النهائي على TradingView', 'Approximate preview by our own engine · final check on TradingView'],
    pv_sample: ['ما وصلت أسعار حيّة هلّق، هاي شموع تجريبية', 'Live prices are unavailable right now; these are sample candles'],
    pv_fail: ['ما قدرت جيب المعاينة: ', 'Could not load the preview: '], pv_err: ['ما قدرت ارسم المؤشر: ', 'Could not draw the indicator: '],
    pv_unsup: ['ما انرسم بالمعاينة: ', 'Not drawn in the preview: '], pv_src: ['المصدر: ', 'Source: '], pv_hint: ['اسحب لتتحرك · عجلة الماوس أو إصبعين للتكبير · دبل كليك للرجوع', 'Drag to move · wheel or pinch to zoom · double-click to reset'],
    new_sure: ['اضغط كمان مرّة لمسح المحادثة', 'Press again to clear the conversation'],
    new_arm: ['أكيد؟', 'Sure?'],
    b_crash: ['⚠ ما انفحص', '⚠ Not checked'],
    chk_crash: ['الفاحص التلقائي ما قدر يحلّل هالكود، فهو مش مفحوص. الصقه بـ TradingView لتعرف إذا بيشتغل.', 'The automatic checker could not analyse this code, so it is not checked. Paste it into TradingView to see whether it compiles.'],
    unfinished: ['هالطلب ما خلص (الصفحة تسكّرت أو تحدّثت قبل ما يوصل الرد).', 'This request did not finish (the page was closed or reloaded before the reply arrived).'],
    t_menu: ['القائمة', 'Menu'], t_home: ['الرئيسية', 'Home'], t_new: ['محادثة جديدة', 'New chat'], t_lang: ['Switch to English', 'التحويل للعربية'],
    t_att: ['ارفع صورة، فيديو أو ملف', 'Upload an image, video or file'], t_mic: ['تكلّم', 'Speak'], t_send: ['إرسال', 'Send'], t_stop: ['إيقاف', 'Stop'],
    t_close: ['إغلاق', 'Close'], t_remove: ['شيل المرفق', 'Remove attachment'],
    a_in: ['طلبك', 'Your request'],
    ph_in: ['وصّف المؤشر اللي بدك ياه…', 'Describe the indicator you want…'],
    ph_edit: ['اكتب التعديل اللي بدك ياه…', 'Type the change you want…'],
    dw_title: ['∿ بناء المؤشرات', '∿ Indicator builder'],
    dw_ready: ['مؤشرات جاهزة ومفحوصة · فورية', 'Ready & checked · instant'],
    dw_tools: ['أدوات', 'Tools'],
    dw_idea: ['حوّل فكرتي لمؤشر', 'Turn my idea into an indicator'],
    dw_check: ['افحص وصلّح كودي', 'Check and fix my code'],
    dw_strat: ['حوّله لستراتيجي (باك-تست)', 'Convert to a strategy (backtest)'],
    dw_explain: ['اشرحلي الكود', 'Explain the code'],
    dw_img: ['صمّم من صورة', 'Design from an image'],
    dw_upload: ['ارفع ملف Pine أو مواصفات', 'Upload a Pine or spec file'],
    dw_help: ['مساعدة', 'Help'],
    dw_how: ['كيف بحطّ المؤشر بـ TradingView؟', 'How do I add it to TradingView?'],
    dw_note: ['كل كود بينفحص تلقائياً قبل ما يوصلك، ونتيجة الفحص بتبيّن فوقه. إذا TradingView طلّع خطأ، الصقه تحت المؤشر وبينبعت للتصليح والفحص من جديد.', 'Every script is checked automatically before you get it, and the result of the check is shown above it. If TradingView shows an error, paste it under the script and it is sent back for repair and a new check.'],
    intro_h: ['شو المؤشر اللي بدك ياه؟', 'Which indicator do you want?'],
    intro_p: ['اختار مؤشر جاهز ومفحوص وبيوصلك فوراً، أو وصّف فكرتك بكلماتك وبينبنى إلك مؤشر خاص وبينفحص تلقائياً قبل ما يوصلك.', 'Pick a ready, checked indicator and get it instantly, or describe your idea in your own words and get a custom one that is checked automatically before you receive it.'],
    intro_ready: ['جاهزة ومفحوصة · فورية', 'Ready & checked · instant'],
    intro_custom: ['أو جرّب طلب خاص', 'Or try a custom request'],
    ctx_note: ['· طلبك الجاي بيعدّل عليه', '· your next message edits it'],
    ctx_new: ['مؤشر جديد ✕', 'New indicator ✕'],
    how_title: ['كيف بحطّ المؤشر بـ TradingView؟', 'How do I add it to TradingView?'],
    how_1: ['اضغط «نسخ الكود» تحت المؤشر هون.', 'Press "Copy code" under the script here.'],
    how_2: ['افتح TradingView على أي شارت، وتحت الشارت اضغط «Pine Editor».', 'Open any chart on TradingView and click "Pine Editor" below the chart.'],
    how_3: ['امسح كل اللي جوّا (Ctrl+A) والصق الكود (Ctrl+V).', 'Select everything in the editor (Ctrl+A) and paste the code (Ctrl+V).'],
    how_4: ['اضغط «Add to chart». المؤشر بيظهر على الشارت، وإعداداته من علامة ⚙ جنب اسمه.', 'Click "Add to chart". The indicator appears on the chart; its settings are behind the ⚙ icon next to its name.'],
    how_5: ['للتنبيهات: اضغط ⏰ Alert، وبخانة Condition اختار اسم المؤشر وبعدها التنبيه اللي بدك ياه.', 'For alerts: click ⏰ Alert, choose the indicator under Condition, then pick the alert you want.'],
    how_6: ['إذا طلع سطر أحمر (خطأ) تحت المحرّر: انسخه، ارجع لهون، واضغط «طلع خطأ بـ TradingView؟» تحت المؤشر.', 'If a red error line appears under the editor: copy it, come back here and press "Error in TradingView?" under the script.'],
    how_note: ['على الموبايل: تطبيق TradingView ممكن ما يكون فيه Pine Editor. افتح tradingview.com من متصفح اللابتوب، احفظ المؤشر مرّة وحدة، وبعدها بتلاقيه بالتطبيق تحت Indicators → My scripts.', 'On mobile: the TradingView app may not include the Pine Editor. Open tradingview.com in a desktop browser, save the script once, then find it in the app under Indicators → My scripts.'],
    chk_title: ['افحص وصلّح كودي', 'Check and fix my code'],
    chk_p: ['الصق كود Pine Script كامل. الفحص فوري ومجاني. إذا لقى أخطاء بتقدر تطلب تصليحها، والتصليح بينحسب طلب عادي.', 'Paste a complete Pine Script. The check is instant and free. If it finds errors you can ask for a repair, which counts as a normal request.'],
    chk_go: ['افحص الكود', 'Check the code'],
    cancel: ['إلغاء', 'Cancel'],
    copy: ['نسخ الكود', 'Copy code'], copied: ['انتسخ ✓', 'Copied ✓'], dl: ['تنزيل', 'Download'],
    copy_fail: ['ما قدرت أنسخ تلقائياً. فتحتلك الكود: حدّده وانسخه.', 'Could not copy automatically. The code is expanded: select it and copy.'],
    show_all: ['عرض الكود كامل ▾', 'Show all code ▾'], show_less: ['إخفاء الكود ▴', 'Hide code ▴'],
    n_lines: ['{n} سطر', '{n} lines'],
    b_ok: ['✓ انفحص · 0 أخطاء', '✓ Checked · 0 errors'],
    b_err: ['✕ {n} خطأ · ما بيشتغل لسا', '✕ {n} error(s) · will not compile yet'],
    b_warn: ['⚠ بقي {n} ملاحظة', '⚠ {n} finding(s) left'],
    f_title: ['اللي لقاه الفحص التلقائي', 'What the automatic check found'],
    f_notes: ['ملاحظات غير ملزمة من الفحص', 'Optional notes from the check'],
    f_unapplied: ['ما انطبّق {n} من التعديلات اللي طلبتها: الكود تحت ما فيه هالتعديل. اطلب التعديل مرة تانية.', '{n} requested change(s) could not be applied: the code below does not include them. Ask for the change again.'],
    f_more: ['و{n} غيرها', 'and {n} more'],
    a_how: ['كيف بحطّه بـ TradingView؟', 'How to add it to TradingView?'],
    a_err: ['طلع خطأ بـ TradingView؟', 'Error in TradingView?'],
    a_use: ['كمّل على هالنسخة', 'Continue from this version'],
    a_autofix: ['صلّح الملاحظات تلقائياً', 'Fix the findings automatically'],
    use_ok: ['طلبك الجاي بيعدّل على هالنسخة.', 'Your next message edits this version.'],
    fix_p: ['انسخ رسالة الخطأ الحمرا من تحت الـ Pine Editor والصقها هون، وبينبعت الكود للتصليح والفحص من جديد.', 'Copy the red error message from below the Pine Editor and paste it here; the script is sent back for repair and a new check.'],
    fix_ph: ['مثال: Error at 23:5 Undeclared identifier "x"', 'Example: Error at 23:5 Undeclared identifier "x"'],
    fix_go: ['صلّح الخطأ', 'Fix the error'],
    fix_user: ['طلع هالخطأ بـ TradingView:', 'TradingView shows this error:'],
    fix_req: ['صلّح هالخطأ اللي طلع بـ TradingView.', 'Fix this error reported by TradingView.'],
    autofix_user: ['صلّح الملاحظات اللي لقاها الفحص التلقائي.', 'Fix the findings from the automatic check.'],
    tpl_user: ['⚡ مؤشر جاهز: ', '⚡ Ready indicator: '],
    tpl_hist: ['أعطيني المؤشر الجاهز: ', 'Give me the ready indicator: '],
    chk_user: ['🛠️ افحصلي هالكود ({n} سطر)', '🛠️ Check this code ({n} lines)'],
    chk_clean: ['الفحص التلقائي ما لقى ولا خطأ بهالكود.', 'The automatic check found no errors in this code.'],
    chk_bad: ['الفحص لقى {n} مشكلة بالكود. اضغط «صلّح الملاحظات تلقائياً» لتنبعت للتصليح.', 'The check found {n} problem(s). Press "Fix the findings automatically" to send them for repair.'],
    s_start: ['استلمت الطلب', 'Request received'],
    s_think: ['عم فكّر بالتصميم…', 'Thinking about the design…'],
    s_write: ['عم جهّز المؤشر…', 'Preparing the indicator…'],
    s_code: ['عم أكتب الكود… ({n} سطر)', 'Writing the code… ({n} lines)'],
    s_tpl: ['عم أعدّل على قالب مفحوص: {x}', 'Adapting a checked template: {x}'],
    s_edit: ['عم أعدّل على مؤشرك الحالي…', 'Editing your current indicator…'],
    s_cont: ['المؤشر طويل، عم كمّله…', 'Long script, continuing…'],
    s_check: ['فحص تلقائي…', 'Automatic check…'],
    s_check_ok: ['الفحص التلقائي: 0 أخطاء', 'Automatic check: 0 errors'],
    s_check_bad: ['الفحص لقى {e} خطأ و{w} ملاحظة', 'The check found {e} error(s) and {w} finding(s)'],
    s_design: ['عم راجع كل شي طلبته عالشارت وحسّن التصميم (التقييم {n}/100)…', 'Checking every ask on the chart and polishing the look (design {n}/100)…'],
    b_design: ['◆ تصميم {n}/100', '◆ Design {n}/100'],
    s_fix: ['عم صلّح اللي لقاه الفحص (جولة {n})…', 'Fixing what the check found (round {n})…'],
    s_tplget: ['عم جيب المؤشر الجاهز…', 'Fetching the ready indicator…'],
    s_lint: ['عم أفحص الكود…', 'Checking the code…'],
    s_slow: ['المؤشرات الخاصة بتاخد عادةً بين نص دقيقة ودقيقتين. خلّي الصفحة مفتوحة لحدّ ما يخلص.', 'Custom indicators usually take between half a minute and two minutes. Keep this page open until it finishes.'],
    sr_done: ['وصل المؤشر.', 'The indicator is ready.'],
    took: ['⏱ {n} ث', '⏱ {n}s'],
    stopped: ['توقّف الطلب.', 'Request stopped.'],
    retry: ['جرّب مرة تانية', 'Try again'],
    wait_busy: ['استنى ليخلص الطلب الحالي.', 'Wait for the current request to finish.'],
    wait_att: ['المرفق لسا عم يتحمّل، ثانية.', 'The attachment is still loading, one moment.'],
    e_idle: ['انقطع الاتصال قبل ما يخلص الطلب. جرّب مرة تانية.', 'The connection dropped before the request finished. Try again.'],
    e_conn: ['ما قدرت أوصل للسيرفر. تأكّد من النت وجرّب مرة تانية.', 'Could not reach the server. Check your connection and try again.'],
    e_server: ['صار خطأ بالسيرفر. جرّب مرة تانية بعد شوي.', 'The server had a problem. Try again in a moment.'],
    e_rate: ['طلبات كتير ورا بعض. استنى دقيقة وجرّب.', 'Too many requests. Wait a minute and try again.'],
    e_refused: ['السيرفر رفض الطلب.', 'The server refused the request.'],
    e_toolarge: ['الطلب كبير كتير. صغّر المرفقات أو النص وجرّب.', 'The request is too large. Use smaller attachments or less text.'],
    e_empty: ['ما وصل ردّ كامل. جرّب مرة تانية.', 'No complete reply arrived. Try again.'],
    e_long: ['الكود طويل كتير (أقصى شي 120 ألف حرف).', 'The code is too long (max 120,000 characters).'],
    e_store: ['مساحة التخزين بالمتصفح مليانة: المحادثة ما رح تنحفظ بعد التحديث.', 'Browser storage is full: this conversation will not survive a reload.'],
    big: ['الملف كبير (أقصى شي 2MB).', 'File is too large (max 2MB).'],
    big_pdf: ['ملف الـ PDF كبير (أقصى شي 1MB).', 'The PDF is too large (max 1MB).'],
    one_pdf: ['ملف PDF واحد بكل طلب.', 'One PDF per request.'],
    att_max: ['أقصى شي 3 مرفقات بالطلب.', 'At most 3 attachments per request.'],
    badtype: ['نوع الملف مش مدعوم. ارفع صورة، فيديو قصير، PDF، أو ملف نص / Pine.', 'Unsupported file type. Upload an image, a short video, a PDF, or a text / Pine file.'],
    vid_long: ['الفيديو أطول من 10 ثواني، أخدت أول 10 ثواني منه.', 'The video is longer than 10 seconds; the first 10 seconds were used.'],
    vid_fail: ['ما قدرت اقرا الفيديو. جرّب مقطع MP4 أو MOV أقصر.', 'Could not read the video. Try a shorter MP4 or MOV clip.'],
    vid_big: ['الفيديو كبير كتير (الحد 200MB).', 'The video is too large (limit 200 MB).'],
    vid_tag: ['🎬 فيديو', '🎬 Video'],
    noimg: ['ما قدرت اقرأ الصورة.', 'Could not read the image.'],
    mic_denied: ['المتصفح مانع المايك. اسمحله من إعدادات الموقع.', 'The browser blocked the microphone. Allow it in the site settings.'],
    attach: ['مرفق', 'attachment'],
    fromAtt: ['صمّم مؤشر من المرفق.', 'Design an indicator from the attachment.'],
    p_idea: ['بدي مؤشر ', 'I want an indicator that '],
    p_strat_cur: ['حوّل هالمؤشر لستراتيجي strategy() للباك-تست، مع دخول وخروج وإدارة مخاطرة (وقف وهدف).', 'Convert this indicator into a strategy() for backtesting, with entries, exits and risk management (stop and target).'],
    p_strat: ['بدي ستراتيجي للباك-تست: ', 'I want a strategy for backtesting: '],
    p_explain_cur: ['اشرحلي شو بيعمل هالمؤشر وكيف استعمله، بدون ما تغيّر الكود.', 'Explain what this indicator does and how to use it, without changing the code.'],
    p_explain: ['اشرحلي شو بيعمل هالكود وكيف استعمله:\n', 'Explain what this code does and how to use it:\n'],
    p_img: ['هاي صورة مؤشر أو شارت. حلّل المنطق اللي فيها وصمّملي مؤشر Pine بنفس الفكرة.', 'This is an image of an indicator or chart. Work out the logic and design a Pine indicator with the same idea.'],
    p_file: ['هاد ملف فيه كود أو مواصفات مؤشر. اقراه وجهّزلي المؤشر على أساسه.', 'This file contains indicator code or specs. Read it and build the indicator from it.'],
    q1: ['ضيف تنبيهات', 'Add alerts'], q1p: ['ضيف تنبيهات لكل الإشارات المهمّة.', 'Add alerts for every important signal.'],
    q2: ['غيّر الألوان', 'Change colors'], q2p: ['غيّر الألوان: ', 'Change the colors: '],
    q3: ['إشارات أقل', 'Fewer signals'], q3p: ['خفّف عدد الإشارات وخلّي بس الأقوى.', 'Reduce the number of signals and keep only the strongest ones.'],
    st_live: ['شغّال', 'active'], st_off: ['متوقّف مؤقتاً', 'paused'], st_noconn: ['بدون اتصال', 'offline'], st_ready: ['جاهز', 'ready'],
    sync_in: ['تحدّثت المحادثة من جهازك التاني.', 'Conversation updated from your other device.'],
    you: ['إنت', 'You'],
    dw_lib: ['مؤشراتي المحفوظة', 'My saved indicators'],
    dw_chats: ['محادثاتي', 'My conversations'], chat_title: ['محادثاتي', 'My conversations'],
    chat_p: ['كل محادثة بتنحفظ لحالها. افتح أي وحدة وكمّل من وين وقفت.', 'Every conversation is saved automatically. Open any one and continue where you left off.'],
    chat_empty: ['ما في محادثات محفوظة لسا.', 'No saved conversations yet.'], chat_open: ['افتح وكمّل', 'Open & continue'],
    chat_now: ['الحالية', 'current'], chat_opened: ['فتحت المحادثة. كمّل من وين وقفت.', 'Conversation opened. Continue where you left off.'],
    dw_prefs: ['تفضيلاتي (اللي بيتذكّرها)', 'My preferences (remembered)'], pref_title: ['تفضيلاتي', 'My preferences'],
    pref_p: ['أشياء قلتلي ياها عن طريقة شغلك (متل: دايماً ضيف تنبيهات، بشتغل على الذهب 5 دقايق). بتنطبّق على كل مؤشر جديد.', 'Things you told me about how you work (e.g. always add alerts, I trade gold on 5m). They apply to every new indicator.'],
    pref_empty: ['ما في تفضيلات محفوظة لسا. قلّي مثلاً "دايماً بدي الجدول تحت يسار".', 'No preferences yet. Tell me e.g. "always put the table bottom-left".'],
    pref_saved: ['📌 حفظت تفضيلك:', '📌 Preference saved:'],
    lib_title: ['مؤشراتي المحفوظة', 'My saved indicators'],
    lib_p: ['كل مؤشر بيبنيه البوت بينحفظ هون تلقائياً (على كل أجهزتك). افتح أي واحد وكمّل تعديل عليه.', 'Every indicator the bot builds is saved here automatically (on all your devices). Open any one to keep editing it.'],
    lib_search: ['فلتر بالاسم (اختياري)…', 'Filter by name (optional)…'],
    lib_all: ['عندك {n} مؤشر محفوظ · اكبس على أي واحد لتفتحه', 'You have {n} saved indicators · tap one to open it'], lib_more: ['خيارات', 'Options'], lib_chart: ['📈 اعرضه على الشارت', '📈 Show on the chart'],
    st_saved: ['مؤشراتي المحفوظة', 'My saved indicators'],
    dw_studio: ['استوديو الشارت: اعرض وارسم', 'Chart studio: show & draw'],
    st_title: ['🎨 استوديو الشارت', '🎨 Chart studio'],
    st_p: ['اعرض أي مؤشر جاهز على الشارت قبل ما تستعمله، أو ارسم فكرتك (خطوط، مستويات، مناطق، إشارات) والبوت بيبنيلك المؤشر منها.', 'Show any ready indicator on the chart before you use it, or draw your idea (lines, levels, zones, signals) and the bot builds the indicator from it.'],
    st_ind: ['المؤشر على الشارت', 'Indicator on the chart'], st_tools: ['أدوات الرسم', 'Drawing tools'],
    st_none: ['— بدون مؤشر (شارت فاضي للرسم) —', '— No indicator (blank chart to draw on) —'], st_cur: ['السكربت الحالي: {x}', 'Current script: {x}'],
    st_t_move: ['تحريك', 'Move'], st_t_trend: ['خط ترند', 'Trend line'], st_t_hline: ['مستوى', 'Level'], st_t_zone: ['منطقة', 'Zone'], st_t_buy: ['شراء', 'Buy'], st_t_sell: ['بيع', 'Sell'], st_t_text: ['ملاحظة', 'Note'],
    st_undo: ['تراجع', 'Undo'], st_clear: ['امسح', 'Clear'], st_text_ask: ['اكتب الملاحظة:', 'Note text:'],
    st_ask_ph: ['شو بدك المؤشر يعمل؟ (اختياري)', 'What should the indicator do? (optional)'],
    st_use: ['استعمل هالمؤشر', 'Use this indicator'], st_build: ['ابنِ مؤشر من رسمتي', 'Build an indicator from my drawing'],
    st_need: ['ارسم شي على الشارت أو اكتب شو بدك أول.', 'Draw something on the chart or write what you want first.'],
    st_hint: ['اختار أداة وارسم بالسحب (خط، منطقة) أو بكبسة (مستوى، شراء، بيع، ملاحظة) · ✋ للتحريك والتكبير', 'Pick a tool and drag (line, zone) or tap (level, buy, sell, note) · ✋ to move and zoom'],
    st_default_ask: ['ابنيلي مؤشر بيكشف ويرسم هالشي لحاله على الشارت، متل ما رسمته.', 'Build an indicator that detects and draws this automatically on the chart, the way I drew it.'],
    st_drawn: ['اللي رسمته على الشارت ({sym} · {tf}):', 'What I drew on the chart ({sym} · {tf}):'],
    st_on_ind: ['(رسمت فوق مؤشر: {x})', '(drawn on top of: {x})'],
    st_rule: ['الصورة المرفقة هي الشارت مع رسمتي: استعملها مع القائمة كمواصفات، والمؤشر لازم يلاقي هالأشياء لحاله على أي شارت (مش أسعار ثابتة).', 'The attached picture is the chart with my drawing: use it and the list as the spec; the indicator must find these things by itself on any chart (not fixed prices).'],
    lib_empty: ['ما في مؤشرات محفوظة لسا. ابني مؤشر وبينحفظ هون لحاله.', 'No saved indicators yet. Build one and it is saved here automatically.'],
    lib_found: ['{n} من {all} مؤشر', '{n} of {all} indicators'], lib_found_req: ['{n} من {all} (لقيتها بنص الطلب)', '{n} of {all} (found in the request text)'],
    lib_none: ['ما في مؤشر اسمه «{x}».', 'No indicator named "{x}".'],
    lib_loading: ['عم حمّل المكتبة…', 'Loading the library…'],
    lib_err: ['ما قدرت وصل للمكتبة. جرّب بعد شوي.', 'Could not reach the library. Try again in a moment.'],
    lib_locked: ['المكتبة بتحتاج تفعيل هالجهاز برابط Brain (#key=...).', 'The library needs this device to be activated with your Brain link (#key=...).'],
    lib_open: ['افتح للتعديل', 'Open to edit'],
    act_p: ['هالجهاز مش مفعّل لسا. الصق رابط Brain تبعك (اللي فيه #key=) أو المفتاح لحاله، واكبس فعّل. مرّة وحدة بس على كل جهاز.', 'This device is not activated yet. Paste your Brain link (the one with #key=) or the key itself and press Activate. Once per device.'],
    act_ph: ['الصق رابط Brain أو المفتاح', 'Paste your Brain link or key'], act_go: ['فعّل', 'Activate'],
    act_ok: ['✅ تفعّل هالجهاز', '✅ This device is activated'], act_bad: ['المفتاح أو الرابط مش صحيح.', 'That key or link is not valid.'],
    lib_del: ['حذف', 'Delete'], lib_del_sure: ['أكيد؟ اضغط كمان مرّة', 'Sure? Press again'],
    lib_ren: ['إعادة تسمية', 'Rename'], lib_ren_ask: ['الاسم الجديد:', 'New name:'],
    lib_prev: ['رجّع النسخة السابقة', 'Restore previous version'],
    lib_auto: ['تحديث تلقائي {d} ← نسخة {v}', 'auto-updated {d} → v{v}'],
    lib_upd_badge: ['🔄 في تحديث', '🔄 Update ready'],
    lib_upd_btn: ['🔄 حدّث هلق', '🔄 Update now'],
    lib_upd_all: ['🔄 حدّث الكل ({n})', '🔄 Update all ({n})'],
    lib_upd_what: ['تحديث جديد للمؤشرات المحفوظة: {x}', 'New update for saved indicators: {x}'],
    lib_upd_busy: ['عم حدّث «{x}»… (دقيقة أو دقيقتين)', 'Updating “{x}”… (a minute or two)'],
    lib_upd_done: ['✅ «{x}»: النسخة {a} ← صارت النسخة {b}. القديمة محفوظة (رجّع النسخة السابقة).', '✅ “{x}”: version {a} → version {b}. The old one is kept (Restore previous version).'],
    lib_upd_same: ['➖ «{x}»: ما احتاج تغيير.', '➖ “{x}”: nothing to change.'],
    lib_upd_fail: ['⚠️ «{x}»: التحديث ما نجح بالفحص، ضلّ على النسخة القديمة.', '⚠️ “{x}”: the update did not pass the check; the old version stays.'],
    lib_auto_on: ['تحديث تلقائي: شغّال', 'Auto update: on'],
    lib_auto_off: ['تحديث تلقائي: موقّف', 'Auto update: off'],
    lib_vers: ['{n} نسخة سابقة', '{n} earlier version(s)'],
    lib_saved: ['💾 انحفظ بمؤشراتي', '💾 Saved to my indicators'],
    lib_updated: ['💾 انحفظ التعديل على نفس المؤشر', '💾 Changes saved to the same indicator'],
    lib_save: ['💾 احفظ بمؤشراتي', '💾 Save to my indicators'],
    lib_save_fail: ['ما انحفظ بالمكتبة (رح جرّب بالمرّة الجاية).', 'Not saved to the library (will retry next time).'],
    lib_opened: ['📂 فتحت المؤشر: {x}. طلبك الجاي بيعدّل عليه.', '📂 Opened: {x}. Your next message edits it.'],
    lib_restored: ['رجعت النسخة السابقة.', 'Previous version restored.'],
    lib_deleted: ['انحذف.', 'Deleted.'],
    clip_btn: ['🎬 مقطع تيك توك', '🎬 TikTok clip'],
    clip_title: ['🎬 مقطع للتيك توك', '🎬 Clip for TikTok'],
    clip_lead: ['Brain بيشغّل المؤشر على شموع حقيقية وبيعيدها شمعة شمعة (متل Bar Replay) وبيسجّل فيديو طولي 1080×1920 جاهز للنشر. التسجيل بياخد نفس مدّة المقطع، خلّي الصفحة مفتوحة.', 'Brain runs the indicator on real candles, replays them bar by bar (like Bar Replay) and records a vertical 1080x1920 video ready to post. Recording takes as long as the clip - keep this page open.'],
    clip_tf: ['الفريم', 'Timeframe'],
    clip_dur: ['المدّة', 'Length'],
    clip_hook: ['الجملة اللي بتشدّ (فوق)', 'Hook text (top)'],
    clip_hook_def: ['شوف {x} كيف بيقرأ السوق 👀', 'Watch {x} read the market 👀'],
    clip_handle: ['اسمك / رابط التلغرام (تحت)', 'Your name / Telegram (bottom)'],
    clip_handle_ph: ['مثلاً: تلغرام @YourChannel', 'e.g. Telegram @YourChannel'],
    clip_go: ['🎬 سجّل المقطع', '🎬 Record clip'],
    clip_again: ['🎬 سجّل كمان واحد', '🎬 Record another'],
    clip_loading: ['عم شغّل المؤشر على الشموع…', 'Running the indicator on the candles…'],
    clip_rec: ['🔴 عم سجّل… باقي {s} ثانية', '🔴 Recording… {s}s left'],
    clip_done: ['✅ جاهز ({s} MB، {f}). نزّله وانشره.', '✅ Ready ({s} MB, {f}). Download and post it.'],
    clip_webm: ['(متصفحك بيسجّل WebM؛ للـ MP4 استعمل Safari أو Chrome جديد)', '(your browser records WebM; for MP4 use Safari or a recent Chrome)'],
    clip_dl: ['⬇️ نزّل الفيديو', '⬇️ Download video'],
    clip_share: ['📤 شارك', '📤 Share'],
    clip_cancel: ['توقّف التسجيل.', 'Recording stopped.'],
    clip_err: ['ما زبط المقطع:', 'Clip failed:'],
    clip_sample: ['ما وصلت شموع حقيقية لهالرمز هلّق، جرّب رمز أو فريم تاني.', 'No live candles for this symbol right now - try another symbol or timeframe.'],
    clip_unsupported: ['متصفحك ما بيدعم تسجيل الفيديو. جرّب Chrome أو Safari.', 'Your browser cannot record video. Try Chrome or Safari.'],
    clip_sim: ['محاكاة على Brain', 'Brain replay'],
    clip_disc: ['تعليمي · مش نصيحة مالية', 'Educational · not financial advice'],
    clip_cta: ['اشترك بالمؤشر 👇', 'Get the indicator 👇'],
    forget_btn: ['🗑️ احذف من الذاكرة', '🗑️ Delete from memory'],
    forget_sure: ['متأكد؟ اضغط كمان مرّة', 'Sure? Tap again'],
    forget_card: ['🗑️ هالمؤشر انحذف من الذاكرة ({x}) — البوت ما رح يرجع يبني عليه.', '🗑️ This indicator was deleted from memory ({x}) - the bot will not build on it again.'],
    forget_note: ['🧹 بلّشنا صفحة جديدة: المؤشر القديم وطلباته انمسحوا من ذاكرة البوت (ومن مؤشراتي المحفوظة). احكيلي شو بدك من الأول.', '🧹 Fresh start: the old indicator and its requests are gone from the bot\'s memory (and from my saved indicators). Tell me what you want from scratch.'],
    forget_none: ['ما في مؤشر حالي لأحذفه من الذاكرة.', 'There is no current indicator to delete from memory.'],
    forget_toast: ['🗑️ انحذف من الذاكرة', '🗑️ Deleted from memory'],
    hint: [CFG.hintAr || 'Pine Script v6 · أداة تعليمية، مش نصيحة مالية', CFG.hintEn || 'Pine Script v6 · educational tool, not financial advice']
  };
  var SUG = [
    ['مؤشر يعطي إشارة شراء لما RSI يطلع فوق 30 والسعر فوق EMA 200، مع تنبيه', 'Buy signal when RSI crosses above 30 while price is above the 200 EMA, with an alert'],
    ['ارسم قمة وقاع أول ساعة من جلسة نيويورك ونبّهني عند الكسر', 'Draw the high and low of the first hour of the New York session and alert me on a breakout'],
    ['بولنجر باند مع سهم لما الشمعة تسكّر برّا الباند وترجع لجوّا', 'Bollinger Bands with an arrow when a candle closes outside the band and then back inside'],
    ['VWAP مع انحرافين معياريين وتلوين الخلفية حسب الاتجاه', 'VWAP with two standard-deviation bands and a background colored by trend']
  ];
  if (CFG.i18n) { for (var k0 in CFG.i18n) I18N[k0] = CFG.i18n[k0]; }

  var L = 0;
  try { if (localStorage.getItem('nexus_lang') === 'en') L = 1; } catch (e) {}
  function t(k, vars) {
    var v = I18N[k]; var s = v ? v[L] : k;
    if (!v) { try { console.warn('i18n: missing key ' + k); } catch (e) {} }
    if (vars) for (var n in vars) s = s.split('{' + n + '}').join(String(vars[n]));
    return s;
  }
  function tplTitle(id) { for (var i = 0; i < TPL.length; i++) if (TPL[i].id === id) return TPL[i].title[L ? 'en' : 'ar']; return id; }

  /* ---------- elements ---------- */
  var appview = $('appview'), thread = $('thread'), wrap = $('wrap'), input = $('in'), sendBtn = $('send');
  var dot = $('dot'), stat = $('stat'), drawer = $('drawer'), scrim = $('scrim'), fileInput = $('file'), chipsEl = $('chips');
  var ctxBar = $('ctx'), ctxFile = $('ctxFile'), qe = $('qe'), toastEl = $('toast'), liveEl = $('live'), menuBtn = $('menu'), newBtn = $('newchat');
  var composer = document.querySelector('#appview .composer'), header = document.querySelector('#appview header');
  var introHtml = $('intro') ? $('intro').outerHTML : '';

  /* ---------- state ---------- */
  function newChatId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var S = { msgs: [], cur: null, seq: 0, chatId: newChatId() };
  // `gen` changes when the conversation is cleared: a reply that belongs to the old conversation is dropped.
  var busy = false, busyAt = 0, ctl = null, gen = 0, pending = [], loading = 0, arts = [], mic = null;

  /* ---------- small helpers ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function str(v, max) { return typeof v === 'string' ? (max ? v.slice(0, max) : v) : ''; }
  function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }
  function coarse() { try { return matchMedia('(pointer:coarse)').matches; } catch (e) { return false; } }
  // Text direction by content: one Arabic letter makes the block right-to-left, whatever it starts with.
  function dirOf(s) { return /[؀-ۿ]/.test(String(s || '')) ? 'rtl' : 'ltr'; }
  // Sets a translatable text on an element and remembers the key, so a language switch updates it in place.
  function tx(e, key, vars) {
    e.setAttribute('data-i18n', key);
    if (vars) e.setAttribute('data-i18n-vars', JSON.stringify(vars)); else e.removeAttribute('data-i18n-vars');
    e.textContent = t(key, vars);
    return e;
  }
  function rich(s) {
    var e = esc(s);
    e = e.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    e = e.replace(/`([^`\n]+)`/g, '<code class="ic">$1</code>');
    return e;
  }
  function nearBottom() { return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 160; }
  function toBottom(force) { if (force || nearBottom()) wrap.scrollTop = wrap.scrollHeight; }
  function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2000); }
  function announce(msg) { if (liveEl) liveEl.textContent = msg; }
  function copyText(s) {
    function fallback() {
      var prev = document.activeElement, ta = el('textarea'); ta.value = s; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) {} }
      return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s).catch(fallback);
    return fallback();
  }
  // File names come from the server or from storage: keep them plain and always ".pine".
  function safeName(name) {
    name = String(name || '').replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^[._]+/, '').slice(0, 80);
    if (!/\.pine$/i.test(name)) name = (name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'nexus_indicator') + '.pine';
    return name;
  }
  function download(name, content) {
    var bl = new Blob([content], { type: 'text/plain;charset=utf-8' }), u = URL.createObjectURL(bl), a = el('a');
    a.href = u; a.download = safeName(name); a.style.display = 'none'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 40000);
  }

  /* ---------- storage ---------- */
  // Each tab keeps its own conversation (sessionStorage); the latest one is also kept for the next visit (localStorage).
  function stores() { var out = []; try { out.push(window.sessionStorage); } catch (e) {} try { out.push(window.localStorage); } catch (e) {} return out.filter(Boolean); }
  function cleanReport(r) {
    if (!r || typeof r !== 'object') return null;
    var pick = function (list) {
      return (Array.isArray(list) ? list : []).filter(function (f) { return f && typeof f === 'object'; }).slice(0, 8).map(function (f) { return { line: num(f.line, 0), message: String(f.message == null ? '' : f.message).slice(0, 600) }; });
    };
    var errors = pick(r.errors), warnings = pick(r.warnings);
    var errorCount = Math.max(errors.length, num(r.errorCount, 0)), warningCount = Math.max(warnings.length, num(r.warningCount, 0)), unapplied = num(r.unappliedEdits, 0);
    var crashed = r.crashed === true || (Array.isArray(r.warnings) ? r.warnings : []).some(function (f) { return f && f.rule === 'NX_CHECKER_CRASH'; });
    return { verified: r.verified === true && !errorCount && !unapplied && !crashed, errors: errors, warnings: warnings, errorCount: errorCount, warningCount: warningCount, unappliedEdits: unapplied, crashed: crashed };
  }
  // Messages from the server and from storage go through here: only known fields with the expected types survive.
  function cleanMsg(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.r === 'u') return { r: 'u', text: str(m.text, 20000), api: typeof m.api === 'string' ? m.api.slice(0, 6000) : undefined, imgs: num(m.imgs, 0) || undefined };
    if (m.r !== 'a') return null;
    if (m.kind === 'script') {
      return { r: 'a', kind: 'script', id: num(m.id, 0), explain: str(m.explain, 20000), line: str(m.line, 600), code: str(m.code, MAX_CODE * 2), file: safeName(m.file), title: str(m.title, 200), report: cleanReport(m.report), base: str(m.base, 80), ms: num(m.ms, 0), dropped: m.dropped ? true : undefined, libId: libIdOk(m.libId) ? m.libId : undefined, forgot: m.forgot ? true : undefined };
    }
    return { r: 'a', kind: 'text', explain: str(m.explain, 20000), forget: m.forget ? true : undefined };
  }
  function libIdOk(v) { return typeof v === 'string' && /^[a-z0-9]{6,24}$/.test(v); }
  function slimJson(data) {
    // Storage full: keep the code of the three latest scripts only.
    var keep = 3, msgs = data.msgs.slice();
    for (var i = msgs.length - 1; i >= 0; i--) {
      var m = msgs[i];
      if (m.kind === 'script' && m.code) { if (keep > 0) keep--; else { m = msgs[i] = Object.assign({}, m); m.code = ''; m.dropped = true; } }
    }
    return JSON.stringify({ v: 2, msgs: msgs, cur: data.cur, seq: data.seq, chatId: data.chatId });
  }
  function save() {
    var msgs = S.msgs.slice(-30), cur = S.cur;
    if (cur && msgs.some(function (m) { return m.id === cur.id && m.code; })) cur = { id: cur.id, file: cur.file, libId: cur.libId };
    var data = { v: 2, msgs: msgs, cur: cur, seq: S.seq, chatId: S.chatId }, full = JSON.stringify(data), slim = null, saved = 0;
    stores().forEach(function (st) {
      try { st.setItem(STORE, full); saved++; }
      catch (e) { try { if (slim === null) slim = slimJson(data); st.setItem(STORE, slim); saved++; } catch (e2) { try { st.removeItem(STORE); } catch (e3) {} } }
    });
    if (!saved && !save.warned) { save.warned = true; toast(t('e_store'), 5000); }
    pushSync(); archiveChat();
  }

  /* ---------- one conversation on all the owner's devices (pages with CFG.sync, activated with the owner key) ---------- */
  var SYNC = CFG.sync || '', syncRev = 0, syncTimer = null, syncKey = '', lastActive = Date.now();
  if (SYNC) {
    try {
      var hk = /[#&]key=([A-Za-z0-9_-]{24,200})(?![A-Za-z0-9_-])/.exec(location.hash || '');
      if (hk) { localStorage.setItem('brain_key', hk[1]); history.replaceState(null, '', location.pathname + location.search + (LANDING ? '#app' : '')); }
      syncKey = localStorage.getItem('brain_key') || '';
    } catch (e) {}
  }
  function syncData() {
    var slim = JSON.parse(slimJson({ msgs: S.msgs.slice(-30), cur: S.cur ? { id: S.cur.id, file: S.cur.file, libId: S.cur.libId } : null, seq: S.seq, chatId: S.chatId }));
    return slim;
  }
  function pushSync() {
    if (!SYNC || !syncKey) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      fetch(SYNC, { method: 'POST', headers: { 'content-type': 'application/json', 'x-brain-key': syncKey }, body: JSON.stringify({ data: syncData() }) })
        .then(function (r) { return r.json(); }).then(function (d) { if (d && d.ok && d.rev) syncRev = d.rev; }).catch(function () {});
    }, 500);
  }
  function pullSync() {
    if (!SYNC || !syncKey || busy || loading) return;
    fetch(SYNC, { headers: { 'x-brain-key': syncKey }, cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      if (!d.rev) { if (S.msgs.length) pushSync(); return; }
      if (d.rev <= syncRev || !d.data || busy || loading || document.querySelector('.modal.on') || document.querySelector('.fixbox.on')) return;
      var first = syncRev === 0, before = JSON.stringify(syncData());
      syncRev = d.rev;
      if (JSON.stringify(d.data) === before) return;
      var text = JSON.stringify(d.data);
      stores().forEach(function (st) { try { st.setItem(STORE, text); } catch (e) {} });
      S = { msgs: [], cur: null, seq: 0, chatId: newChatId() }; load(); renderAll();
      if (!first) toast(t('sync_in'), 2500);
    }).catch(function () {});
  }
  function load() {
    var raw = null;
    stores().some(function (st) { try { raw = st.getItem(STORE); } catch (e) { raw = null; } return !!raw; });
    try {
      var d = JSON.parse(raw || 'null');
      if (d && d.v === 2 && Array.isArray(d.msgs)) {
        S.msgs = d.msgs.map(cleanMsg).filter(Boolean);
        S.seq = Math.max(num(d.seq, 0), S.msgs.reduce(function (a, m) { return Math.max(a, m.id || 0); }, 0));
        var c = d.cur && typeof d.cur === 'object' ? { id: num(d.cur.id, 0), file: safeName(d.cur.file), code: str(d.cur.code, MAX_CODE * 2), libId: libIdOk(d.cur.libId) ? d.cur.libId : undefined } : null;
        if (c && !c.code) { var src = S.msgs.filter(function (m) { return m.kind === 'script' && m.id === c.id && m.code; })[0]; c = src ? { id: src.id, file: src.file, code: src.code, libId: src.libId || c.libId } : null; }
        S.cur = c;
        if (typeof d.chatId === 'string' && /^[a-z0-9]{6,24}$/.test(d.chatId)) S.chatId = d.chatId;
      }
    } catch (e) { S = { msgs: [], cur: null, seq: 0, chatId: newChatId() }; }
    try { localStorage.removeItem('nexus_convo'); localStorage.removeItem('brain_ind_convo'); } catch (e) {}
  }

  /* ---------- Pine highlighting (display only) ---------- */
  var TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b|#[0-9A-Fa-f]{6,8}\b)|(\b(?:if|else|for|to|by|in|while|switch|var|varip|import|export|type|method|enum|and|or|not|true|false|na|const|simple|series|int|float|bool|string|color|line|label|box|table|array|map|matrix)\b)|(\b(?:indicator|strategy|library|plot\w*|hline|fill|bgcolor|barcolor|alertcondition|alert|input|ta|math|str|request|array|label|line|box|table|color|strategy|syminfo|timeframe|barstate|time|map|matrix)(?:\.\w+)*(?=\s*\())/g;
  function hiLine(line) {
    if (line.length > 2000) return esc(line); // very long lines are shown plain: the pattern is not linear on them
    var out = '', last = 0, m; TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line)) !== null) {
      if (m[0] === '') { TOKEN.lastIndex++; continue; }
      out += esc(line.slice(last, m.index));
      var cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-n' : m[4] ? 'tk-k' : 'tk-f';
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
      if (m[1]) break;
    }
    return out + esc(line.slice(last));
  }
  function hiCode(code) {
    var lines = String(code || '').replace(/\n$/, '').split('\n'), html = '';
    for (var i = 0; i < lines.length; i++) html += '<span class="l">' + hiLine(lines[i]) + '</span>';
    return html;
  }

  /* ---------- thread rendering ---------- */
  function clearIntro() { var i = $('intro'); if (i) i.remove(); }
  function addUser(text, previews) {
    clearIntro();
    var m = el('div', 'msg u'), av = tx(el('div', 'av u'), 'you'), col = el('div', 'col'), bub = el('div', 'bub');
    av.setAttribute('aria-hidden', 'true');
    bub.dir = dirOf(text); bub.textContent = text || '';
    (previews || []).forEach(function (src) { var im = el('img', 'att'); im.alt = ''; im.src = src; bub.appendChild(im); });
    col.appendChild(bub); m.appendChild(av); m.appendChild(col); thread.appendChild(m); toBottom(true);
  }
  function addShell() {
    clearIntro();
    var m = el('div', 'msg b'), av = el('div', 'av b', '∿'), col = el('div', 'col');
    av.setAttribute('aria-hidden', 'true');
    m.appendChild(av); m.appendChild(col); thread.appendChild(m); toBottom(true);
    return col;
  }
  function addBubble(col, text, cls) {
    var b = el('div', 'bub' + (cls ? ' ' + cls : '')); b.dir = dirOf(text); b.innerHTML = rich(text); col.appendChild(b); return b;
  }
  // A notice in place of a reply: an error or "stopped", with a retry button that re-runs the same request.
  function renderNotice(col, text, cls, retryFn) {
    col.innerHTML = '';
    var b = addBubble(col, text, cls);
    if (cls === 'err') b.setAttribute('role', 'alert');
    if (retryFn) {
      var r = tx(el('button', 'btn2 retry'), 'retry'); r.type = 'button';
      r.onclick = function () { if (busy) { toast(t('wait_busy')); return; } var m = r.closest('.msg'); if (m) m.remove(); retryFn(); };
      b.appendChild(document.createElement('br')); b.appendChild(r);
    }
    announce(text); toBottom();
  }
  // A retry button belongs to the latest request only: once a new request starts, older ones would re-send stale state.
  function clearRetries() {
    thread.querySelectorAll('.retry').forEach(function (b) { var br = b.previousSibling; if (br && br.nodeName === 'BR') br.remove(); b.remove(); });
  }

  function Progress(col, firstKey) {
    var card = el('div', 'prog'), top = el('div', 'ptop'), sp = el('span', 'spin'), label = el('span', '', t(firstKey || 's_write')), tm = el('span', 'tm', '0:00');
    var list = el('ul'), tail = null, hint = null, t0 = Date.now(), tailBuf = '', nLines = 1, lastLabel = label.textContent, lastBad = false, self = this, first = true, coding = false;
    sp.setAttribute('aria-hidden', 'true');
    top.appendChild(sp); top.appendChild(label); top.appendChild(tm); card.appendChild(top); card.appendChild(list); col.appendChild(card);
    announce(label.textContent);
    var timer = setInterval(function () {
      var s = Math.floor((Date.now() - t0) / 1000); tm.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
      if (s >= 20 && !hint && !self.quick) { hint = el('div', 'hintline', t('s_slow')); card.appendChild(hint); toBottom(); }
    }, 500);
    function step(text, bad, quiet) {
      // The first (generic) label is replaced, later ones move to the done list.
      if (!first && lastLabel !== text) list.appendChild(el('li', lastBad ? 'bad' : '', lastLabel.replace(/…$/, '')));
      first = false; label.textContent = text; lastLabel = text; lastBad = !!bad;
      if (!quiet) announce(text);
      toBottom();
    }
    this.quick = false;
    this.stage = function (ev) {
      if (!ev || ev.id === 'start' || ev.id === 'write') return;
      coding = false;
      if (ev.id === 'think') return step(t('s_think'));
      if (ev.id === 'template') return step(t('s_tpl', { x: tplTitle(String(ev.template || '')) }));
      if (ev.id === 'edit') return step(t('s_edit'));
      if (ev.id === 'continue') return step(t('s_cont'));
      if (ev.id === 'check') {
        if (tail) { tail.remove(); tail = null; tailBuf = ''; nLines = 1; }
        var e = num(ev.errors, 0), w = num(ev.warnings, 0);
        return step(e + w > 0 ? t('s_check_bad', { e: e, w: w }) : t('s_check_ok'), e + w > 0);
      }
      if (ev.id === 'fix') return step(t('s_fix', { n: num(ev.round, 1) || 1 }));
      if (ev.id === 'design') return step(t('s_design', { n: num(ev.score, 0) }));
    };
    this.code = function (d) {
      d = String(d == null ? '' : d);
      for (var i = 0; i < d.length; i++) if (d.charCodeAt(i) === 10) nLines++;
      tailBuf = (tailBuf + d).slice(-1500);
      if (!tail) { tail = el('div', 'tail'); tail.setAttribute('aria-hidden', 'true'); card.insertBefore(tail, hint); }
      tail.textContent = tailBuf.split('\n').slice(-6).join('\n');
      var txt = t('s_code', { n: nLines });
      if (!coding) { coding = true; step(txt, false, true); } else { label.textContent = txt; lastLabel = txt; }
      toBottom();
    };
    this.done = function () { clearInterval(timer); card.remove(); return Math.round((Date.now() - t0) / 1000); };
  }

  function refreshCurrent() {
    arts.forEach(function (a) { a.use.style.display = (S.cur && S.cur.id === a.msg.id) || !a.msg.code ? 'none' : ''; });
    if (S.cur && S.cur.code) { ctxBar.classList.add('on'); ctxFile.textContent = S.cur.file || 'script.pine'; input.setAttribute('data-i18n-ph', 'ph_edit'); }
    else { ctxBar.classList.remove('on'); input.setAttribute('data-i18n-ph', 'ph_in'); }
    input.placeholder = t(input.getAttribute('data-i18n-ph'));
    grow();
  }

  function renderScript(col, msg) {
    if (msg.explain) addBubble(col, msg.explain);
    var rep = msg.report || null, verified = !!(rep && rep.verified);
    var nErr = rep ? rep.errorCount : 0, nWarn = rep ? rep.warningCount : 0, nUn = rep ? rep.unappliedEdits : 0;
    // ok: passed the check. bad: errors remain, it will not compile. warn: something else is left (findings, unapplied edits).
    var state = !rep ? '' : verified ? 'ok' : nErr ? 'bad' : 'warn', crashed = !!(rep && rep.crashed);
    if (msg.line) { var vl = el('div', 'vline' + (state ? ' ' + state : ''), msg.line); vl.dir = dirOf(msg.line); col.appendChild(vl); }

    var art = el('div', 'art' + (state ? ' ' + state : '')), bar = el('div', 'bar');
    bar.appendChild(el('span', 'fn', msg.file || 'script.pine'));
    if (rep) bar.appendChild(tx(el('span', 'badge ' + state), verified ? 'b_ok' : nErr ? 'b_err' : crashed ? 'b_crash' : 'b_warn', verified ? null : { n: nErr || Math.max(1, nWarn + nUn) }));
    if (rep && rep.design && typeof rep.design.score === 'number') bar.appendChild(tx(el('span', 'badge ' + (rep.design.score >= 80 ? 'ok' : 'warn')), 'b_design', { n: rep.design.score }));
    var nLines = String(msg.code || '').replace(/\n$/, '').split('\n').length;
    bar.appendChild(tx(el('span', 'meta'), 'n_lines', { n: nLines }));
    // Copy is the main action only when there is nothing left to repair.
    var sp = el('span', 'sp'), bCopy = tx(el('button', 'btn2' + (!rep || verified ? ' pri' : '')), 'copy'), bDl = tx(el('button', 'btn2'), 'dl');
    bCopy.type = bDl.type = 'button'; sp.appendChild(bCopy); sp.appendChild(bDl); bar.appendChild(sp); art.appendChild(bar);

    var cw = el('div', 'codewrap closed'), pre = el('pre'), more = tx(el('button', 'more'), 'show_all');
    more.type = 'button'; more.setAttribute('aria-expanded', 'false'); pre.innerHTML = hiCode(msg.code); pre.tabIndex = 0;
    cw.appendChild(pre); cw.appendChild(more); art.appendChild(cw);
    if (nLines <= 12) { cw.classList.remove('closed'); more.style.display = 'none'; }
    function setOpen(open) { cw.classList.toggle('closed', !open); tx(more, open ? 'show_less' : 'show_all'); more.setAttribute('aria-expanded', open ? 'true' : 'false'); }

    var findings = rep ? rep.errors.map(function (f) { return { f: f, e: true }; }).concat(rep.warnings.map(function (f) { return { f: f, e: false }; })) : [];
    if (findings.length || nUn) {
      var fd = el('div', 'findings' + (state ? ' ' + state : ''));
      fd.appendChild(tx(el('div', 'ft'), verified ? 'f_notes' : 'f_title'));
      if (nUn) fd.appendChild(tx(el('p', 'fu'), 'f_unapplied', { n: nUn }));
      if (findings.length) {
        var ol = el('ol');
        findings.slice(0, 8).forEach(function (x) {
          var li = el('li', x.e ? 'e' : '');
          if (x.f.line > 0) { li.appendChild(el('b', '', 'Line ' + x.f.line + ':')); li.appendChild(document.createTextNode(' ')); }
          li.appendChild(document.createTextNode(x.f.message));
          ol.appendChild(li);
        });
        fd.appendChild(ol);
        var rest = nErr + nWarn - Math.min(8, findings.length);
        if (rest > 0) fd.appendChild(tx(el('div', 'fm'), 'f_more', { n: rest }));
      }
      art.appendChild(fd);
    }

    var foot = el('div', 'foot');
    var bFixAuto = tx(el('button', 'btn2 pri'), 'a_autofix'), bHow = tx(el('button', 'btn2'), 'a_how'), bErr = tx(el('button', 'btn2'), 'a_err'), bUse = tx(el('button', 'btn2'), 'a_use');
    bFixAuto.type = bHow.type = bErr.type = bUse.type = 'button';
    if (rep && !verified && !crashed && (nErr || nWarn)) foot.appendChild(bFixAuto);
    foot.appendChild(bHow); foot.appendChild(bErr); foot.appendChild(bUse);
    if (LIB && syncKey) {
      var bLib = tx(el('button', 'btn2'), 'lib_save'); bLib.type = 'button';
      if (msg.libId) bLib.style.display = 'none';
      bLib.onclick = function () { bLib.disabled = true; libSave(msg, null, function (ok) { bLib.disabled = false; if (ok) bLib.style.display = 'none'; }); };
      foot.appendChild(bLib); msg._libBtn = bLib;
    }
    var bForget = tx(el('button', 'btn2 del'), 'forget_btn'), fArmed = 0; bForget.type = 'button';
    bForget.onclick = function () {
      if (Date.now() - fArmed > 3000) { fArmed = Date.now(); tx(bForget, 'forget_sure'); setTimeout(function () { if (Date.now() - fArmed >= 3000) tx(bForget, 'forget_btn'); }, 3100); return; }
      forgetScript(msg);
    };
    foot.appendChild(bForget);
    if (clipSupported() && msg.code) { var bClip = tx(el('button', 'btn2 clip'), 'clip_btn'); bClip.type = 'button'; bClip.onclick = function () { openClip(msg); }; foot.appendChild(bClip); }
    if (msg.ms) foot.appendChild(tx(el('span', 'tm'), 'took', { n: Math.round(msg.ms / 1000) }));
    art.appendChild(foot);

    var fx = el('div', 'fixbox'), fp = tx(el('p'), 'fix_p'), fta = el('textarea'), frow = el('div', 'row'), fgo = tx(el('button', 'btn2 pri'), 'fix_go'), fno = tx(el('button', 'btn2'), 'cancel');
    fta.setAttribute('data-i18n-ph', 'fix_ph'); fta.placeholder = t('fix_ph'); fta.setAttribute('data-i18n-aria', 'a_err'); fta.setAttribute('aria-label', t('a_err'));
    fta.spellcheck = false; fta.maxLength = 3000; fgo.type = fno.type = 'button';
    frow.appendChild(fgo); frow.appendChild(fno); fx.appendChild(fp); fx.appendChild(fta); fx.appendChild(frow); art.appendChild(fx);

    bCopy.onclick = function () {
      copyText(msg.code).then(function () { tx(bCopy, 'copied'); toast(t('copied')); setTimeout(function () { tx(bCopy, 'copy'); }, 1400); })
        .catch(function () { setOpen(true); more.style.display = 'none'; toast(t('copy_fail'), 4500); });
    };
    bDl.onclick = function () { download(msg.file || 'script.pine', msg.code); };
    more.onclick = function () { setOpen(cw.classList.contains('closed')); };
    bHow.onclick = function () { openModal('howModal'); };
    bErr.onclick = function () { fx.classList.toggle('on'); if (fx.classList.contains('on')) { try { fx.scrollIntoView({ block: 'nearest' }); } catch (e) {} fta.focus(); } };
    fno.onclick = function () { fx.classList.remove('on'); bErr.focus(); };
    fgo.onclick = function () { var v = fta.value.trim(); if (!v) { fta.focus(); return; } if (busy) { toast(t('wait_busy')); return; } fx.classList.remove('on'); fta.value = ''; runFix(msg, v.slice(0, 3000)); };
    bFixAuto.onclick = function () { if (busy) { toast(t('wait_busy')); return; } runFix(msg, ''); };
    bUse.onclick = function () { S.cur = { id: msg.id, code: msg.code, file: msg.file, libId: msg.libId }; save(); refreshCurrent(); toast(t('use_ok')); };

    if (PREVIEW && msg.code && window.NexusChart) { art.insertBefore(previewBlock(msg), cw); setTimeout(pvAutoLatest, 30); }
    col.appendChild(art);
    arts.push({ msg: msg, use: bUse });
    refreshCurrent(); toBottom();
  }

  /* ---------- clip maker (Brain Indicators): a vertical 1080x1920 replay video of an indicator for TikTok / Reels ----------
     The script runs on real candles (/api/preview with timeline), then the chart replays the last bars one by one:
     a drawing appears only once it existed (born / moved / died from the runner), nothing after the current bar is
     shown. Recorded in the browser (canvas + MediaRecorder), never uploaded anywhere. Labelled as a Brain replay. */
  var CLIP_W = 1080, CLIP_H = 1920, CLIP_TOP = 300, CLIP_CH = 1300, CLIP_FPS = 30;
  function clipSupported() { return !!(PREVIEW && window.NexusChart && window.MediaRecorder && window.HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream); }
  function clipMime() {
    var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {} }
    return '';
  }
  function clipWrap(ctx, text, maxW, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) { var tryL = cur ? cur + ' ' + w : w; if (ctx.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
    return lines;
  }
  function clipText(ctx, text, x, y, font, color, align) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = /[؀-ۿ]/.test(String(text)) ? 'rtl' : 'ltr';
    ctx.fillText(text, x, y); ctx.direction = 'ltr';
  }
  // The script's dashboard (first table) drawn on the canvas for the end card.
  function clipTable(ctx, tb, cx, top, maxW) {
    if (!tb || !tb.cells) return 0;
    var rows = tb.rows || 0, cols = tb.columns || 0, fs = 30, pad = 16, rh = fs + 22, widths = [], used = [], r, c, cell;
    ctx.font = '600 ' + fs + 'px ui-monospace,Menlo,Consolas,monospace';
    for (r = 0; r < rows; r++) {
      var any = false;
      for (c = 0; c < cols; c++) { cell = tb.cells[c + ':' + r]; if (cell && String(cell.text || '').trim()) { any = true; widths[c] = Math.max(widths[c] || 0, ctx.measureText(String(cell.text)).width + pad * 2); } }
      if (any) used.push(r);
    }
    if (!used.length) return 0;
    var total = 0; for (c = 0; c < cols; c++) total += widths[c] || 0;
    var k = total > maxW ? maxW / total : 1, x0 = cx - total * k / 2, h = rh * Math.max(0.7, k);
    used.forEach(function (row, i) {
      var x = x0, y = top + i * h;
      for (c = 0; c < cols; c++) {
        var w = (widths[c] || 0) * k; cell = tb.cells[c + ':' + row];
        ctx.fillStyle = (cell && cell.bgcolor) || tb.bgcolor || 'rgba(19,23,34,.92)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
        if (cell && cell.text) {
          var al = cell.text_halign === 'text.align_left' ? 'left' : cell.text_halign === 'text.align_right' ? 'right' : 'center';
          ctx.font = '600 ' + Math.round(fs * k) + 'px ui-monospace,Menlo,Consolas,monospace'; ctx.fillStyle = cell.text_color || '#d1d4dc'; ctx.textBaseline = 'middle'; ctx.textAlign = al;
          ctx.fillText(String(cell.text), al === 'left' ? x + pad * k : al === 'right' ? x + w - pad * k : x + w / 2, y + h / 2);
        }
        x += w;
      }
    });
    return used.length * h;
  }
  function clipFrame(ctx, o, chartCv, p, endT) {
    var g = ctx.createLinearGradient(0, 0, 0, CLIP_H); g.addColorStop(0, '#0b1220'); g.addColorStop(1, '#05070b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CLIP_W, CLIP_H);
    // header: brand pill + hook
    ctx.fillStyle = 'rgba(0,229,160,.14)'; ctx.strokeStyle = 'rgba(0,229,160,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(CLIP_W / 2 - 150, 34, 300, 56, 28); else ctx.rect(CLIP_W / 2 - 150, 34, 300, 56); ctx.fill(); ctx.stroke();
    clipText(ctx, o.brand, CLIP_W / 2, 63, '700 28px Inter,system-ui,sans-serif', '#7dffd0');
    ctx.font = '800 62px Inter,system-ui,sans-serif';
    clipWrap(ctx, o.hook, CLIP_W - 100, 2).forEach(function (ln, i, arr) { clipText(ctx, ln, CLIP_W / 2, (arr.length > 1 ? 160 : 190) + i * 76, '800 62px Inter,system-ui,sans-serif', '#ffffff'); });
    // chart
    ctx.drawImage(chartCv, 0, CLIP_TOP, CLIP_W, CLIP_CH);
    clipText(ctx, o.sim, 150, CLIP_TOP + 30, '500 22px Inter,system-ui,sans-serif', 'rgba(255,255,255,.45)');
    // progress
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, CLIP_TOP + CLIP_CH, CLIP_W, 6);
    ctx.fillStyle = '#00e5a0'; ctx.fillRect(0, CLIP_TOP + CLIP_CH, CLIP_W * Math.min(1, p), 6);
    // footer
    clipText(ctx, o.title, CLIP_W / 2, 1666, '800 46px Inter,system-ui,sans-serif', '#00e5a0');
    clipText(ctx, o.market, CLIP_W / 2, 1728, '600 32px Inter,system-ui,sans-serif', '#aab4c3');
    if (o.handle) clipText(ctx, o.handle, CLIP_W / 2, 1790, '700 36px Inter,system-ui,sans-serif', '#ffffff');
    clipText(ctx, o.disc, CLIP_W / 2, 1860, '500 23px Inter,system-ui,sans-serif', 'rgba(255,255,255,.5)');
    // end card: the dashboard + call to action over a dimmed chart
    if (endT > 0) {
      var a = Math.min(1, endT / 0.4);
      ctx.fillStyle = 'rgba(5,7,11,' + (0.72 * a) + ')'; ctx.fillRect(0, CLIP_TOP, CLIP_W, CLIP_CH);
      ctx.globalAlpha = a;
      var h = clipTable(ctx, o.table, CLIP_W / 2, CLIP_TOP + 170, CLIP_W - 120);
      var y = Math.min(CLIP_TOP + 170 + h + 120, CLIP_TOP + CLIP_CH - 160);
      clipText(ctx, o.cta, CLIP_W / 2, y, '800 54px Inter,system-ui,sans-serif', '#ffffff');
      if (o.handle) clipText(ctx, o.handle, CLIP_W / 2, y + 80, '700 44px Inter,system-ui,sans-serif', '#00e5a0');
      ctx.globalAlpha = 1;
    }
  }
  var CLIP = { run: null };
  function clipModal() {
    var m = $('clipModal'); if (m) return m;
    m = el('div', 'modal'); m.id = 'clipModal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'clipTitle');
    m.innerHTML = '<div class="mcard"><div class="mhead"><b id="clipTitle"></b><button class="btn2 close" type="button" data-close="1" aria-label="close">✕</button></div>' +
      '<div class="mbody clipbody"><p class="mlead" id="clipLead"></p>' +
      '<div class="cliprow"><label id="clipSymL" for="clipSym"></label><select id="clipSym" class="pv-sel"></select></div>' +
      '<div class="cliprow"><span id="clipTfL" class="lb"></span><div id="clipTfs" class="pv-tfs"></div></div>' +
      '<div class="cliprow"><label id="clipDurL" for="clipDur"></label><select id="clipDur" class="pv-sel"><option value="15">15s</option><option value="25" selected>25s</option><option value="35">35s</option></select></div>' +
      '<div class="cliprow"><label id="clipHookL" for="clipHook"></label><input id="clipHook" class="libq" maxlength="90"></div>' +
      '<div class="cliprow"><label id="clipHandleL" for="clipHandle"></label><input id="clipHandle" class="libq" maxlength="60"></div>' +
      '<div class="clipstage"><canvas id="clipCv" width="1080" height="1920"></canvas><video id="clipVid" controls playsinline></video></div>' +
      '<p class="clipst" id="clipSt" role="status"></p></div>' +
      '<div class="mfoot"><button class="btn2" type="button" id="clipShare"></button><a class="btn2" id="clipDl" download></a><button class="btn2 pri" type="button" id="clipGo"></button></div></div>';
    document.body.appendChild(m);
    return m;
  }
  function openClip(msg) {
    if (busy) { toast(t('wait_busy')); return; }
    clipModal();
    var pref = pvPrefs();
    $('clipTitle').textContent = t('clip_title'); $('clipLead').textContent = t('clip_lead');
    $('clipSymL').textContent = t('pv_sym'); $('clipTfL').textContent = t('clip_tf'); $('clipDurL').textContent = t('clip_dur');
    $('clipHookL').textContent = t('clip_hook'); $('clipHandleL').textContent = t('clip_handle');
    var sym = $('clipSym'), tfs = $('clipTfs'); sym.innerHTML = ''; tfs.innerHTML = '';
    PV_SYMS.forEach(function (s) { var o = el('option', '', s[1]); o.value = s[0]; if (s[0] === pref.symbol) o.selected = true; sym.appendChild(o); });
    var tf = pref.tf;
    PV_TFS.forEach(function (x) { var b = el('button', 'pv-tf' + (x[0] === tf ? ' on' : ''), x[1]); b.type = 'button'; b.onclick = function () { tf = x[0]; tfs.querySelectorAll('button').forEach(function (y) { y.classList.toggle('on', y === b); }); }; tfs.appendChild(b); });
    var name = msg.title || (msg.file || 'Indicator').replace(/\.pine$/i, '').replace(/_/g, ' ');
    $('clipHook').value = t('clip_hook_def', { x: name });
    var handle = ''; try { handle = localStorage.getItem('nx_clip_handle') || ''; } catch (e) {}
    $('clipHandle').value = handle; $('clipHandle').placeholder = t('clip_handle_ph');
    var cv = $('clipCv'), vid = $('clipVid'), go = $('clipGo');
    cv.style.display = ''; vid.style.display = 'none'; $('clipDl').style.display = 'none'; $('clipShare').style.display = 'none'; $('clipSt').textContent = '';
    var c0 = cv.getContext('2d'); c0.fillStyle = '#05070b'; c0.fillRect(0, 0, CLIP_W, CLIP_H);
    go.textContent = t('clip_go'); go.disabled = false;
    go.onclick = function () {
      var h = $('clipHandle').value.trim(); try { localStorage.setItem('nx_clip_handle', h); } catch (e) {}
      recordClip(msg, { symbol: sym.value, tf: tf, dur: +$('clipDur').value || 25, hook: $('clipHook').value.trim() || name, handle: h, name: name });
    };
    openModal('clipModal');
  }
  function recordClip(msg, opt) {
    var cv = $('clipCv'), vid = $('clipVid'), dl = $('clipDl'), sh = $('clipShare'), go = $('clipGo'), st = $('clipSt'), m = $('clipModal');
    var mime = clipMime();
    if (!mime) { st.textContent = t('clip_unsupported'); return; }
    go.disabled = true; st.textContent = t('clip_loading'); cv.style.display = ''; vid.style.display = 'none'; dl.style.display = 'none'; sh.style.display = 'none';
    var run = CLIP.run = {};
    fetch(PREVIEW, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: msg.code, symbol: opt.symbol, tf: opt.tf, timeline: true }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (CLIP.run !== run) return;
        if (!d || !d.ok || !Array.isArray(d.candles) || !d.result || !d.result.ok) throw new Error((d && d.result && d.result.error) || (d && d.message) || 'error');
        if (d.sample) throw new Error(t('clip_sample'));
        PV_TFS.forEach(function (x) { if (x[0] === d.tf) d.tfName = x[1]; });
        var host = el('div'); host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + CLIP_W / 2 + 'px;height:' + CLIP_CH / 2 + 'px;';
        document.body.appendChild(host);
        var chart = window.NexusChart.create(host, d, { dpr: 2 });
        var n = d.candles.length, from = d.result.timelineFrom != null ? d.result.timelineFrom : Math.max(0, n - 220);
        var playS = Math.max(6, opt.dur - 4), bars = Math.max(30, Math.min(n - 1 - from, Math.round(playS * 4.5))), start = n - 1 - bars;
        var o = { brand: 'NEXUS · BRAIN', hook: opt.hook, title: opt.name, market: (d.label || d.symbol) + ' · ' + (d.tfName || d.tf), handle: opt.handle, sim: t('clip_sim'), disc: t('clip_disc'), cta: t('clip_cta'), table: (d.result.tables || [])[0] };
        var ctx = cv.getContext('2d'), stream = cv.captureStream(CLIP_FPS), chunks = [];
        var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        var introS = 1, endS = 3, total = introS + playS + endS, t0 = 0, stopped = false;
        function finish(ok) {
          if (stopped) return; stopped = true;
          try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
          try { chart.destroy(); } catch (e) {} host.remove(); go.disabled = false;
          if (!ok) { st.textContent = t('clip_cancel'); CLIP.run = null; }
        }
        rec.onstop = function () {
          if (CLIP.run !== run || !chunks.length) return;
          var type = mime.split(';')[0], blob = new Blob(chunks, { type: type }), url = URL.createObjectURL(blob);
          var ext = /mp4/.test(type) ? 'mp4' : 'webm', file = (opt.name + '_' + (d.symbol || '') + '_' + (d.tfName || d.tf)).replace(/[^\w؀-ۿ-]+/g, '_') + '.' + ext;
          vid.src = url; vid.style.display = ''; cv.style.display = 'none';
          dl.href = url; dl.download = file; dl.textContent = t('clip_dl'); dl.style.display = '';
          st.textContent = t('clip_done', { s: Math.round(blob.size / 1e5) / 10, f: ext.toUpperCase() }) + (ext === 'webm' ? ' ' + t('clip_webm') : '');
          var f = null; try { f = new File([blob], file, { type: type }); } catch (e) {}
          if (f && navigator.canShare && navigator.canShare({ files: [f] })) { sh.textContent = t('clip_share'); sh.style.display = ''; sh.onclick = function () { navigator.share({ files: [f], title: opt.name }).catch(function () {}); }; }
          go.textContent = t('clip_again');
        };
        function tick() {
          if (stopped) return;
          if (!m.classList.contains('on') || CLIP.run !== run) { finish(false); return; }
          var sec = (performance.now() - t0) / 1000, f;
          if (sec < introS) f = start; else f = Math.min(n - 1, start + Math.floor((sec - introS) / playS * bars));
          clipFrame(ctx, o, chart.renderFrame(f, 70, 14), Math.min(1, sec / total), sec - introS - playS);
          st.textContent = t('clip_rec', { s: Math.max(0, Math.ceil(total - sec)) });
          if (sec >= total) { finish(true); return; }
          setTimeout(tick, 1000 / CLIP_FPS);
        }
        clipFrame(ctx, o, chart.renderFrame(start, 70, 14), 0, 0);
        rec.start(500); t0 = performance.now(); tick();
      })
      .catch(function (e) { if (CLIP.run !== run) return; go.disabled = false; st.textContent = t('clip_err') + ' ' + String(e && e.message || e).slice(0, 160); });
  }

  /* ---------- chart preview (Brain Indicators): candles + what the script draws, from /api/preview ---------- */
  var PV_SYMS = [['XAUUSD', 'Gold'], ['BTCUSD', 'BTC'], ['ETHUSD', 'ETH'], ['EURUSD', 'EUR/USD'], ['US100', 'NAS100'], ['US30', 'US30']];
  var PV_TFS = [['1', '1m'], ['5', '5m'], ['15', '15m'], ['60', '1H'], ['240', '4H'], ['1D', '1D']];
  var pvActive = null;
  function pvPrefs() { var p = { symbol: 'XAUUSD', tf: '15' }; try { var s = JSON.parse(localStorage.getItem('nx_pv') || 'null'); if (s && s.symbol) p.symbol = s.symbol; if (s && s.tf) p.tf = s.tf; } catch (e) {} return p; }
  function pvAutoLatest() { var all = thread.querySelectorAll('.pv'); var last = all[all.length - 1]; if (last && !last._loaded && last._load) last._load(); }
  function previewBlock(msg) {
    var box = el('div', 'pv'), top = el('div', 'pv-top'), sel = el('select', 'pv-sel'), tfs = el('div', 'pv-tfs'), stage = el('div', 'pv-stage'), note = el('div', 'pv-note');
    var pref = pvPrefs();
    top.appendChild(tx(el('span', 'pv-title'), 'pv_title'));
    PV_SYMS.forEach(function (s) { var o = el('option', '', s[1]); o.value = s[0]; if (s[0] === pref.symbol) o.selected = true; sel.appendChild(o); });
    sel.setAttribute('aria-label', t('pv_sym'));
    PV_TFS.forEach(function (x) { var b = el('button', 'pv-tf' + (x[0] === pref.tf ? ' on' : ''), x[1]); b.type = 'button'; b.setAttribute('data-tf', x[0]); tfs.appendChild(b); });
    top.appendChild(sel); top.appendChild(tfs); box.appendChild(top); box.appendChild(stage); box.appendChild(note);
    var chart = null, seq = 0;
    function showBtn() { stage.innerHTML = ''; var b = tx(el('button', 'btn2 pv-show'), 'pv_show'); b.type = 'button'; b.onclick = load; stage.appendChild(b); }
    function collapse() { if (chart) { try { chart.destroy(); } catch (e) {} chart = null; } box._loaded = false; showBtn(); }
    function save() { try { localStorage.setItem('nx_pv', JSON.stringify(pref)); } catch (e) {} }
    function load() {
      if (pvActive && pvActive !== collapse) pvActive();
      pvActive = collapse; box._loaded = true;
      var my = ++seq;
      stage.innerHTML = ''; stage.appendChild(el('div', 'pv-wait', t('pv_loading'))); note.textContent = '';
      fetch(PREVIEW, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: msg.code, symbol: pref.symbol, tf: pref.tf }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (my !== seq) return;
          if (!d || !d.ok || !Array.isArray(d.candles)) throw new Error((d && d.message) || 'error');
          var holder = el('div', 'pv-chart'); stage.innerHTML = ''; stage.appendChild(holder);
          PV_TFS.forEach(function (x) { if (x[0] === d.tf) d.tfName = x[1]; });
          if (chart) { try { chart.destroy(); } catch (e) {} }
          chart = window.NexusChart.create(holder, d);
          var res = d.result || {}, bits = [];
          if (d.sample) bits.push('<span class="err">' + esc(t('pv_sample')) + '</span>');
          if (!res.ok && res.error) bits.push('<span class="err">' + esc(t('pv_err') + res.error + (res.errorLine ? ' (line ' + res.errorLine + ')' : '')) + '</span>');
          if (res.unsupported && res.unsupported.length) bits.push(esc(t('pv_unsup') + res.unsupported.join(', ')));
          if (res.stats) bits.push(esc((L ? 'Trades: ' : 'صفقات: ') + res.stats.closed + (res.stats.closed ? ' · ' + (L ? 'win rate ' : 'نسبة الربح ') + Math.round(100 * res.stats.wins / res.stats.closed) + '%' : '')));
          bits.push(esc(t('pv_note') + (d.source && !d.sample ? ' · ' + t('pv_src') + d.source : '')));
          bits.push(esc(t('pv_hint')));
          note.innerHTML = bits.join('<br>');
        })
        .catch(function (e) { if (my !== seq) return; box._loaded = false; showBtn(); note.innerHTML = '<span class="err">' + esc(t('pv_fail') + String(e && e.message || e)) + '</span>'; });
    }
    sel.onchange = function () { pref.symbol = sel.value; save(); load(); };
    tfs.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; pref.tf = b.getAttribute('data-tf'); save(); tfs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); load(); };
    box._load = load;
    showBtn();
    return box;
  }

  /* ---------- chart studio (Brain Indicators): show any indicator on the chart before using it, or draw an idea ---------- */
  var ST = { chart: null, drawings: [], tool: null, ind: '', code: {}, seq: 0, ready: false };
  var ST_BLANK = '//@version=6\nindicator("Chart", overlay = true)\nplot(close, "Close", display = display.none)\n';
  var ST_TOOLS = [['', '✋', 'st_t_move'], ['trend', '╱', 'st_t_trend'], ['hline', '―', 'st_t_hline'], ['zone', '▭', 'st_t_zone'], ['buy', '▲', 'st_t_buy'], ['sell', '▼', 'st_t_sell'], ['text', 'T', 'st_t_text']];
  function studioInit() {
    if (ST.ready) return; ST.ready = true;
    var pref = pvPrefs(), sym = $('stSym'), tfs = $('stTfs'), tools = $('stTools');
    ST.sym = pref.symbol; ST.tf = pref.tf;
    PV_SYMS.forEach(function (x) { var o = el('option', '', x[1]); o.value = x[0]; if (x[0] === ST.sym) o.selected = true; sym.appendChild(o); });
    PV_TFS.forEach(function (x) { var b = el('button', 'pv-tf' + (x[0] === ST.tf ? ' on' : ''), x[1]); b.type = 'button'; b.setAttribute('data-tf', x[0]); tfs.appendChild(b); });
    sym.onchange = function () { ST.sym = sym.value; studioLoad(); };
    tfs.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; ST.tf = b.getAttribute('data-tf'); tfs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); studioLoad(); };
    ST_TOOLS.forEach(function (x) {
      var b = el('button', 'st-tool' + (x[0] === '' ? ' on' : '')); b.type = 'button'; b.setAttribute('data-st', x[0]);
      b.innerHTML = '<span class="g" aria-hidden="true">' + esc(x[1]) + '</span><span class="l">' + esc(t(x[2])) + '</span>'; b.title = t(x[2]); b.setAttribute('aria-label', t(x[2]));
      b.onclick = function () { ST.tool = x[0] || null; tools.querySelectorAll('[data-st]').forEach(function (y) { y.classList.toggle('on', y === b); }); if (ST.chart) ST.chart.setTool(ST.tool); };
      tools.appendChild(b);
    });
    var bu = el('button', 'st-tool', '↶ ' + t('st_undo')); bu.type = 'button'; bu.onclick = function () { if (ST.chart) ST.chart.undo(); else ST.drawings.pop(); };
    var bc = el('button', 'st-tool', '🗑 ' + t('st_clear')); bc.type = 'button'; bc.onclick = function () { if (ST.chart) ST.chart.clearDrawings(); else ST.drawings.length = 0; };
    tools.appendChild(bu); tools.appendChild(bc);
    $('stInd').onchange = function () { ST.ind = $('stInd').value; studioLoad(); };
    $('stUse').onclick = function () { var id = ST.ind; if (!id || id === 'cur') return; closeModals(); if (id.indexOf('lib:') === 0) libOpen(id.slice(4)); else useTemplate(id); };
    $('stBuild').onclick = studioBuild;
  }
  function studioIndOptions() {
    var s = $('stInd'), keep = ST.ind; s.innerHTML = '';
    var add = function (v, label) { var o = el('option', '', label); o.value = v; s.appendChild(o); };
    add('', t('st_none'));
    if (S.cur && S.cur.code) add('cur', t('st_cur', { x: S.cur.file || 'script' }));
    TPL.forEach(function (tp) { add(tp.id, tp.title[L ? 'en' : 'ar']); });
    if (libItems.length) {
      var g = el('optgroup'); g.label = t('st_saved');
      libItems.forEach(function (it) { var o = el('option', '', String(it.name || it.file)); o.value = 'lib:' + it.id; g.appendChild(o); });
      s.appendChild(g);
    }
    if (keep && [].some.call(s.options, function (o) { return o.value === keep; })) s.value = keep; else { ST.ind = ''; s.value = ''; }
  }
  function openStudio(ind) {
    if (!PREVIEW || !window.NexusChart) { toast(t('lib_err'), 3000); return; }
    openModal('studioModal'); studioInit();
    if (ind) ST.ind = ind;
    studioIndOptions(); studioLoad();
    // The saved indicators join the list as soon as the library answers (it may not be loaded yet).
    if (LIB && syncKey && !libItems.length) libCall('GET').then(function (j) { libItems = Array.isArray(j.items) ? j.items : []; if (libItems.length) studioIndOptions(); }).catch(function () {});
  }
  function studioCode(cb) {
    var id = ST.ind;
    if (!id) return cb(ST_BLANK);
    if (id === 'cur') return cb(S.cur && S.cur.code ? S.cur.code : ST_BLANK);
    if (ST.code[id]) return cb(ST.code[id]);
    if (id.indexOf('lib:') === 0) {
      return libCall('GET', '?id=' + encodeURIComponent(id.slice(4))).then(function (j) { if (!j.item || !j.item.code) throw new Error('library'); ST.code[id] = j.item.code; cb(j.item.code); }).catch(function (e) { cb(null, e); });
    }
    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 2, mode: 'template', templateId: id, lang: L ? 'en' : 'ar' }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.code) throw new Error((j && j.message) || 'template'); ST.code[id] = j.code; cb(j.code); })
      .catch(function (e) { cb(null, e); });
  }
  function studioLoad() {
    var stage = $('stStage'), note = $('stNote'), my = ++ST.seq;
    $('stUse').style.display = ST.ind && ST.ind !== 'cur' ? '' : 'none';
    try { localStorage.setItem('nx_pv', JSON.stringify({ symbol: ST.sym, tf: ST.tf })); } catch (e) {}
    if (ST.chart) { try { ST.chart.destroy(); } catch (e) {} ST.chart = null; }
    stage.innerHTML = ''; stage.appendChild(el('div', 'pv-wait', t('pv_loading'))); note.textContent = '';
    studioCode(function (code, err) {
      if (my !== ST.seq) return;
      if (!code) { stage.innerHTML = ''; note.innerHTML = '<span class="err">' + esc(t('pv_fail') + String(err && err.message || err)) + '</span>'; return; }
      fetch(PREVIEW, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code, symbol: ST.sym, tf: ST.tf }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (my !== ST.seq) return;
          if (!d || !d.ok || !Array.isArray(d.candles)) throw new Error((d && d.message) || 'error');
          PV_TFS.forEach(function (x) { if (x[0] === d.tf) d.tfName = x[1]; });
          var holder = el('div', 'pv-chart'); stage.innerHTML = ''; stage.appendChild(holder);
          ST.chart = window.NexusChart.create(holder, d, { drawings: ST.drawings, askText: function () { return window.prompt(t('st_text_ask')); } });
          ST.chart.setTool(ST.tool);
          var res = d.result || {}, bits = [];
          if (d.sample) bits.push('<span class="err">' + esc(t('pv_sample')) + '</span>');
          if (ST.ind && !res.ok && res.error) bits.push('<span class="err">' + esc(t('pv_err') + res.error) + '</span>');
          if (ST.ind && res.unsupported && res.unsupported.length) bits.push(esc(t('pv_unsup') + res.unsupported.join(', ')));
          bits.push(esc(t('st_hint')));
          note.innerHTML = bits.join('<br>');
        })
        .catch(function (e) { if (my !== ST.seq) return; stage.innerHTML = ''; note.innerHTML = '<span class="err">' + esc(t('pv_fail') + String(e && e.message || e)) + '</span>'; });
    });
  }
  // Chart picture for the bot: the canvas scaled down to 1280 px wide, as JPEG.
  function studioShot() {
    var src = ST.chart.snapshot(), cv = ST.chart.cv, w = Math.min(1280, cv.width), h = Math.round(cv.height * w / cv.width);
    if (w === cv.width) return src.split(',')[1];
    var c2 = document.createElement('canvas'); c2.width = w; c2.height = h; c2.getContext('2d').drawImage(cv, 0, 0, w, h);
    return c2.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
  function studioIndName() { var o = $('stInd').selectedOptions && $('stInd').selectedOptions[0]; return o ? o.textContent : tplTitle(ST.ind); }
  function studioBuild() {
    if (busy) { toast(t('wait_busy')); return; }
    if (!ST.chart) { toast(t('pv_loading')); return; }
    var ask = String($('stAsk').value || '').trim(), lines = ST.chart.describe();
    if (!ask && !lines.length) { toast(t('st_need'), 3200); return; }
    var symName = ST.sym, tfName = ST.tf;
    PV_SYMS.forEach(function (x) { if (x[0] === ST.sym) symName = x[1]; }); PV_TFS.forEach(function (x) { if (x[0] === ST.tf) tfName = x[1]; });
    var text = (ask || t('st_default_ask')) + (lines.length ? '\n\n' + t('st_drawn', { sym: symName, tf: tfName }) + '\n- ' + lines.join('\n- ') : '') +
      (ST.ind && ST.ind !== 'cur' ? '\n' + t('st_on_ind', { x: studioIndName() }) : '') + '\n' + t('st_rule');
    var b64 = null; try { b64 = studioShot(); } catch (e) {}
    var atts = b64 ? [{ kind: 'image', media_type: 'image/jpeg', data: b64, name: 'chart.jpg', preview: 'data:image/jpeg;base64,' + b64 }] : [];
    if (ST.ind !== 'cur' && S.cur) { S.cur = null; save(); refreshCurrent(); }
    closeModals(); $('stAsk').value = '';
    send(text, atts);
  }

  function renderAll() {
    thread.innerHTML = ''; arts = [];
    if (!S.msgs.length) { thread.innerHTML = introHtml; i18nDom(thread); buildIntro(); refreshCurrent(); return; }
    S.msgs.forEach(function (m) {
      // One unreadable message must not hide the rest of the conversation.
      try {
        if (m.r === 'u') addUser(m.text + (m.imgs ? '  📎' + (m.imgs > 1 ? '×' + m.imgs : '') : ''));
        else { var col = addShell(); if (m.kind === 'script' && m.code && !m.forgot) renderScript(col, m); else addBubble(col, m.explain || '…', m.forgot || m.forget ? 'forgot' : ''); }
      } catch (e) {}
    });
    // A request that never got its reply (reload, closed tab): say so and offer to send it again.
    var lastMsg = S.msgs[S.msgs.length - 1];
    if (lastMsg && lastMsg.r === 'u' && !busy) {
      renderNotice(addShell(), t('unfinished'), '', function () {
        var cur = S.cur && S.cur.code ? { code: S.cur.code, file: S.cur.file } : null;
        var go = function () { runModel({ v: 2, mode: 'build', lang: L ? 'en' : 'ar', messages: apiMessages(), code: cur ? cur.code : '', file: cur ? cur.file : undefined }, go); };
        go();
      });
    }
    refreshCurrent(); toBottom(true);
  }

  /* ---------- intro, drawer, context bar ---------- */
  function cardHtml(tp) {
    return '<span class="ti" aria-hidden="true">' + svgIcon(tp.icon) + '</span><span><b>' + esc(tp.title[L ? 'en' : 'ar']) + '</b><small>' + esc(tp.blurb[L ? 'en' : 'ar']) + '</small></span>';
  }
  function buildIntro() {
    var grid = $('tgrid'), sug = $('sug');
    if (grid) {
      grid.innerHTML = '';
      TPL.forEach(function (tp) {
        var b = el('button', 'tcard'); b.type = 'button'; b.innerHTML = cardHtml(tp);
        b.onclick = function () { useTemplate(tp.id); };
        grid.appendChild(b);
      });
    }
    if (sug) {
      sug.innerHTML = '';
      SUG.forEach(function (s) { var b = el('button', '', s[L]); b.type = 'button'; b.onclick = function () { if (busy) { toast(t('wait_busy')); return; } send(s[L], []); }; sug.appendChild(b); });
    }
  }
  // Template icons are trusted SVG markup generated at build time (build-ui.mjs); anything else is shown as text.
  function svgIcon(m) { return /^<(path|rect|circle)\b/.test(String(m || '')) ? '<svg viewBox="0 0 24 24">' + m + '</svg>' : esc(m); }
  function buildDrawer() {
    var box = $('dwTpl'); if (!box) return; box.innerHTML = '';
    TPL.forEach(function (tp) {
      var b = el('button'); b.type = 'button'; b.innerHTML = '<span class="em" aria-hidden="true">' + svgIcon(tp.icon) + '</span> <span>' + esc(tp.title[L ? 'en' : 'ar']) + '</span>';
      b.onclick = function () { closeDrawer(); useTemplate(tp.id); };
      box.appendChild(b);
    });
  }
  function buildQuick() {
    qe.innerHTML = '';
    [['q1', 'q1p'], ['q2', 'q2p'], ['q3', 'q3p']].forEach(function (q) {
      var b = tx(el('button', 'cx'), q[0]); b.type = 'button';
      b.onclick = function () { setDraft(t(q[1]), true); };
      qe.appendChild(b);
    });
  }
  function i18nDom(scope) {
    var yr = new Date().getFullYear();
    function vars(e) { var v = e.getAttribute('data-i18n-vars'); if (!v) return null; try { return JSON.parse(v); } catch (x) { return null; } }
    scope.querySelectorAll('[data-i18n]').forEach(function (e) { var k = e.getAttribute('data-i18n'); if (I18N[k]) e.textContent = t(k, vars(e)).replace('{yr}', yr); });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (e) { var k = e.getAttribute('data-i18n-html'); if (I18N[k]) e.innerHTML = t(k).replace('{yr}', yr); });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (e) { var k = e.getAttribute('data-i18n-title'); if (I18N[k]) e.title = t(k); });
    scope.querySelectorAll('[data-i18n-ph]').forEach(function (e) { var k = e.getAttribute('data-i18n-ph'); if (I18N[k]) e.placeholder = t(k); });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (e) { var k = e.getAttribute('data-i18n-aria'); if (I18N[k]) e.setAttribute('aria-label', t(k)); });
  }
  // A language switch updates the texts in place: the conversation, open boxes and typed text stay as they are.
  function applyLang() {
    root.lang = L ? 'en' : 'ar';
    root.dir = L ? 'ltr' : 'rtl';
    i18nDom(document);
    var lbl = L ? 'ع' : 'EN';
    ['langL', 'langA'].forEach(function (id) { var b = $(id); if (b) { b.textContent = lbl; b.title = t('t_lang'); b.setAttribute('aria-label', t('t_lang')); } });
    buildDrawer(); buildQuick(); renderLanding();
    if ($('intro')) buildIntro();
    refreshCurrent();
    if (mic) mic.setLang();
  }
  function renderLanding() {
    var g = $('lgrid'); if (!g) return; g.innerHTML = '';
    TPL.forEach(function (tp) {
      var b = el('button', 'tcard'); b.type = 'button'; b.innerHTML = cardHtml(tp);
      b.onclick = function () { launch(); useTemplate(tp.id); };
      g.appendChild(b);
    });
  }
  function toggleLang() { L = L ? 0 : 1; try { localStorage.setItem('nexus_lang', L ? 'en' : 'ar'); } catch (e) {} applyLang(); }
  function setStatus(key) { tx(stat, key); dot.className = key === 'st_live' ? 'dot live' : 'dot'; }

  /* ---------- drawer and dialogs ---------- */
  var returnFocus = null, downOnBackdrop = false;
  function setInert(list, on) { list.forEach(function (e) { if (e) { try { e.inert = on; } catch (x) {} } }); }
  function openDrawer() {
    returnFocus = document.activeElement;
    drawer.classList.add('on'); scrim.classList.add('on'); menuBtn.setAttribute('aria-expanded', 'true');
    setInert([wrap, composer], true);
    var first = drawer.querySelector('button'); if (first && !coarse()) first.focus();
  }
  function closeDrawer(keepFocus) {
    if (!drawer.classList.contains('on')) return;
    drawer.classList.remove('on'); scrim.classList.remove('on'); menuBtn.setAttribute('aria-expanded', 'false');
    setInert([wrap, composer], false);
    if (!keepFocus && returnFocus && returnFocus.focus) { try { returnFocus.focus(); } catch (e) {} }
    returnFocus = null;
  }
  function openModal(id) {
    var m = $(id); if (!m) return;
    // Focus goes back to where the dialog was opened from (the menu button when that was a drawer entry).
    if (!document.querySelector('.modal.on')) { var from = document.activeElement; returnFocus = from && drawer.contains(from) ? menuBtn : from; }
    m.classList.add('on');
    // Everything behind the dialog is out of reach of the keyboard and of screen readers while it is open.
    setInert([header, drawer, wrap, composer], true);
    var target = m.querySelector('textarea') || m.querySelector('button');
    if (target) setTimeout(function () { try { target.focus(); } catch (e) {} }, 30);
  }
  function closeModals() {
    var open = document.querySelectorAll('.modal.on'); if (!open.length) return;
    open.forEach(function (m) { m.classList.remove('on'); });
    setInert([header, drawer, wrap, composer], false);
    if (returnFocus && returnFocus.focus && document.contains(returnFocus)) { try { returnFocus.focus(); } catch (e) {} }
    returnFocus = null;
  }

  /* ---------- attachments ---------- */
  var afterPick = null, pdfLoading = 0;
  function pickFile(accept, then) { afterPick = then || null; fileInput.accept = accept || 'image/*,video/*,.pine,.txt,.pdf'; fileInput.value = ''; fileInput.click(); }
  function handleFile(f) {
    if (!f) return false;
    var name = String(f.name || ''), isImg = /^image\//.test(f.type), isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(name);
    var isVid = !isImg && (/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(name));
    var isText = !isImg && !isPdf && !isVid && (/^text\//.test(f.type) || /\.(pine|txt|md|csv|json)$/i.test(name));
    if (!isImg && !isPdf && !isText && !isVid) { toast(t('badtype'), 3500); return false; }
    if (isVid && f.size > 200 * 1024 * 1024) { toast(t('vid_big'), 3500); return false; }
    if (pending.length + loading >= 3) { toast(t('att_max'), 3000); return false; }
    if (isPdf && (pdfLoading || pending.some(function (p) { return p.kind === 'document'; }))) { toast(t('one_pdf'), 3000); return false; }
    // Limits match the server: a PDF travels as base64 inside the request, text files are clipped to the first 60,000 characters.
    if (isPdf && f.size > 1100000) { toast(t('big_pdf'), 3500); return false; }
    if (isText && f.size > 2 * 1024 * 1024) { toast(t('big'), 3500); return false; }
    if (isImg && f.size > 30 * 1024 * 1024) { toast(t('big'), 3500); return false; }
    loading++; if (isPdf) pdfLoading++; renderChips();
    var settled = false, g = gen;
    function done(item) { if (settled) return; settled = true; loading = Math.max(0, loading - 1); if (isPdf) pdfLoading = Math.max(0, pdfLoading - 1); if (item && g === gen) pending.push(item); renderChips(); }
    function fail() { toast(t('noimg'), 3000); done(null); }
    if (isVid) videoFrames(f, function (item) { item.name = name; done(item); }, function () { toast(t('vid_fail'), 4000); done(null); });
    else if (isImg) resizeImage(f, 1280, function (b64) { done({ kind: 'image', media_type: 'image/jpeg', data: b64, name: name, preview: 'data:image/jpeg;base64,' + b64 }); }, fail);
    else {
      var r = new FileReader();
      r.onerror = fail;
      if (isPdf) { r.onload = function () { var b64 = String(r.result).split(',')[1] || ''; if (b64) done({ kind: 'document', media_type: 'application/pdf', data: b64, name: name }); else fail(); }; r.readAsDataURL(f); }
      else { r.onload = function () { done({ kind: 'text', name: name.replace(/["\n\r]/g, '_').slice(0, 80), text: String(r.result).slice(0, 60000) }); }; r.readAsText(f); }
    }
    return true;
  }
  // A short video (the first 10 seconds) becomes 8 evenly spaced frames: the model reads them in order as one recording.
  function videoFrames(f, cb, fail) {
    var v = document.createElement('video'), url = URL.createObjectURL(f), frames = [], times = [], k = 0, over = false, timer;
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.crossOrigin = 'anonymous';
    function end(ok) { clearTimeout(timer); try { URL.revokeObjectURL(url); } catch (e) {} v.removeAttribute('src'); try { v.load(); } catch (e) {} if (ok) { if (over) toast(t('vid_long'), 3500); cb({ kind: 'video', frames: frames, times: times, dur: Math.min(10, isFinite(v.duration) ? v.duration : 10), preview: 'data:image/jpeg;base64,' + frames[0] }); } else fail(); }
    timer = setTimeout(function () { if (frames.length >= 2) end(true); else end(false); }, 25000);
    function grab() {
      try {
        var s = Math.min(1, 960 / Math.max(v.videoWidth || 1, v.videoHeight || 1)), c = el('canvas');
        c.width = Math.max(1, Math.round((v.videoWidth || 640) * s)); c.height = Math.max(1, Math.round((v.videoHeight || 360) * s));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        var b = c.toDataURL('image/jpeg', 0.72).split(',')[1] || '';
        if (b && b.length < 900000) { frames.push(b); times.push(Math.round(v.currentTime * 10) / 10); }
      } catch (e) {}
    }
    var plan = [];
    v.onloadedmetadata = function () {
      var d = isFinite(v.duration) && v.duration > 0 ? v.duration : 10; over = d > 10.5; d = Math.min(10, d);
      for (var i = 0; i < 8; i++) plan.push(Math.min(d - 0.05, Math.max(0.05, d * (i + 0.5) / 8)));
    };
    v.onloadeddata = function () { if (!plan.length) return end(false); v.currentTime = plan[0]; };
    v.onseeked = function () { grab(); k++; if (k < plan.length) v.currentTime = plan[k]; else end(frames.length > 0); };
    v.onerror = function () { end(false); };
    v.src = url;
  }
  function resizeImage(f, maxDim, cb, fail) {
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      try {
        var s = Math.min(1, maxDim / Math.max(img.width, img.height)), c = el('canvas'), q = 0.82, out;
        c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        do { out = c.toDataURL('image/jpeg', q).split(',')[1] || ''; q -= 0.2; } while (out.length > 1900000 && q > 0.2);
        URL.revokeObjectURL(url);
        if (!out || out.length > 1900000) return fail();
        cb(out);
      } catch (e) { try { URL.revokeObjectURL(url); } catch (x) {} fail(); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); fail(); };
    img.src = url;
  }
  function renderChips() {
    chipsEl.innerHTML = '';
    pending.forEach(function (p, i) {
      var c = el('div', 'chip');
      if (p.kind === 'image' || p.kind === 'video') { var im = el('img'); im.alt = ''; im.src = p.preview; c.appendChild(im); if (p.kind === 'video') c.appendChild(el('span', 'nm', t('vid_tag') + ' ' + Math.round(p.dur || 10) + 's')); } else { var ic = el('span', '', p.kind === 'document' ? '📄' : '📝'); ic.setAttribute('aria-hidden', 'true'); c.appendChild(ic); }
      c.appendChild(el('span', 'nm', p.name || t('attach')));
      var x = el('button', 'x', '✕'); x.type = 'button'; x.setAttribute('data-i18n-aria', 't_remove'); x.setAttribute('aria-label', t('t_remove'));
      x.onclick = function () { pending.splice(i, 1); renderChips(); input.focus(); };
      c.appendChild(x); chipsEl.appendChild(c);
    });
    for (var n = 0; n < loading; n++) { var w = el('div', 'chip load'); var s = el('span', 'spin'); s.setAttribute('aria-hidden', 'true'); w.appendChild(s); w.appendChild(el('span', 'nm', '…')); chipsEl.appendChild(w); }
  }

  /* ---------- network ---------- */
  function setBusy(on) {
    busy = on; if (on) busyAt = Date.now();
    var key = on ? 't_stop' : 't_send';
    sendBtn.classList.toggle('stop', on);
    sendBtn.setAttribute('data-i18n-title', key); sendBtn.setAttribute('data-i18n-aria', key);
    sendBtn.title = t(key); sendBtn.setAttribute('aria-label', t(key));
    sendBtn.firstChild.textContent = on ? '■' : '➤';
  }
  function stopRequest() { if (ctl) { try { ctl.abort(); } catch (e) {} } }
  // The bot only sees the conversation after the last "delete from memory": a deleted indicator and the asks that
  // produced it never come back into a new build.
  function apiMessages() {
    var out = [], from = 0;
    S.msgs.forEach(function (m, i) { if (m.forget) from = i + 1; });
    S.msgs.slice(from).forEach(function (m) {
      if (m.forgot) return;
      if (m.r === 'u') out.push({ role: 'user', content: String(m.api || m.text || '(attachment)').slice(0, 6000) });
      else if (m.kind === 'script') out.push({ role: 'assistant', content: String(m.explain || '').slice(0, 3000) + '\n[script delivered: ' + (m.file || 'script.pine') + ']' });
      else if (m.kind === 'text') out.push({ role: 'assistant', content: String(m.explain || '').slice(0, 3000) });
    });
    return out.slice(-30);
  }
  function httpError(status) { var e = new Error('http ' + status); e.status = status; return e; }
  function errText(e) {
    if (e && e.idle) return t('e_idle');
    var s = e && e.status;
    if (s === 413) return t('e_toolarge');
    if (s === 429) return t('e_rate');
    if (s >= 500) return t('e_server');
    if (s >= 400) return t('e_refused');
    return t('e_conn');
  }
  // Sends one request. onEvent receives NDJSON events; resolves with { json } for JSON replies, { legacy } for old engines.
  async function call(body, onEvent) {
    var my = ctl = new AbortController();
    var last = Date.now(), started = Date.now(), reason = '';
    var guard = setInterval(function () {
      if (Date.now() - last > 75000 || Date.now() - started > 320000) { reason = 'idle'; try { my.abort(); } catch (e) {} }
    }, 3000);
    var ended = false;
    function feed(line) { line = line.trim(); if (!line) return; var ev; try { ev = JSON.parse(line); } catch (e) { return; } if (ev && typeof ev === 'object') { onEvent(ev); if (ev.t === 'final' || ev.t === 'error') ended = true; } }
    try {
      var hdr = { 'content-type': 'application/json' }; if (LIB && syncKey) hdr['x-brain-key'] = syncKey;
      var r = await fetch(ENDPOINT, { method: 'POST', headers: hdr, body: JSON.stringify(body), signal: my.signal });
      var ct = String(r.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') >= 0) {
        var j = null; try { j = await r.json(); } catch (e) { if (e && e.name === 'AbortError') throw e; }
        // Only the engine's own error objects carry a message for the user; any other failure is reported by status.
        var own = j && typeof j === 'object' && ((j.kind === 'error' && typeof j.message === 'string') || typeof j.reply === 'string');
        if (!r.ok && (!own || r.status === 413)) throw httpError(r.status);
        if (!j || typeof j !== 'object') throw httpError(r.status >= 400 ? r.status : 502);
        return { json: j };
      }
      if (!r.ok) throw httpError(r.status);
      var nd = ct.indexOf('ndjson') >= 0;
      // Anything else (for example a Wi-Fi sign-in page answering in HTML) is not a reply from the engine.
      if (!nd && ct.indexOf('text/plain') < 0) throw httpError(502);
      if (!r.body || !r.body.getReader) { var all = await r.text(); if (!nd) return { legacy: all }; all.split('\n').forEach(feed); return {}; }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', raw = '';
      for (;;) {
        var rd = await reader.read(); if (rd.done) break;
        last = Date.now();
        var chunk = dec.decode(rd.value, { stream: true });
        if (!nd) { raw += chunk; continue; }
        buf += chunk;
        var i; while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); }
        // The reply is complete once its last event arrived: do not wait for (or depend on) a clean close.
        if (ended) { try { reader.cancel(); } catch (e) {} return {}; }
      }
      if (nd) { if (buf.trim()) feed(buf); return {}; }
      return { legacy: raw };
    } catch (e) {
      if (ended) return {};
      if (reason === 'idle') { var er = new Error('idle'); er.idle = true; throw er; }
      throw e;
    } finally { clearInterval(guard); }
  }
  function legacyToFinal(text) {
    var m = /```(?:pine|pinescript)?[ \t]*\n([\s\S]*?)```/.exec(text || '');
    if (!m || !/\/\/@version=/.test(m[1])) return { kind: 'text', explain: String(text || '').trim() };
    var code = m[1], fm = /^\s*\/\/\s*FILE:\s*(.+?)\s*$/im.exec(code), file = 'nexus_indicator.pine';
    if (fm) { file = fm[1].trim(); code = code.replace(fm[0], '').replace(/^\n/, ''); }
    return { kind: 'script', code: code.replace(/\s+$/, '') + '\n', file: file, explain: text.replace(m[0], '').trim(), report: null };
  }

  /* ---------- "delete from memory": the bad indicator leaves the library AND the bot's memory ---------- */
  function forgetScript(msg) {
    if (busy) { toast(t('wait_busy')); return; }
    var lib = msg.libId, name = msg.title || msg.file || '';
    if (lib && LIB && syncKey) libCall('POST', '', { action: 'delete', id: lib }).then(function () { libItems = libItems.filter(function (x) { return x.id !== lib; }); }).catch(function () { toast(t('lib_err'), 3000); });
    msg.forgot = true; msg.code = ''; msg.libId = undefined; msg.explain = t('forget_card', { x: name });
    if (S.cur && (S.cur.id === msg.id || (lib && S.cur.libId === lib))) S.cur = null;
    S.msgs.push({ r: 'a', kind: 'text', explain: t('forget_note'), forget: true });
    save(); renderAll(); toast(t('forget_toast')); announce(t('forget_toast'));
  }
  // "احذف المؤشر من الذاكرة", "انسى هالمؤشر", "هاد مش منيح شيله", "delete it from memory", "forget this indicator".
  // Never an edit like "احذف الجدول من المؤشر" (remove the table from the indicator).
  function isForgetCmd(s) {
    s = String(s || '').trim();
    if (!s || s.length > 160) return false;
    if (/من\s*(ال)?(مؤشر|سكربت|سكريبت|كود)|from the (indicator|script|code)/i.test(s)) return false;
    var del = /(احذف|إحذف|حذف|امسح|إمسح|مسح|شيل|اشطب|delete|remove|erase|wipe)/i;
    var mem = /(ذاكر|ميموري|memory|المكتب|مكتبة|library|محفوظ|saved)/i;
    var forget = /(انس|إنس|انسا|forget)/i;
    var ind = /(مؤشر|indicator|script|سكربت|سكريبت|هاد|هذا|هيدا|هالـ?|this|\bit\b)/i;
    var bad = /((مش|مو|مب|ما)\s*(منيح|كويس|زابط|ظابط|نافع|حلو))|خربان|زبالة|سيء|\bbad\b|rubbish|garbage|not (good|working)/i;
    if (del.test(s) && mem.test(s)) return true;
    if (forget.test(s) && ind.test(s)) return true;
    return bad.test(s) && del.test(s) && ind.test(s);
  }
  function currentScriptMsg() {
    var i, m;
    if (S.cur) for (i = S.msgs.length - 1; i >= 0; i--) { m = S.msgs[i]; if (m.kind === 'script' && m.id === S.cur.id && !m.forgot) return m; }
    for (i = S.msgs.length - 1; i >= 0; i--) { m = S.msgs[i]; if (m.forget) return null; if (m.kind === 'script' && m.code && !m.forgot) return m; }
    return null;
  }

  // Shows a delivered script and only then stores it: data that cannot be rendered never reaches the saved conversation.
  function deliver(col, m) {
    var msg = cleanMsg({ r: 'a', kind: 'script', id: S.seq + 1, explain: m.explain, line: m.line, code: m.code, file: m.file, title: m.title, report: m.report, base: m.base, ms: m.ms, libId: m.libId });
    renderScript(col, msg);
    S.seq = msg.id; S.cur = { id: msg.id, code: msg.code, file: msg.file, libId: msg.libId };
    S.msgs.push(msg); save(); refreshCurrent();
    // Built by the model: saved automatically. An edit or a fix updates the indicator it came from.
    if (m.auto && LIB && syncKey) {
      var target = (msg.base === 'edit' || m.fix) && libIdOk(m.libTarget) ? m.libTarget : null;
      libSave(msg, target, function (ok, wasUpdate) { if (ok) toast(t(wasUpdate ? 'lib_updated' : 'lib_saved'), 2200); else toast(t('lib_save_fail'), 3000); });
    }
    announce(t('sr_done') + ' ' + (msg.line || (msg.report ? t(msg.report.verified ? 'b_ok' : msg.report.errorCount ? 'b_err' : 'b_warn', { n: msg.report.errorCount || Math.max(1, msg.report.warningCount + msg.report.unappliedEdits) }) : '')));
  }

  // Runs a model request (build or fix) and renders progress and the result. `retry` re-runs the same request.
  async function runModel(body, retry, libTarget) {
    clearRetries(); setBusy(true);
    var g = gen, col = addShell(), prog = new Progress(col), fin = null, err = null, stopped = false;
    try {
      var res = await call(body, function (ev) {
        if (ev.t === 'stage') prog.stage(ev);
        else if (ev.t === 'code') prog.code(ev.d);
        else if (ev.t === 'final') { fin = ev; if (typeof ev.remember === 'string' && ev.remember) setTimeout(function () { toast(t('pref_saved') + ' ' + ev.remember.slice(0, 120), 4000); }, 1200); }
        else if (ev.t === 'error') err = str(ev.message, 600) || t('e_empty');
      });
      if (res.json) {
        var j = res.json;
        if (j.kind === 'error' || typeof j.reply === 'string') err = str(j.message, 600) || str(j.reply, 600) || t('e_empty');
        else if (j.kind === 'script' || j.kind === 'text') fin = j;
      } else if (res.legacy != null) fin = legacyToFinal(res.legacy);
      if (!fin && !err) err = t('e_empty');
    } catch (e) {
      if (e && e.name === 'AbortError' && !e.idle) stopped = true; else err = errText(e);
    }
    var secs = prog.done();
    if (g !== gen) { setBusy(false); return; }
    try {
      if (stopped) renderNotice(col, t('stopped'), '', retry);
      else if (err) renderNotice(col, '⚠️ ' + err, 'err', retry);
      else if (fin.kind === 'script' && typeof fin.code === 'string' && fin.code.trim()) {
        deliver(col, { explain: fin.explain, line: fin.line, code: fin.code, file: fin.file || 'nexus_indicator.pine', title: fin.title, report: fin.report, base: fin.base, ms: num(fin.ms, 0) || secs * 1000, auto: true, fix: body.mode === 'fix', libTarget: libTarget });
      } else {
        var text = str(fin.explain, 20000).trim();
        if (!text) renderNotice(col, '⚠️ ' + t('e_empty'), 'err', retry);
        else { addBubble(col, text); S.msgs.push({ r: 'a', kind: 'text', explain: text }); save(); announce(text.slice(0, 300)); }
      }
      if (!stopped && !err) setStatus('st_live');
    } catch (e) {
      renderNotice(col, '⚠️ ' + t('e_empty'), 'err', retry);
    } finally { setBusy(false); toBottom(true); }
  }

  /* ---------- every conversation is kept: locally (last 15) and, on Brain with the owner key, on the server ---------- */
  var ARCH = STORE + '_archive', archTimer = null;
  function chatTitle(msgs) { for (var i = 0; i < msgs.length; i++) if (msgs[i].r === 'u' && msgs[i].text) return String(msgs[i].text).replace(/\s+/g, ' ').slice(0, 80); return '…'; }
  function readArchive() { try { var a = JSON.parse(localStorage.getItem(ARCH) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function archiveChat(now) {
    if (!S.msgs.length) return;
    var snap = JSON.parse(slimJson({ msgs: S.msgs.slice(-30), cur: S.cur ? { id: S.cur.id, file: S.cur.file, libId: S.cur.libId } : null, seq: S.seq, chatId: S.chatId }));
    var title = chatTitle(S.msgs), id = S.chatId;
    try {
      var a = readArchive().filter(function (c) { return c.id !== id; });
      a.unshift({ id: id, title: title, updated: Date.now(), data: snap });
      while (a.length) { try { localStorage.setItem(ARCH, JSON.stringify(a.slice(0, 15))); break; } catch (e) { a.pop(); if (a.length <= 1) break; } }
    } catch (e) {}
    if (CHATS && syncKey) {
      clearTimeout(archTimer);
      var go = function () { fetch(CHATS, { method: 'POST', headers: { 'content-type': 'application/json', 'x-brain-key': syncKey }, body: JSON.stringify({ action: 'save', id: id, title: title, data: snap }) }).catch(function () {}); };
      if (now) go(); else archTimer = setTimeout(go, 1500);
    }
  }
  function openChatData(id, data) {
    if (busy) { toast(t('wait_busy')); return; }
    archiveChat(true);
    stores().forEach(function (st) { try { st.setItem(STORE, JSON.stringify(data)); } catch (e) {} });
    S = { msgs: [], cur: null, seq: 0, chatId: id }; load(); S.chatId = id; closeModals(); renderAll(); pushSync(); toast(t('chat_opened'));
  }
  function openChats() {
    openModal('chatModal');
    var list = $('chatList'); list.innerHTML = ''; list.appendChild(tx(el('div', 'libnote'), 'lib_loading'));
    var local = readArchive();
    var show = function (items, remote) {
      list.innerHTML = '';
      if (!items.length) { list.appendChild(tx(el('div', 'libnote'), 'chat_empty')); return; }
      items.forEach(function (c) {
        var row = el('div', 'librow'), head = el('div', 'libhead'), nm = el('b', '', String(c.title || '…'));
        nm.dir = dirOf(c.title); head.appendChild(nm);
        if (c.id === S.chatId) head.appendChild(tx(el('span', 'badge ok'), 'chat_now'));
        row.appendChild(head); row.appendChild(el('div', 'libmeta', fmtDate(c.updated) + (c.count ? ' · ' + c.count + ' msg' : '')));
        var acts = el('div', 'libacts'), bo = tx(el('button', 'btn2 pri'), 'chat_open'), bd = tx(el('button', 'btn2'), 'lib_del');
        bo.type = bd.type = 'button';
        bo.onclick = function () {
          if (c.data) return openChatData(c.id, c.data);
          fetch(CHATS + '?id=' + encodeURIComponent(c.id), { headers: { 'x-brain-key': syncKey }, cache: 'no-store' }).then(function (r) { return r.json(); })
            .then(function (j) { if (j && j.ok && j.chat && j.chat.data) openChatData(c.id, j.chat.data); else toast(t('lib_err'), 3000); }).catch(function () { toast(t('lib_err'), 3000); });
        };
        var armed = 0;
        bd.onclick = function () {
          if (Date.now() - armed > 3000) { armed = Date.now(); tx(bd, 'lib_del_sure'); return; }
          try { localStorage.setItem(ARCH, JSON.stringify(readArchive().filter(function (x) { return x.id !== c.id; }))); } catch (e) {}
          if (remote) fetch(CHATS, { method: 'POST', headers: { 'content-type': 'application/json', 'x-brain-key': syncKey }, body: JSON.stringify({ action: 'delete', id: c.id }) }).catch(function () {});
          row.remove(); toast(t('lib_deleted'));
        };
        if (c.id !== S.chatId) acts.appendChild(bo);
        acts.appendChild(bd); row.appendChild(acts); list.appendChild(row);
      });
    };
    if (CHATS && syncKey) {
      fetch(CHATS, { headers: { 'x-brain-key': syncKey }, cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) show(j.chats || [], true); else show(local, false); }).catch(function () { show(local, false); });
    } else show(local, false);
  }
  function openPrefs() {
    openModal('prefModal');
    var list = $('prefList'); list.innerHTML = ''; list.appendChild(tx(el('div', 'libnote'), 'lib_loading'));
    var call2 = function (extra) {
      return fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', 'x-brain-key': syncKey }, body: JSON.stringify(Object.assign({ v: 2, mode: 'prefs' }, extra || {})) }).then(function (r) { return r.json(); });
    };
    var show = function (j) {
      list.innerHTML = '';
      var prefs = j && Array.isArray(j.prefs) ? j.prefs : null;
      if (!prefs) { list.appendChild(tx(el('div', 'libnote'), syncKey ? 'lib_err' : 'lib_locked')); return; }
      if (!prefs.length) { list.appendChild(tx(el('div', 'libnote'), 'pref_empty')); return; }
      prefs.forEach(function (p, i) {
        var row = el('div', 'librow'), head = el('div', 'libhead'), nm = el('span', '', p), bd = tx(el('button', 'btn2'), 'lib_del');
        nm.dir = dirOf(p); bd.type = 'button'; bd.onclick = function () { call2({ remove: i }).then(show).catch(function () { toast(t('lib_err'), 3000); }); };
        head.appendChild(nm); head.appendChild(bd); row.appendChild(head); list.appendChild(row);
      });
    };
    if (!syncKey) return show(null);
    call2().then(show).catch(function () { show(null); });
  }

  /* ---------- saved indicators library (Brain only: CFG.library + the owner key) ---------- */
  function libCall(method, query, body) {
    var opt = { method: method, headers: { 'x-brain-key': syncKey }, cache: 'no-store' };
    if (body) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(LIB + (query || ''), opt).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j || !j.ok) { var e = new Error((j && j.message) || 'http ' + r.status); e.status = r.status; e.locked = !!(j && j.locked); throw e; } return j; }); });
  }
  function libSave(msg, targetId, cb) {
    var rep = msg.report || {}, req = '';
    for (var i = S.msgs.length - 1; i >= 0; i--) { if (S.msgs[i].r === 'u') { req = S.msgs[i].text; break; } }
    libCall('POST', '', { action: 'save', id: targetId || undefined, code: msg.code, file: msg.file, title: msg.title, request: req.slice(0, 300), verified: !!rep.verified, errors: (rep.errors || []).slice(0, 3).map(function (e) { return e.message; }) })
      .then(function (j) {
        msg.libId = j.id; if (msg._libBtn) msg._libBtn.style.display = 'none';
        if (S.cur && S.cur.id === msg.id) S.cur.libId = j.id;
        save(); if (cb) cb(true, !!targetId && j.id === targetId);
      }).catch(function () { if (cb) cb(false); });
  }
  function fmtDate(ms) { try { return new Date(ms).toLocaleString(L ? 'en-AU' : 'ar', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
  var libItems = [], libUpgrade = null, libUpdating = {};
  // Applies the pending engine update to one saved indicator now (the server checks it and keeps the old version).
  function libUpgradeOne(it, done) {
    libUpdating[it.id] = true; renderLibrary(); toast(t('lib_upd_busy', { x: it.name || it.file }), 4000);
    libCall('POST', '', { action: 'upgrade', id: it.id }).then(function (j) {
      var r = j.result || {}, nm = it.name || it.file;
      if (j.item) { var k = libItems.indexOf(it); if (k >= 0) { j.item.pending = r.status === 'rejected' || r.status === 'error' ? it.pending : undefined; libItems[k] = j.item; } }
      toast(r.status === 'updated' ? t('lib_upd_done', { x: nm, a: r.from, b: r.to }) : r.status === 'rejected' || r.status === 'error' ? t('lib_upd_fail', { x: nm }) : t('lib_upd_same', { x: nm }), 6000);
    }).catch(function () { toast(t('lib_err'), 3500); }).then(function () { delete libUpdating[it.id]; renderLibrary(); if (done) done(); });
  }
  function openLibrary() {
    openModal('libModal');
    var list = $('libList'), q = $('libQ'); q.value = '';
    list.innerHTML = ''; list.appendChild(tx(el('div', 'libnote'), 'lib_loading'));
    if (!syncKey) { list.innerHTML = ''; list.appendChild(activateBox(openLibrary)); return; }
    libCall('GET').then(function (j) { libItems = Array.isArray(j.items) ? j.items : []; libUpgrade = j.upgrade || null; renderLibrary(); })
      .catch(function (e) { list.innerHTML = ''; list.appendChild(e.locked ? activateBox(openLibrary) : tx(el('div', 'libnote'), 'lib_err')); });
  }
  // Search by name: Arabic letter forms unified (أ إ آ = ا, ة = ه, ى = ي, no tashkeel), every word must match the
  // name / title / file (the shared "Nexus" prefix and ".pine" are ignored, or every script would match). Only when no
  // name matches, the words are looked up in the original request text.
  function libNorm(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627').replace(/\u0629/g, '\u0647').replace(/\u0649/g, '\u064A')
      .replace(/\.pine\b/g, ' ').replace(/[_\-–—·•|/\\()[\]{}"',.:;!?]+/g, ' ').replace(/\bnexus\b|\bnx\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function libFilter(all, raw) {
    var words = libNorm(raw).split(' ').filter(Boolean);
    if (!words.length) return all.slice();
    var hit = function (hay) { hay = ' ' + libNorm(hay) + ' '; return words.every(function (w) { return hay.indexOf(w) >= 0; }); };
    var byName = all.filter(function (it) { return hit((it.name || '') + ' ' + (it.title || '') + ' ' + (it.file || '')); });
    if (byName.length) return byName;
    var byReq = all.filter(function (it) { return hit(it.request || ''); });
    byReq.byRequest = true;
    return byReq;
  }
  // Activates this device right inside the page: paste the Brain link (…#key=…) or the key itself. The key is checked
  // against the library before it is kept (localStorage of this site, sent only as a header).
  function activateBox(onDone) {
    var box = el('div', 'actbox'), p = tx(el('div', 'libnote'), 'act_p'), row = el('div', 'actrow'), inp = el('input', 'libq'), go = tx(el('button', 'btn2 pri'), 'act_go');
    inp.type = 'password'; inp.autocomplete = 'off'; inp.placeholder = t('act_ph'); inp.setAttribute('aria-label', t('act_ph')); go.type = 'button';
    row.appendChild(inp); row.appendChild(go); box.appendChild(p); box.appendChild(row);
    function keyOf(v) { v = String(v || '').trim(); var m = /^([A-Za-z0-9_-]{24,200})$/.exec(v) || /[#&?]key=([A-Za-z0-9_-]{24,200})(?![A-Za-z0-9_-])/.exec(v); return m ? m[1] : ''; }
    go.onclick = function () {
      var k = keyOf(inp.value);
      if (!k) { toast(t('act_bad'), 3500); inp.focus(); return; }
      var old = syncKey; syncKey = k; go.disabled = true;
      libCall('GET').then(function () {
        try { localStorage.setItem('brain_key', k); } catch (e) {}
        toast(t('act_ok'), 2600); if (onDone) onDone();
      }).catch(function (e) { syncKey = old; go.disabled = false; toast(t(e && e.locked ? 'act_bad' : 'lib_err'), 3500); });
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
    return box;
  }
  function renderLibrary() {
    var list = $('libList'), raw = String($('libQ').value || '');
    list.innerHTML = '';
    var items = libFilter(libItems, raw);
    if (!libItems.length) { list.appendChild(tx(el('div', 'libnote'), 'lib_empty')); return; }
    var waiting = libItems.filter(function (x) { return x.pending && !libUpdating[x.id]; });
    if (waiting.length) {
      var ub = el('div', 'libupd'), ut = el('div', 'libnote', t('lib_upd_what', { x: libUpgrade ? (L ? libUpgrade.en : libUpgrade.ar) : '' })), ua = el('button', 'btn2 pri', t('lib_upd_all', { n: waiting.length }));
      ut.dir = 'auto'; ua.type = 'button';
      ua.onclick = function () { ua.disabled = true; var q = waiting.slice(); (function next() { var x = q.shift(); if (x) libUpgradeOne(x, next); })(); };
      ub.appendChild(ut); ub.appendChild(ua); list.appendChild(ub);
    }
    // Every saved indicator is listed at once; the search box only narrows the list. Tapping a card opens it.
    list.appendChild(el('div', 'libnote libcount', libNorm(raw) ? (items.length ? t(items.byRequest ? 'lib_found_req' : 'lib_found', { n: items.length, all: libItems.length }) : t('lib_none', { x: raw.trim() })) : t('lib_all', { n: libItems.length })));
    items.forEach(function (it) {
      var row = el('div', 'librow'), main = el('button', 'libmain'), head = el('div', 'libhead'), nm = el('b', '', String(it.name || it.file)), meta = el('div', 'libmeta');
      main.type = 'button'; main.title = t('lib_open'); main.onclick = function () { libOpen(it.id); };
      nm.dir = dirOf(it.name);
      head.appendChild(nm);
      head.appendChild(tx(el('span', 'badge ' + (it.verified ? 'ok' : 'warn')), it.verified ? 'b_ok' : 'b_warn', it.verified ? null : { n: Math.max(1, (it.errors || []).length) }));
      if (it.pending) head.appendChild(tx(el('span', 'badge upd'), 'lib_upd_badge'));
      meta.dir = 'auto'; meta.textContent = fmtDate(it.updated) + ' · ' + t('n_lines', { n: num(it.lines, 0) }) + (it.source === 'telegram' ? ' · Telegram' : '') + (it.versions ? ' · ' + t('lib_vers', { n: it.versions }) : '') + (it.lastUpgrade && it.lastUpgrade.day ? ' · ' + t('lib_auto', { d: it.lastUpgrade.day, v: it.lastUpgrade.to }) : '');
      main.appendChild(head); main.appendChild(meta);
      if (it.request) { var rq = el('div', 'libreq', it.request); rq.dir = dirOf(it.request); main.appendChild(rq); }
      var more = el('button', 'libmore', '⋯'); more.type = 'button'; more.title = t('lib_more'); more.setAttribute('aria-label', t('lib_more')); more.setAttribute('aria-expanded', 'false');
      var acts = el('div', 'libacts'); acts.hidden = true;
      more.onclick = function () { acts.hidden = !acts.hidden; more.setAttribute('aria-expanded', acts.hidden ? 'false' : 'true'); };
      var bo = tx(el('button', 'btn2 pri'), 'lib_open'), br = tx(el('button', 'btn2'), 'lib_ren'), bd = tx(el('button', 'btn2'), 'lib_del');
      bo.type = br.type = bd.type = 'button';
      bo.onclick = function () { libOpen(it.id); };
      br.onclick = function () { var n = window.prompt(t('lib_ren_ask'), it.name || ''); if (!n || !n.trim()) return; libCall('POST', '', { action: 'rename', id: it.id, name: n.trim() }).then(function (j) { it.name = j.item.name; renderLibrary(); }).catch(function () { toast(t('lib_err'), 3000); }); };
      var armed = 0;
      bd.onclick = function () {
        if (Date.now() - armed > 3000) { armed = Date.now(); tx(bd, 'lib_del_sure'); return; }
        libCall('POST', '', { action: 'delete', id: it.id }).then(function () { libItems = libItems.filter(function (x) { return x.id !== it.id; }); renderLibrary(); toast(t('lib_deleted')); }).catch(function () { toast(t('lib_err'), 3000); });
      };
      acts.appendChild(bo);
      if (PREVIEW && window.NexusChart) { var bc = tx(el('button', 'btn2'), 'lib_chart'); bc.type = 'button'; bc.onclick = function () { closeModals(); openStudio('lib:' + it.id); }; acts.appendChild(bc); }
      acts.appendChild(br);
      if (it.pending) {
        var bu = tx(el('button', 'btn2 pri'), 'lib_upd_btn'); bu.type = 'button'; bu.disabled = !!libUpdating[it.id];
        bu.onclick = function () { libUpgradeOne(it); };
        acts.appendChild(bu);
      }
      var ba = tx(el('button', 'btn2'), it.autoUpdate === false ? 'lib_auto_off' : 'lib_auto_on'); ba.type = 'button';
      ba.onclick = function () { var on = it.autoUpdate === false; libCall('POST', '', { action: 'autoupdate', id: it.id, on: on }).then(function (j) { var k = libItems.indexOf(it); if (k >= 0) { j.item.pending = on ? it.pending : undefined; libItems[k] = j.item; } renderLibrary(); }).catch(function () { toast(t('lib_err'), 3000); }); };
      acts.appendChild(ba);
      if (it.versions) {
        var bp = tx(el('button', 'btn2'), 'lib_prev'); bp.type = 'button';
        bp.onclick = function () { libCall('POST', '', { action: 'restore', id: it.id, index: 0 }).then(function (j) { var k = libItems.indexOf(it); if (k >= 0) libItems[k] = j.item; renderLibrary(); toast(t('lib_restored')); }).catch(function () { toast(t('lib_err'), 3000); }); };
        acts.appendChild(bp);
      }
      acts.appendChild(bd);
      var top = el('div', 'libtop'); top.appendChild(main); top.appendChild(more);
      row.appendChild(top); row.appendChild(acts); list.appendChild(row);
    });
  }
  function libOpen(id) {
    if (busy) { toast(t('wait_busy')); return; }
    libCall('GET', '?id=' + encodeURIComponent(id)).then(function (j) {
      var it = j.item; closeModals();
      var shown = '📂 ' + (it.name || it.file);
      addUser(shown); S.msgs.push({ r: 'u', text: shown, api: 'Open my saved indicator: ' + it.file }); save();
      var col = addShell();
      deliver(col, { explain: t('lib_opened', { x: it.name || it.file }), code: it.code, file: it.file, title: it.title, report: { verified: it.verified, errors: (it.errors || []).map(function (m) { return { line: 0, message: m }; }), warnings: [] }, base: 'library', libId: it.id });
    }).catch(function () { toast(t('lib_err'), 3500); });
  }
  if ($('libQ')) $('libQ').addEventListener('input', renderLibrary);

  /* ---------- actions ---------- */
  // Sends a build request: `text` plus attachments. The script being edited is fixed at this moment, also for retries.
  function send(text, atts) {
    if (!(atts || []).length && isForgetCmd(text)) {
      var target = currentScriptMsg();
      addUser(text); S.msgs.push({ r: 'u', text: String(text).slice(0, 20000) });
      if (target) { forgetScript(target); return; }
      var col0 = addShell(); addBubble(col0, t('forget_none')); S.msgs.push({ r: 'a', kind: 'text', explain: t('forget_none') }); save(); return;
    }
    atts = atts || [];
    var previews = atts.filter(function (a) { return a.kind === 'image' || a.kind === 'video'; }).map(function (a) { return a.preview; });
    var fileText = '';
    atts.forEach(function (a) { if (a.kind === 'text') fileText += '\nFile "' + a.name + '":\n' + a.text + '\n'; });
    var bin = atts.filter(function (a) { return a.kind !== 'text'; });
    var plain = (text || t('fromAtt')) + (fileText ? '\n' + fileText : ''), content = plain;
    if (bin.length) {
      content = [];
      bin.forEach(function (a) {
        if (a.kind === 'video') {
          content.push({ type: 'text', text: 'VIDEO: the next ' + a.frames.length + ' images are frames of one ' + Math.round(a.dur) + '-second screen recording, in order (at ' + a.times.join(', ') + ' s). Read them together: what is on the chart and how it changes over time.' });
          a.frames.forEach(function (fr) { content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fr } }); });
        } else content.push({ type: a.kind === 'image' ? 'image' : 'document', source: { type: 'base64', media_type: a.media_type, data: a.data } });
      });
      content.push({ type: 'text', text: plain });
    }
    addUser(text || '(' + t('attach') + ')', previews);
    S.msgs.push({ r: 'u', text: (text || t('fromAtt')).slice(0, 20000), api: fileText ? plain.slice(0, 4000) : undefined, imgs: bin.length || undefined, vid: bin.some(function (a) { return a.kind === 'video'; }) || undefined });
    save();
    var cur = S.cur && S.cur.code ? { code: S.cur.code, file: S.cur.file, libId: S.cur.libId } : null;
    var go = function () {
      var msgs = apiMessages(); msgs[msgs.length - 1] = { role: 'user', content: content };
      runModel({ v: 2, mode: 'build', lang: L ? 'en' : 'ar', messages: msgs, code: cur ? cur.code : '', file: cur ? cur.file : undefined }, go, cur && cur.libId);
    };
    go();
  }
  // Enter and the send button. While a request runs, only a deliberate press on the button (not a double click) stops it.
  function submit(fromButton) {
    if (busy) { if (fromButton === true && Date.now() - busyAt > 600) stopRequest(); return; }
    if (loading) { toast(t('wait_att')); return; }
    var text = input.value.trim();
    if (!text && !pending.length) return;
    if (mic) mic.stop();
    var atts = pending.slice();
    input.value = ''; pending = []; renderChips(); grow();
    send(text, atts);
  }
  function runFix(msg, tvError) {
    if (busy) { toast(t('wait_busy')); return; }
    var shown = tvError ? t('fix_user') + '\n' + tvError : t('autofix_user');
    addUser(shown);
    S.msgs.push({ r: 'u', text: shown, api: tvError ? t('fix_req') : t('autofix_user') }); save();
    var go = function () {
      runModel({ v: 2, mode: 'fix', lang: L ? 'en' : 'ar', messages: apiMessages(), code: msg.code, file: msg.file, tvError: tvError || undefined }, go, msg.libId);
    };
    go();
  }
  // Template and check requests: one JSON reply, no model call.
  async function quickRun(body, labelKey, toMsg) {
    clearRetries(); setBusy(true);
    var g = gen, col = addShell(), prog = new Progress(col, labelKey), j = null, err = null, stopped = false;
    prog.quick = true;
    var retry = function () { quickRun(body, labelKey, toMsg); };
    try {
      var res = await call(body, function () {});
      j = res.json || null;
      if (!j || j.kind === 'error' || typeof j.code !== 'string' || !j.code.trim()) err = (j && str(j.message, 600)) || t('e_empty');
    } catch (e) {
      if (e && e.name === 'AbortError' && !e.idle) stopped = true; else err = errText(e);
    }
    prog.done();
    if (g !== gen) { setBusy(false); return; }
    try {
      if (stopped) renderNotice(col, t('stopped'), '', retry);
      else if (err) renderNotice(col, '⚠️ ' + err, 'err', retry);
      else deliver(col, toMsg(j));
    } catch (e) {
      renderNotice(col, '⚠️ ' + t('e_empty'), 'err', retry);
    } finally { setBusy(false); toBottom(true); }
  }
  function quickCall(body, userText, histText, labelKey, toMsg) {
    if (busy) { toast(t('wait_busy')); return false; }
    addUser(userText);
    S.msgs.push({ r: 'u', text: userText, api: histText }); save();
    quickRun(body, labelKey, toMsg);
    return true;
  }
  function useTemplate(id) {
    var title = tplTitle(id);
    return quickCall({ v: 2, mode: 'template', templateId: id, lang: L ? 'en' : 'ar' }, t('tpl_user') + title, t('tpl_hist') + title, 's_tplget', function (j) {
      return { explain: j.explain, code: j.code, file: j.file, title: j.title, report: j.report, base: j.base };
    });
  }
  function checkCode(code) {
    var n = code.replace(/\s+$/, '').split('\n').length;
    return quickCall({ v: 2, mode: 'lint', lang: L ? 'en' : 'ar', code: code }, t('chk_user', { n: n }), t('chk_user', { n: n }), 's_lint', function (j) {
      var rep = cleanReport(j.report) || { verified: false, errors: [], warnings: [], errorCount: 0, warningCount: 0, unappliedEdits: 0 };
      return { explain: rep.verified ? t('chk_clean') : rep.crashed ? t('chk_crash') : t('chk_bad', { n: Math.max(1, rep.errorCount + rep.warningCount) }), code: j.code, file: 'my_script.pine', title: '', report: rep, base: 'paste' };
    });
  }
  // Puts a prepared text into the composer without throwing away what the user already typed: an empty box takes
  // the text; a draft is kept, and a complete request (`append`) is added below it.
  function setDraft(text, append, quiet) {
    var cur = input.value;
    if (!cur.trim()) input.value = text;
    else if (append && cur.indexOf(text.trim()) < 0) input.value = cur.replace(/\s+$/, '') + '\n' + text;
    grow();
    if (!quiet || !coarse()) input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
  }
  function tool(name) {
    closeDrawer(true);
    var cur = S.cur && S.cur.code;
    if (name === 'how') return openModal('howModal');
    if (name === 'check') return openModal('checkModal');
    if (name === 'lib') return openLibrary();
    if (name === 'studio') return openStudio();
    if (name === 'chats') return openChats();
    if (name === 'prefs') return openPrefs();
    // The prepared request is added once a file was really chosen (a cancelled picker changes nothing).
    if (name === 'image') return pickFile('image/*,video/*', function () { setDraft(t('p_img'), true, true); });
    if (name === 'file') return pickFile('.pine,.txt,.pdf,image/*,video/*', function () { setDraft(t('p_file'), true, true); });
    if (name === 'explain' && cur) { if (busy) toast(t('wait_busy')); else send(t('p_explain_cur'), []); return; }
    if (name === 'idea') setDraft(t('p_idea'), false);
    else if (name === 'strategy') setDraft(cur ? t('p_strat_cur') : t('p_strat'), !!cur);
    else if (name === 'explain') setDraft(t('p_explain'), false);
  }
  // Clearing the conversation cannot be undone, so it takes two presses when there is something to lose.
  var newArmed = 0;
  function newChat() {
    if (S.msgs.length && Date.now() - newArmed > 3500) {
      newArmed = Date.now(); tx(newBtn, 'new_arm'); newBtn.classList.add('arm'); toast(t('new_sure'), 3200);
      setTimeout(function () { if (Date.now() - newArmed >= 3400) { tx(newBtn, 'btn_new'); newBtn.classList.remove('arm'); } }, 3500);
      return;
    }
    newArmed = 0; tx(newBtn, 'btn_new'); newBtn.classList.remove('arm');
    gen++; stopRequest();
    if (mic) mic.stop();
    archiveChat(true);
    S = { msgs: [], cur: null, seq: 0, chatId: newChatId() }; pending = []; renderChips();
    stores().forEach(function (st) { try { st.removeItem(STORE); } catch (e) {} });
    pushSync();
    renderAll(); input.value = ''; grow();
    if (!coarse()) input.focus();
  }

  /* ---------- views: landing <-> app (the app view is "#app", so reload and Back behave) ---------- */
  var pushedApp = false;
  function showApp(on) {
    appview.classList.toggle('on', on);
    root.classList.toggle('app-open', on && LANDING);
    if (on) { grow(); toBottom(true); } else { if (mic) mic.stop(); closeModals(); closeDrawer(true); }
  }
  function launch() {
    if (LANDING && location.hash !== '#app') { try { history.pushState({ nexus: 1 }, '', '#app'); pushedApp = true; } catch (e) {} }
    showApp(true);
    // A double click on "Start" would otherwise hit whatever control of the app appears under the pointer.
    appview.style.pointerEvents = 'none'; setTimeout(function () { appview.style.pointerEvents = ''; }, 450);
    if (!coarse()) input.focus();
  }
  function home() {
    if (!LANDING) return;
    if (pushedApp) { pushedApp = false; try { history.back(); return; } catch (e) {} }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    showApp(false);
  }
  function grow() {
    input.dir = input.value ? 'auto' : (L ? 'ltr' : 'rtl');
    input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }

  /* ---------- wiring ---------- */
  menuBtn.onclick = openDrawer;
  scrim.onclick = function () { closeDrawer(); };
  newBtn.onclick = newChat;
  if ($('home')) $('home').onclick = home;
  ['langL', 'langA'].forEach(function (id) { var b = $(id); if (b) b.onclick = toggleLang; });
  $('ctxNew').onclick = function () { S.cur = null; save(); refreshCurrent(); if (!coarse()) input.focus(); };
  drawer.addEventListener('click', function (e) { var b = e.target.closest('button[data-tool]'); if (b) tool(b.getAttribute('data-tool')); });
  document.addEventListener('mousedown', function (e) { downOnBackdrop = !!(e.target.classList && e.target.classList.contains('modal')); });
  document.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (act) { var a = act.getAttribute('data-act'); if (a === 'launch') launch(); else if (a === 'demo') { launch(); useTemplate('smc'); } return; }
    if (e.target.closest('[data-close]')) return closeModals();
    // A dialog closes on a click that started and ended on the backdrop (not when a text selection ends there).
    if (e.target.classList && e.target.classList.contains('modal') && downOnBackdrop) closeModals();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (document.querySelector('.modal.on')) closeModals(); else closeDrawer(); } });
  window.addEventListener('popstate', function () { if (!LANDING) return; var on = location.hash === '#app'; if (!on) pushedApp = false; showApp(on); });
  $('checkGo').onclick = function () {
    var box = $('checkIn'), v = box.value;
    if (!v.trim()) { box.focus(); return; }
    if (v.length > MAX_CODE) { toast(t('e_long'), 3500); return; }
    if (busy) { toast(t('wait_busy')); return; }
    closeModals(); box.value = ''; checkCode(v);
  };
  input.addEventListener('input', function () { grow(); if (mic && mic.active()) mic.stop(); }); // typing ends dictation
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !coarse()) { e.preventDefault(); submit(false); }
  });
  sendBtn.onclick = function () { submit(true); };
  $('att').onclick = function () { pickFile(); };
  fileInput.onchange = function () {
    var f = fileInput.files && fileInput.files[0], then = afterPick; afterPick = null;
    if (f && handleFile(f) && then) then();
  };
  function clipFiles(dt) {
    var out = [], items = (dt && dt.items) || [];
    for (var i = 0; i < items.length; i++) { if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) out.push(f); } }
    return out;
  }
  function hasType(dt, type) { try { return Array.prototype.indexOf.call(dt.types || [], type) >= 0; } catch (e) { return false; } }
  document.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    // Text wins: a clipboard that carries text (Office apps add a picture of it) is pasted as text by the browser.
    if (!cd || !appview.classList.contains('on') || document.querySelector('.modal.on') || hasType(cd, 'text/plain')) return;
    var files = clipFiles(cd); if (!files.length) return;
    e.preventDefault(); files.slice(0, 3).forEach(handleFile); input.focus();
  });
  // Dropping a file on the page attaches it (instead of the browser leaving the app to open the file).
  document.addEventListener('dragover', function (e) { if (e.dataTransfer && hasType(e.dataTransfer, 'Files')) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (!e.dataTransfer || !hasType(e.dataTransfer, 'Files')) return;
    e.preventDefault();
    if (!appview.classList.contains('on') || document.querySelector('.modal.on')) return;
    Array.prototype.slice.call(e.dataTransfer.files || [], 0, 3).forEach(handleFile);
  });
  mic = (function () {
    var btn = $('mic'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!btn) return null;
    if (!SR) { btn.style.display = 'none'; return null; }
    var rec = new SR(), on = false, discard = false, base = '', finalTx = '';
    rec.interimResults = true; rec.continuous = true;
    function off() { on = false; discard = false; btn.classList.remove('rec'); btn.setAttribute('aria-pressed', 'false'); }
    rec.onresult = function (e) {
      if (discard) return;
      // The whole session is rebuilt on every event, so finished phrases are never dropped. Some phones repeat the
      // text so far in each new result: a result that starts with the previous one replaces it.
      var parts = [];
      for (var i = 0; i < e.results.length; i++) { var x = String(e.results[i][0].transcript || '').trim(); if (!x) continue; var last = parts[parts.length - 1]; if (last && x.indexOf(last) === 0) parts[parts.length - 1] = x; else parts.push(x); }
      var spoken = parts.join(' ').replace(/\s+/g, ' ').trim();
      input.value = (base ? base.replace(/\s+$/, '') + ' ' : '') + spoken; grow();
    };
    rec.onend = off;
    rec.onerror = function (e) { if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) toast(t('mic_denied'), 4000); off(); };
    btn.setAttribute('aria-pressed', 'false');
    btn.onclick = function () {
      if (on) { try { rec.stop(); } catch (e) {} return; }
      base = input.value; finalTx = ''; discard = false;
      try { rec.lang = L ? 'en-US' : 'ar-SA'; rec.start(); on = true; btn.classList.add('rec'); btn.setAttribute('aria-pressed', 'true'); if (!coarse()) input.focus(); } catch (e) {}
    };
    return {
      // Called when the message is sent: late results must not refill the cleared box.
      stop: function () { if (on) { discard = true; try { rec.stop(); } catch (e) {} } },
      setLang: function () { try { rec.lang = L ? 'en-US' : 'ar-SA'; } catch (e) {} },
      active: function () { return on; }
    };
  })();

  /* On phones the on-screen keyboard covers the bottom of a fixed layer: keep the app inside the visible area. */
  (function () {
    var vv = window.visualViewport; if (!vv || !coarse()) return;
    function fit() {
      var gap = window.innerHeight - vv.height;
      if (Math.abs(vv.scale - 1) < 0.01 && gap > 80) { appview.style.top = vv.offsetTop + 'px'; appview.style.bottom = 'auto'; appview.style.height = vv.height + 'px'; }
      else { appview.style.top = ''; appview.style.bottom = ''; appview.style.height = ''; }
    }
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
  })();

  /* engine status */
  fetch(ENDPOINT, { method: 'GET' }).then(function (r) { return r.json(); }).then(function (d) {
    setStatus(d && d.hasKey === false ? 'st_off' : 'st_live');
  }).catch(function () { setStatus('st_noconn'); });

  /* auto-update: reload to the newest deployed version (never while something is in progress) */
  (function () {
    var myE = null;
    function idle() {
      return !busy && !loading && !pending.length && !input.value.trim() && !thread.querySelector('.retry') && !(mic && mic.active()) && !document.querySelector('.modal.on') && !document.querySelector('.fixbox.on');
    }
    function chk() {
      try {
        fetch(location.pathname + '?_u=' + Date.now(), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
          var e = r.ok && (r.headers.get('etag') || r.headers.get('last-modified')); if (!e) return;
          if (myE === null) { myE = e; return; }
          if (e !== myE && idle()) location.reload();
        }).catch(function () {});
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') chk(); });
    setInterval(chk, 180000); chk();
  })();

  window.NexusApp = { launch: launch, home: home, toggleLang: toggleLang, useTemplate: function (id) { launch(); useTemplate(id); }, demo: function () { launch(); useTemplate('smc'); } };

  if (!PREVIEW) { var sb = document.querySelector('[data-tool="studio"]'); if (sb) sb.remove(); }
  if (!LIB) { ['lib', 'prefs'].forEach(function (k) { var lb = document.querySelector('[data-tool="' + k + '"]'); if (lb) lb.remove(); }); }
  load();
  if (SYNC && syncKey) {
    pullSync();
    ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { lastActive = Date.now(); }, true); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { lastActive = Date.now(); pullSync(); } });
    // Checks for changes from the other device while the page is in use (pauses after 10 quiet minutes).
    setInterval(function () { if (document.visibilityState === 'visible' && Date.now() - lastActive < 600000) pullSync(); }, 15000);
  }
  setStatus('st_ready');
  applyLang();
  renderAll();
  showApp(!LANDING || location.hash === '#app');
})();
