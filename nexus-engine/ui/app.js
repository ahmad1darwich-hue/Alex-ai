/* Nexus app client (protocol v2). Shared by indicator-build and brain-app/indicators; built by nexus-engine/ui/build-ui.mjs */
(function () {
  'use strict';
  var CFG = window.NEXUS_CONFIG || {};
  var ENDPOINT = CFG.endpoint || '/api/indicator';
  var STORE = CFG.store || 'nexus_v2';
  var TPL = CFG.templates || [];
  var LANDING = !!CFG.landing;
  var MAX_CODE = 120000; // same limit as the server
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  /* Web fonts load after first paint: the page never waits for them. */
  if (CFG.fonts) { try { var fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.href = CFG.fonts; document.head.appendChild(fl); } catch (e) {} }

  /* ---------- i18n: [Arabic, English] ---------- */
  var I18N = {
    btn_new: ['+ جديد', '+ New'],
    new_sure: ['اضغط كمان مرّة لمسح المحادثة', 'Press again to clear the conversation'],
    new_arm: ['أكيد؟', 'Sure?'],
    b_crash: ['⚠ ما انفحص', '⚠ Not checked'],
    chk_crash: ['الفاحص التلقائي ما قدر يحلّل هالكود، فهو مش مفحوص. الصقه بـ TradingView لتعرف إذا بيشتغل.', 'The automatic checker could not analyse this code, so it is not checked. Paste it into TradingView to see whether it compiles.'],
    unfinished: ['هالطلب ما خلص (الصفحة تسكّرت أو تحدّثت قبل ما يوصل الرد).', 'This request did not finish (the page was closed or reloaded before the reply arrived).'],
    t_menu: ['القائمة', 'Menu'], t_home: ['الرئيسية', 'Home'], t_new: ['محادثة جديدة', 'New chat'], t_lang: ['Switch to English', 'التحويل للعربية'],
    t_att: ['ارفع صورة أو ملف', 'Upload an image or file'], t_mic: ['تكلّم', 'Speak'], t_send: ['إرسال', 'Send'], t_stop: ['إيقاف', 'Stop'],
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
    badtype: ['نوع الملف مش مدعوم. ارفع صورة، PDF، أو ملف نص / Pine.', 'Unsupported file type. Upload an image, a PDF, or a text / Pine file.'],
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
  var S = { msgs: [], cur: null, seq: 0 };
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
      return { r: 'a', kind: 'script', id: num(m.id, 0), explain: str(m.explain, 20000), line: str(m.line, 600), code: str(m.code, MAX_CODE * 2), file: safeName(m.file), title: str(m.title, 200), report: cleanReport(m.report), base: str(m.base, 80), ms: num(m.ms, 0), dropped: m.dropped ? true : undefined };
    }
    return { r: 'a', kind: 'text', explain: str(m.explain, 20000) };
  }
  function slimJson(data) {
    // Storage full: keep the code of the three latest scripts only.
    var keep = 3, msgs = data.msgs.slice();
    for (var i = msgs.length - 1; i >= 0; i--) {
      var m = msgs[i];
      if (m.kind === 'script' && m.code) { if (keep > 0) keep--; else { m = msgs[i] = Object.assign({}, m); m.code = ''; m.dropped = true; } }
    }
    return JSON.stringify({ v: 2, msgs: msgs, cur: data.cur, seq: data.seq });
  }
  function save() {
    var msgs = S.msgs.slice(-30), cur = S.cur;
    if (cur && msgs.some(function (m) { return m.id === cur.id && m.code; })) cur = { id: cur.id, file: cur.file };
    var data = { v: 2, msgs: msgs, cur: cur, seq: S.seq }, full = JSON.stringify(data), slim = null, saved = 0;
    stores().forEach(function (st) {
      try { st.setItem(STORE, full); saved++; }
      catch (e) { try { if (slim === null) slim = slimJson(data); st.setItem(STORE, slim); saved++; } catch (e2) { try { st.removeItem(STORE); } catch (e3) {} } }
    });
    if (!saved && !save.warned) { save.warned = true; toast(t('e_store'), 5000); }
    pushSync();
  }

  /* ---------- one conversation on all the owner's devices (pages with CFG.sync, activated with the owner key) ---------- */
  var SYNC = CFG.sync || '', syncRev = 0, syncTimer = null, syncKey = '', lastActive = Date.now();
  if (SYNC) {
    try {
      var hk = /[#&]key=([A-Za-z0-9_-]{24,200})(?![A-Za-z0-9_-])/.exec(location.hash || '');
      if (hk) { localStorage.setItem('brain_key', hk[1]); history.replaceState(null, '', location.pathname + location.search); }
      syncKey = localStorage.getItem('brain_key') || '';
    } catch (e) {}
  }
  function syncData() {
    var slim = JSON.parse(slimJson({ msgs: S.msgs.slice(-30), cur: S.cur ? { id: S.cur.id, file: S.cur.file } : null, seq: S.seq }));
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
      S = { msgs: [], cur: null, seq: 0 }; load(); renderAll();
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
        var c = d.cur && typeof d.cur === 'object' ? { id: num(d.cur.id, 0), file: safeName(d.cur.file), code: str(d.cur.code, MAX_CODE * 2) } : null;
        if (c && !c.code) { var src = S.msgs.filter(function (m) { return m.kind === 'script' && m.id === c.id && m.code; })[0]; c = src ? { id: src.id, file: src.file, code: src.code } : null; }
        S.cur = c;
      }
    } catch (e) { S = { msgs: [], cur: null, seq: 0 }; }
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
    bUse.onclick = function () { S.cur = { id: msg.id, code: msg.code, file: msg.file }; save(); refreshCurrent(); toast(t('use_ok')); };

    col.appendChild(art);
    arts.push({ msg: msg, use: bUse });
    refreshCurrent(); toBottom();
  }

  function renderAll() {
    thread.innerHTML = ''; arts = [];
    if (!S.msgs.length) { thread.innerHTML = introHtml; i18nDom(thread); buildIntro(); refreshCurrent(); return; }
    S.msgs.forEach(function (m) {
      // One unreadable message must not hide the rest of the conversation.
      try {
        if (m.r === 'u') addUser(m.text + (m.imgs ? '  📎' + (m.imgs > 1 ? '×' + m.imgs : '') : ''));
        else { var col = addShell(); if (m.kind === 'script' && m.code) renderScript(col, m); else addBubble(col, m.explain || '…'); }
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
    return '<span class="ti" aria-hidden="true">' + esc(tp.icon) + '</span><span><b>' + esc(tp.title[L ? 'en' : 'ar']) + '</b><small>' + esc(tp.blurb[L ? 'en' : 'ar']) + '</small></span>';
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
  function buildDrawer() {
    var box = $('dwTpl'); if (!box) return; box.innerHTML = '';
    TPL.forEach(function (tp) {
      var b = el('button'); b.type = 'button'; b.innerHTML = '<span class="em" aria-hidden="true">' + esc(tp.icon) + '</span> <span>' + esc(tp.title[L ? 'en' : 'ar']) + '</span>';
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
  function pickFile(accept, then) { afterPick = then || null; fileInput.accept = accept || 'image/*,.pine,.txt,.pdf'; fileInput.value = ''; fileInput.click(); }
  function handleFile(f) {
    if (!f) return false;
    var name = String(f.name || ''), isImg = /^image\//.test(f.type), isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(name);
    var isText = !isImg && !isPdf && (/^text\//.test(f.type) || /\.(pine|txt|md|csv|json)$/i.test(name));
    if (!isImg && !isPdf && !isText) { toast(t('badtype'), 3500); return false; }
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
    if (isImg) resizeImage(f, 1280, function (b64) { done({ kind: 'image', media_type: 'image/jpeg', data: b64, name: name, preview: 'data:image/jpeg;base64,' + b64 }); }, fail);
    else {
      var r = new FileReader();
      r.onerror = fail;
      if (isPdf) { r.onload = function () { var b64 = String(r.result).split(',')[1] || ''; if (b64) done({ kind: 'document', media_type: 'application/pdf', data: b64, name: name }); else fail(); }; r.readAsDataURL(f); }
      else { r.onload = function () { done({ kind: 'text', name: name.replace(/["\n\r]/g, '_').slice(0, 80), text: String(r.result).slice(0, 60000) }); }; r.readAsText(f); }
    }
    return true;
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
      if (p.kind === 'image') { var im = el('img'); im.alt = ''; im.src = p.preview; c.appendChild(im); } else { var ic = el('span', '', p.kind === 'document' ? '📄' : '📝'); ic.setAttribute('aria-hidden', 'true'); c.appendChild(ic); }
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
  function apiMessages() {
    var out = [];
    S.msgs.forEach(function (m) {
      if (m.r === 'u') out.push({ role: 'user', content: String(m.api || m.text || '(attachment)').slice(0, 6000) });
      else if (m.kind === 'script') out.push({ role: 'assistant', content: String(m.explain || '').slice(0, 3000) + '\n[script delivered: ' + (m.file || 'script.pine') + ']' });
      else if (m.kind === 'text') out.push({ role: 'assistant', content: String(m.explain || '').slice(0, 3000) });
    });
    return out.slice(-12);
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
      var r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: my.signal });
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

  // Shows a delivered script and only then stores it: data that cannot be rendered never reaches the saved conversation.
  function deliver(col, m) {
    var msg = cleanMsg({ r: 'a', kind: 'script', id: S.seq + 1, explain: m.explain, line: m.line, code: m.code, file: m.file, title: m.title, report: m.report, base: m.base, ms: m.ms });
    renderScript(col, msg);
    S.seq = msg.id; S.cur = { id: msg.id, code: msg.code, file: msg.file };
    S.msgs.push(msg); save(); refreshCurrent();
    announce(t('sr_done') + ' ' + (msg.line || (msg.report ? t(msg.report.verified ? 'b_ok' : msg.report.errorCount ? 'b_err' : 'b_warn', { n: msg.report.errorCount || Math.max(1, msg.report.warningCount + msg.report.unappliedEdits) }) : '')));
  }

  // Runs a model request (build or fix) and renders progress and the result. `retry` re-runs the same request.
  async function runModel(body, retry) {
    clearRetries(); setBusy(true);
    var g = gen, col = addShell(), prog = new Progress(col), fin = null, err = null, stopped = false;
    try {
      var res = await call(body, function (ev) {
        if (ev.t === 'stage') prog.stage(ev);
        else if (ev.t === 'code') prog.code(ev.d);
        else if (ev.t === 'final') fin = ev;
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
        deliver(col, { explain: fin.explain, line: fin.line, code: fin.code, file: fin.file || 'nexus_indicator.pine', title: fin.title, report: fin.report, base: fin.base, ms: num(fin.ms, 0) || secs * 1000 });
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

  /* ---------- actions ---------- */
  // Sends a build request: `text` plus attachments. The script being edited is fixed at this moment, also for retries.
  function send(text, atts) {
    atts = atts || [];
    var previews = atts.filter(function (a) { return a.kind === 'image'; }).map(function (a) { return a.preview; });
    var fileText = '';
    atts.forEach(function (a) { if (a.kind === 'text') fileText += '\nFile "' + a.name + '":\n' + a.text + '\n'; });
    var bin = atts.filter(function (a) { return a.kind !== 'text'; });
    var plain = (text || t('fromAtt')) + (fileText ? '\n' + fileText : ''), content = plain;
    if (bin.length) {
      content = bin.map(function (a) { return { type: a.kind === 'image' ? 'image' : 'document', source: { type: 'base64', media_type: a.media_type, data: a.data } }; });
      content.push({ type: 'text', text: plain });
    }
    addUser(text || '(' + t('attach') + ')', previews);
    S.msgs.push({ r: 'u', text: (text || t('fromAtt')).slice(0, 20000), api: fileText ? plain.slice(0, 4000) : undefined, imgs: bin.length || undefined });
    save();
    var cur = S.cur && S.cur.code ? { code: S.cur.code, file: S.cur.file } : null;
    var go = function () {
      var msgs = apiMessages(); msgs[msgs.length - 1] = { role: 'user', content: content };
      runModel({ v: 2, mode: 'build', lang: L ? 'en' : 'ar', messages: msgs, code: cur ? cur.code : '', file: cur ? cur.file : undefined }, go);
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
      runModel({ v: 2, mode: 'fix', lang: L ? 'en' : 'ar', messages: apiMessages(), code: msg.code, file: msg.file, tvError: tvError || undefined }, go);
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
    // The prepared request is added once a file was really chosen (a cancelled picker changes nothing).
    if (name === 'image') return pickFile('image/*', function () { setDraft(t('p_img'), true, true); });
    if (name === 'file') return pickFile('.pine,.txt,.pdf,image/*', function () { setDraft(t('p_file'), true, true); });
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
    S = { msgs: [], cur: null, seq: 0 }; pending = []; renderChips();
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
