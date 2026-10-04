/* Nexus app client (protocol v2). Shared by indicator-build and brain-app/indicators; built by nexus-engine/ui/build-ui.mjs */
(function () {
  'use strict';
  var CFG = window.NEXUS_CONFIG || {};
  var ENDPOINT = CFG.endpoint || '/api/indicator';
  var STORE = CFG.store || 'nexus_v2';
  var TPL = CFG.templates || [];
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- i18n: [Arabic, English] ---------- */
  var I18N = {
    btn_new: ['+ جديد', '+ New'],
    t_menu: ['القائمة', 'Menu'], t_home: ['الرئيسية', 'Home'], t_new: ['محادثة جديدة', 'New chat'],
    t_att: ['ارفع صورة أو ملف', 'Upload an image or file'], t_mic: ['تكلّم', 'Speak'], t_send: ['إرسال', 'Send'], t_stop: ['إيقاف', 'Stop'],
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
    dw_note: ['كل كود بينفحص تلقائياً قبل ما يوصلك. إذا TradingView طلّع خطأ، الصقه تحت المؤشر وبيتصلّح.', 'Every script is checked automatically before you get it. If TradingView shows an error, paste it under the script and it gets fixed.'],
    intro_h: ['شو المؤشر اللي بدك ياه؟', 'Which indicator do you want?'],
    intro_p: ['اختار مؤشر جاهز ومفحوص وبيوصلك فوراً، أو وصّف فكرتك بكلماتك وبينبنى إلك مؤشر خاص، مفحوص وجاهز للصق بـ TradingView.', 'Pick a ready, checked indicator and get it instantly, or describe your idea in your own words and get a custom one, checked and ready to paste into TradingView.'],
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
    how_note: ['على الموبايل: تطبيق TradingView ممكن ما يكون فيه Pine Editor. افتح tradingview.com من متصفح اللابتوب، احفظ المؤشر مرّة وحدة، وبعدها بتلاقيه بالتطبيق تحت Indicators ← My scripts.', 'On mobile: the TradingView app may not include the Pine Editor. Open tradingview.com in a desktop browser, save the script once, then find it in the app under Indicators → My scripts.'],
    chk_title: ['افحص وصلّح كودي', 'Check and fix my code'],
    chk_p: ['الصق كود Pine Script كامل. الفحص فوري ومجاني، وإذا في أخطاء بتقدر تصلّحها بكبسة.', 'Paste a complete Pine Script. The check is instant and free; if it finds errors you can fix them with one click.'],
    chk_go: ['افحص الكود', 'Check the code'],
    cancel: ['إلغاء', 'Cancel'],
    copy: ['نسخ الكود', 'Copy code'], copied: ['انتسخ ✓', 'Copied ✓'], dl: ['تنزيل', 'Download'],
    show_all: ['عرض الكود كامل ▾', 'Show all code ▾'], show_less: ['إخفاء الكود ▴', 'Hide code ▴'],
    lines: ['سطر', 'lines'],
    b_ok: ['✓ انفحص · 0 أخطاء', '✓ Checked · 0 errors'],
    b_warn: ['⚠ بقي {n} ملاحظة', '⚠ {n} finding(s) left'],
    f_title: ['ملاحظات الفحص التلقائي', 'Automatic check findings'],
        a_how: ['كيف بحطّه بـ TradingView؟', 'How to add it to TradingView?'],
    a_err: ['طلع خطأ بـ TradingView؟', 'Error in TradingView?'],
    a_use: ['كمّل على هالنسخة', 'Continue from this version'],
    a_autofix: ['صلّح الملاحظات تلقائياً', 'Fix the findings automatically'],
    fix_p: ['انسخ رسالة الخطأ الحمرا من تحت الـ Pine Editor والصقها هون، وبيتصلّح الكود.', 'Copy the red error message from below the Pine Editor, paste it here, and the code gets fixed.'],
    fix_ph: ['مثال: Error at 23:5 Undeclared identifier "x"', 'Example: Error at 23:5 Undeclared identifier "x"'],
    fix_go: ['صلّح الخطأ', 'Fix the error'],
    fix_user: ['طلع هالخطأ بـ TradingView:', 'TradingView shows this error:'],
    fix_req: ['صلّح هالخطأ اللي طلع بـ TradingView.', 'Fix this error reported by TradingView.'],
    autofix_user: ['صلّح الملاحظات اللي لقاها الفحص التلقائي.', 'Fix the findings from the automatic check.'],
    tpl_user: ['⚡ مؤشر جاهز: ', '⚡ Ready indicator: '],
    tpl_hist: ['أعطيني المؤشر الجاهز: ', 'Give me the ready indicator: '],
    chk_user: ['🛠️ افحصلي هالكود ({n} سطر)', '🛠️ Check this code ({n} lines)'],
    chk_clean: ['الكود نضيف: الفحص التلقائي ما لقى ولا خطأ.', 'The code is clean: the automatic check found no errors.'],
    chk_bad: ['الفحص لقى {n} مشكلة بالكود. اضغط «صلّح الملاحظات تلقائياً» وبصلّحها.', 'The check found {n} problem(s). Press "Fix the findings automatically" to repair them.'],
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
    s_slow: ['المؤشرات الخاصة بتاخد عادةً بين نص دقيقة ودقيقتين، حسب حجمها. الجاهزة فورية.', 'Custom indicators usually take between half a minute and two minutes, depending on size. Ready ones are instant.'],
    took: ['⏱ {n} ث', '⏱ {n}s'],
    stopped: ['توقّف الطلب.', 'Request stopped.'],
    retry: ['جرّب مرة تانية', 'Try again'],
    e_idle: ['انقطع الاتصال قبل ما يخلص الطلب. جرّب مرة تانية.', 'The connection dropped before the request finished. Try again.'],
    e_conn: ['ما قدرت أوصل للسيرفر. تأكّد من النت وجرّب مرة تانية.', 'Could not reach the server. Check your connection and try again.'],
    e_empty: ['ما وصل ردّ كامل. جرّب مرة تانية.', 'No complete reply arrived. Try again.'],
    big: ['الملف كبير (أقصى شي 2MB).', 'File is too large (max 2MB).'],
    noimg: ['ما قدرت اقرأ الصورة.', 'Could not read the image.'],
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
    st_live: ['شغّال', 'active'], st_key: ['بدو مفتاح', 'needs key'], st_ready: ['جاهز', 'ready'],
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
    if (vars) for (var n in vars) s = s.split('{' + n + '}').join(String(vars[n]));
    return s;
  }
  function tplTitle(id) { for (var i = 0; i < TPL.length; i++) if (TPL[i].id === id) return TPL[i].title[L ? 'en' : 'ar']; return id; }

  /* ---------- elements ---------- */
  var appview = $('appview'), thread = $('thread'), wrap = $('wrap'), input = $('in'), sendBtn = $('send');
  var dot = $('dot'), stat = $('stat'), drawer = $('drawer'), scrim = $('scrim'), fileInput = $('file'), chipsEl = $('chips');
  var ctxBar = $('ctx'), ctxFile = $('ctxFile'), qe = $('qe'), toastEl = $('toast');
  var introHtml = $('intro') ? $('intro').outerHTML : '';

  /* ---------- state ---------- */
  var S = { msgs: [], cur: null, seq: 0 };
  var busy = false, ctl = null, pending = [], arts = [], statKey = 'st_ready', recRef = null;

  function save() {
    var msgs = S.msgs.slice(-30), cur = S.cur;
    if (cur && msgs.some(function (m) { return m.id === cur.id && m.code; })) cur = { id: cur.id, file: cur.file };
    var data = { v: 2, msgs: msgs, cur: cur, seq: S.seq };
    try { localStorage.setItem(STORE, JSON.stringify(data)); }
    catch (e) {
      // Storage full: keep the code of the three latest scripts only.
      try {
        var keep = 3;
        for (var i = data.msgs.length - 1; i >= 0; i--) { var m = data.msgs[i]; if (m.kind === 'script') { if (keep > 0) keep--; else { m = data.msgs[i] = Object.assign({}, m); m.code = ''; m.dropped = true; } } }
        localStorage.setItem(STORE, JSON.stringify(data));
      } catch (e2) {}
    }
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d && d.v === 2 && Array.isArray(d.msgs)) {
        S.msgs = d.msgs; S.cur = d.cur || null; S.seq = d.seq || d.msgs.length;
        if (S.cur && !S.cur.code) { var src = S.msgs.filter(function (m) { return m.id === S.cur.id && m.code; })[0]; S.cur = src ? { id: src.id, file: src.file, code: src.code } : null; }
      }
    } catch (e) {}
    try { localStorage.removeItem('nexus_convo'); localStorage.removeItem('brain_ind_convo'); } catch (e) {}
  }

  /* ---------- small helpers ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function rich(s) {
    var e = esc(s);
    e = e.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    e = e.replace(/`([^`\n]+)`/g, '<code style="background:rgba(255,255,255,.07);padding:1px 5px;border-radius:5px;direction:ltr;display:inline-block">$1</code>');
    return e;
  }
  function nearBottom() { return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 160; }
  function toBottom(force) { if (force || nearBottom()) wrap.scrollTop = wrap.scrollHeight; }
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('on'); }, 1600); }
  function copyText(s) {
    function fallback() {
      var ta = el('textarea'); ta.value = s; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s).catch(fallback);
    return fallback();
  }
  function download(name, content) {
    var bl = new Blob([content], { type: 'text/plain;charset=utf-8' }), u = URL.createObjectURL(bl), a = el('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 1500);
  }

  /* ---------- Pine highlighting (display only) ---------- */
  var TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b|#[0-9A-Fa-f]{6,8}\b)|(\b(?:if|else|for|to|by|in|while|switch|var|varip|import|export|type|method|enum|and|or|not|true|false|na|const|simple|series|int|float|bool|string|color|line|label|box|table|array|map|matrix)\b)|(\b(?:indicator|strategy|library|plot\w*|hline|fill|bgcolor|barcolor|alertcondition|alert|input|ta|math|str|request|array|label|line|box|table|color|strategy|syminfo|timeframe|barstate|time|map|matrix)(?:\.\w+)*(?=\s*\())/g;
  function hiLine(line) {
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
    var m = el('div', 'msg u'), av = el('div', 'av u', t('you')), col = el('div', 'col'), bub = el('div', 'bub');
    bub.setAttribute('dir', 'auto'); bub.textContent = text || '';
    (previews || []).forEach(function (src) { var im = el('img', 'att'); im.src = src; bub.appendChild(im); });
    col.appendChild(bub); m.appendChild(av); m.appendChild(col); thread.appendChild(m); toBottom(true);
  }
  function addShell() {
    clearIntro();
    var m = el('div', 'msg b'), av = el('div', 'av b', '∿'), col = el('div', 'col');
    m.appendChild(av); m.appendChild(col); thread.appendChild(m); toBottom(true);
    return col;
  }
  function addBubble(col, text, cls) {
    var b = el('div', 'bub' + (cls ? ' ' + cls : '')); b.setAttribute('dir', 'auto'); b.innerHTML = rich(text); col.appendChild(b); return b;
  }
  function renderError(col, text, retryFn) {
    col.innerHTML = '';
    var b = addBubble(col, '⚠️ ' + text, 'err');
    if (retryFn) { var r = el('button', 'btn2 retry', t('retry')); r.type = 'button'; r.onclick = function () { if (busy) return; col.parentNode.remove(); retryFn(); }; b.appendChild(document.createElement('br')); b.appendChild(r); }
    toBottom();
  }

  function Progress(col, firstKey) {
    var card = el('div', 'prog'), top = el('div', 'ptop'), sp = el('span', 'spin'), label = el('span', '', t(firstKey || 's_write')), tm = el('span', 'tm', '0:00');
    var list = el('ul'), tail = null, hint = null, t0 = Date.now(), codeBuf = '', lastLabel = label.textContent, self = this, first = true, coding = false;
    top.appendChild(sp); top.appendChild(label); top.appendChild(tm); card.appendChild(top); card.appendChild(list); col.appendChild(card);
    var timer = setInterval(function () {
      var s = Math.floor((Date.now() - t0) / 1000); tm.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
      if (s >= 20 && !hint && !self.quick) { hint = el('div', 'hintline', t('s_slow')); card.appendChild(hint); toBottom(); }
    }, 500);
    function step(text) {
      // The first (generic) label is replaced, later ones move to the done list.
      if (!first && lastLabel !== text) list.appendChild(el('li', '', lastLabel.replace(/…$/, '')));
      first = false; label.textContent = text; lastLabel = text; toBottom();
    }
    this.quick = false;
    this.stage = function (ev) {
      if (ev.id === 'start' || ev.id === 'write') return;
      coding = false;
      if (ev.id === 'think') return step(t('s_think'));
      if (ev.id === 'template') return step(t('s_tpl', { x: tplTitle(ev.template) }));
      if (ev.id === 'edit') return step(t('s_edit'));
      if (ev.id === 'continue') return step(t('s_cont'));
      if (ev.id === 'check') {
        if (tail) { tail.remove(); tail = null; }
        var bad = (ev.errors || 0) + (ev.warnings || 0) > 0;
        return step(bad ? t('s_check_bad', { e: ev.errors || 0, w: ev.warnings || 0 }) : t('s_check_ok'));
      }
      if (ev.id === 'fix') return step(t('s_fix', { n: ev.round || 1 }));
    };
    this.code = function (d) {
      codeBuf += d;
      var lines = codeBuf.split('\n');
      if (!tail) { tail = el('div', 'tail'); card.insertBefore(tail, hint); }
      tail.textContent = lines.slice(-6).join('\n');
      var txt = t('s_code', { n: lines.length });
      if (!coding) { coding = true; step(txt); } else { label.textContent = txt; lastLabel = txt; }
      toBottom();
    };
    this.label = function (text) { step(text); };
    this.done = function () { clearInterval(timer); card.remove(); return Math.round((Date.now() - t0) / 1000); };
  }

  function refreshCurrent() {
    arts.forEach(function (a) { a.use.style.display = (S.cur && S.cur.id === a.msg.id) || !a.msg.code ? 'none' : ''; });
    if (S.cur && S.cur.code) { ctxBar.classList.add('on'); ctxFile.textContent = S.cur.file || 'script.pine'; input.placeholder = t('ph_edit'); }
    else { ctxBar.classList.remove('on'); input.placeholder = t('ph_in'); }
  }

  function renderScript(col, msg) {
    if (msg.explain) addBubble(col, msg.explain);
    var rep = msg.report || null, verified = !!(rep && rep.verified);
    var findings = rep ? (rep.errors || []).concat(rep.warnings || []) : [];
    var art = el('div', 'art'), bar = el('div', 'bar');
    bar.appendChild(el('span', 'fn', msg.file || 'script.pine'));
    if (rep) bar.appendChild(el('span', 'badge ' + (verified ? 'ok' : 'warn'), verified ? t('b_ok') : t('b_warn', { n: Math.max(1, findings.length + (rep.unappliedEdits || 0)) })));
    var nLines = String(msg.code || '').replace(/\n$/, '').split('\n').length;
    bar.appendChild(el('span', 'meta', nLines + ' ' + t('lines')));
    var sp = el('span', 'sp'), bCopy = el('button', 'btn2 pri', t('copy')), bDl = el('button', 'btn2', t('dl'));
    bCopy.type = bDl.type = 'button'; sp.appendChild(bCopy); sp.appendChild(bDl); bar.appendChild(sp); art.appendChild(bar);

    var cw = el('div', 'codewrap closed'), pre = el('pre'), more = el('button', 'more', t('show_all'));
    more.type = 'button'; pre.innerHTML = hiCode(msg.code); cw.appendChild(pre); cw.appendChild(more); art.appendChild(cw);
    if (nLines <= 12) { cw.classList.remove('closed'); more.style.display = 'none'; }

    if (findings.length) {
      var fd = el('div', 'findings'); fd.appendChild(el('div', 'ft', t('f_title')));
      var ol = el('ol');
      findings.slice(0, 8).forEach(function (f) { var li = el('li'); li.innerHTML = '<b>Line ' + esc(f.line) + ':</b> ' + esc(f.message); ol.appendChild(li); });
      fd.appendChild(ol); art.appendChild(fd);
    }

    var foot = el('div', 'foot');
    var bFixAuto = el('button', 'btn2 pri', t('a_autofix')), bHow = el('button', 'btn2', t('a_how')), bErr = el('button', 'btn2', t('a_err')), bUse = el('button', 'btn2', t('a_use'));
    bFixAuto.type = bHow.type = bErr.type = bUse.type = 'button';
    if (rep && !verified) foot.appendChild(bFixAuto);
    foot.appendChild(bHow); foot.appendChild(bErr); foot.appendChild(bUse);
    if (msg.ms) foot.appendChild(el('span', 'tm', t('took', { n: Math.round(msg.ms / 1000) })));
    art.appendChild(foot);

    var fx = el('div', 'fixbox'), fp = el('p', '', t('fix_p')), fta = el('textarea'), frow = el('div', 'row'), fgo = el('button', 'btn2 pri', t('fix_go')), fno = el('button', 'btn2', t('cancel'));
    fta.placeholder = t('fix_ph'); fta.spellcheck = false; fgo.type = fno.type = 'button';
    frow.appendChild(fgo); frow.appendChild(fno); fx.appendChild(fp); fx.appendChild(fta); fx.appendChild(frow); art.appendChild(fx);

    bCopy.onclick = function () { copyText(msg.code).then(function () { bCopy.textContent = t('copied'); toast(t('copied')); setTimeout(function () { bCopy.textContent = t('copy'); }, 1400); }).catch(function () { cw.classList.remove('closed'); more.textContent = t('show_less'); }); };
    bDl.onclick = function () { download(msg.file || 'script.pine', msg.code); };
    more.onclick = function () { var closed = cw.classList.toggle('closed'); more.textContent = closed ? t('show_all') : t('show_less'); };
    bHow.onclick = function () { openModal('howModal'); };
    bErr.onclick = function () { fx.classList.toggle('on'); if (fx.classList.contains('on')) { try { fx.scrollIntoView({ block: 'nearest' }); } catch (e) {} fta.focus(); } };
    fno.onclick = function () { fx.classList.remove('on'); };
    fgo.onclick = function () { var v = fta.value.trim(); if (!v || busy) return; fx.classList.remove('on'); fta.value = ''; runFix(msg, v); };
    bFixAuto.onclick = function () { if (busy) return; runFix(msg, ''); };
    bUse.onclick = function () { S.cur = { id: msg.id, code: msg.code, file: msg.file }; save(); refreshCurrent(); toast(msg.file || ''); };

    col.appendChild(art);
    arts.push({ msg: msg, use: bUse });
    refreshCurrent(); toBottom();
  }

  function renderAll() {
    thread.innerHTML = ''; arts = [];
    if (!S.msgs.length) { thread.innerHTML = introHtml; i18nDom(thread); buildIntro(); refreshCurrent(); return; }
    S.msgs.forEach(function (m) {
      if (m.r === 'u') addUser(m.text + (m.imgs ? '  📎' + (m.imgs > 1 ? '×' + m.imgs : '') : ''));
      else { var col = addShell(); if (m.kind === 'script' && m.code) renderScript(col, m); else addBubble(col, m.explain || '…'); }
    });
    refreshCurrent(); toBottom(true);
  }

  /* ---------- intro, drawer, context bar ---------- */
  function buildIntro() {
    var grid = $('tgrid'), sug = $('sug');
    if (grid) {
      grid.innerHTML = '';
      TPL.forEach(function (tp) {
        var b = el('button', 'tcard'); b.type = 'button';
        b.innerHTML = '<span class="ti">' + esc(tp.icon) + '</span><span><b>' + esc(tp.title[L ? 'en' : 'ar']) + '</b><small>' + esc(tp.blurb[L ? 'en' : 'ar']) + '</small></span>';
        b.onclick = function () { useTemplate(tp.id); };
        grid.appendChild(b);
      });
    }
    if (sug) {
      sug.innerHTML = '';
      SUG.forEach(function (s) { var b = el('button', '', s[L]); b.type = 'button'; b.onclick = function () { input.value = s[L]; submit(); }; sug.appendChild(b); });
    }
  }
  function buildDrawer() {
    var box = $('dwTpl'); if (!box) return; box.innerHTML = '';
    TPL.forEach(function (tp) {
      var b = el('button'); b.type = 'button'; b.innerHTML = '<span class="em">' + esc(tp.icon) + '</span> <span>' + esc(tp.title[L ? 'en' : 'ar']) + '</span>';
      b.onclick = function () { closeDrawer(); useTemplate(tp.id); };
      box.appendChild(b);
    });
  }
  function buildQuick() {
    qe.innerHTML = '';
    [['q1', 'q1p'], ['q2', 'q2p'], ['q3', 'q3p']].forEach(function (q) {
      var b = el('button', 'cx', t(q[0])); b.type = 'button';
      b.onclick = function () { input.value = t(q[1]); input.focus(); grow(); };
      qe.appendChild(b);
    });
  }
  function i18nDom(root) {
    var yr = new Date().getFullYear();
    root.querySelectorAll('[data-i18n]').forEach(function (e) { var k = e.getAttribute('data-i18n'); if (I18N[k]) e.textContent = t(k).replace('{yr}', yr); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (e) { var k = e.getAttribute('data-i18n-html'); if (I18N[k]) e.innerHTML = t(k).replace('{yr}', yr); });
    root.querySelectorAll('[data-i18n-title]').forEach(function (e) { var k = e.getAttribute('data-i18n-title'); if (I18N[k]) e.title = t(k); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (e) { var k = e.getAttribute('data-i18n-ph'); if (I18N[k]) e.placeholder = t(k); });
  }
  function applyLang() {
    document.documentElement.lang = L ? 'en' : 'ar';
    document.documentElement.dir = L ? 'ltr' : 'rtl';
    i18nDom(document);
    var lbl = L ? 'ع' : 'EN'; ['langL', 'langA'].forEach(function (id) { var b = $(id); if (b) b.textContent = lbl; });
    stat.textContent = t(statKey);
    buildDrawer(); buildQuick(); renderLanding();
    renderAll();
    if (recRef) { try { recRef.lang = L ? 'en-US' : 'ar-SA'; } catch (e) {} }
  }
  function renderLanding() {
    var g = $('lgrid'); if (!g) return; g.innerHTML = '';
    TPL.forEach(function (tp) {
      var b = el('button', 'tcard'); b.type = 'button';
      b.innerHTML = '<span class="ti">' + esc(tp.icon) + '</span><span><b>' + esc(tp.title[L ? 'en' : 'ar']) + '</b><small>' + esc(tp.blurb[L ? 'en' : 'ar']) + '</small></span>';
      b.onclick = function () { launch(); useTemplate(tp.id); };
      g.appendChild(b);
    });
  }
  function toggleLang() { if (busy) return; L = L ? 0 : 1; try { localStorage.setItem('nexus_lang', L ? 'en' : 'ar'); } catch (e) {} applyLang(); }

  function openDrawer() { drawer.classList.add('on'); scrim.classList.add('on'); }
  function closeDrawer() { drawer.classList.remove('on'); scrim.classList.remove('on'); }
  function openModal(id) { $(id).classList.add('on'); }
  function closeModals() { document.querySelectorAll('.modal.on').forEach(function (m) { m.classList.remove('on'); }); }

  /* ---------- attachments ---------- */
  function pickFile(accept) { fileInput.accept = accept || 'image/*,.pine,.txt,.pdf'; fileInput.value = ''; fileInput.click(); }
  function handleFile(f) {
    if (f.size > 2 * 1024 * 1024 && !/^image\//.test(f.type)) { toast(t('big')); return; }
    if (/^image\//.test(f.type)) resizeImage(f, 1280, function (b64) { pending.push({ kind: 'image', media_type: 'image/jpeg', data: b64, name: f.name, preview: 'data:image/jpeg;base64,' + b64 }); renderChips(); });
    else if (f.type === 'application/pdf') readB64(f, function (b64) { pending.push({ kind: 'document', media_type: 'application/pdf', data: b64, name: f.name }); renderChips(); });
    else { var r = new FileReader(); r.onload = function () { pending.push({ kind: 'text', name: f.name, text: String(r.result).slice(0, 60000) }); renderChips(); }; r.readAsText(f); }
  }
  function resizeImage(f, maxDim, cb) {
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () { var s = Math.min(1, maxDim / Math.max(img.width, img.height)), c = el('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); cb(c.toDataURL('image/jpeg', 0.82).split(',')[1]); };
    img.onerror = function () { URL.revokeObjectURL(url); toast(t('noimg')); };
    img.src = url;
  }
  function readB64(f, cb) { var r = new FileReader(); r.onload = function () { cb(String(r.result).split(',')[1]); }; r.readAsDataURL(f); }
  function renderChips() {
    chipsEl.innerHTML = '';
    pending.forEach(function (p, i) {
      var c = el('div', 'chip');
      if (p.kind === 'image') { var im = el('img'); im.src = p.preview; c.appendChild(im); } else c.appendChild(el('span', '', p.kind === 'document' ? '📄' : '📝'));
      c.appendChild(el('span', '', p.name || t('attach')));
      var x = el('span', 'x', '✕'); x.onclick = function () { pending.splice(i, 1); renderChips(); }; c.appendChild(x);
      chipsEl.appendChild(c);
    });
  }

  /* ---------- network ---------- */
  function setBusy(on) {
    busy = on; sendBtn.classList.toggle('stop', on); sendBtn.title = on ? t('t_stop') : t('t_send');
    sendBtn.firstChild.textContent = on ? '■' : '➤';
  }
  function apiMessages() {
    var out = [];
    S.msgs.forEach(function (m) {
      if (m.r === 'u') out.push({ role: 'user', content: m.api || m.text || '(attachment)' });
      else if (m.kind === 'script') out.push({ role: 'assistant', content: (m.explain || '') + '\n[script delivered: ' + (m.file || 'script.pine') + ']' });
      else if (m.kind === 'text') out.push({ role: 'assistant', content: m.explain || '' });
    });
    return out.slice(-12);
  }
  // Sends one request. onEvent receives NDJSON events; resolves with { json } for JSON replies, { legacy } for old engines.
  async function call(body, onEvent) {
    ctl = new AbortController();
    var last = Date.now(), started = Date.now(), reason = '';
    var guard = setInterval(function () {
      if (Date.now() - last > 75000 || Date.now() - started > 320000) { reason = 'idle'; try { ctl.abort(); } catch (e) {} }
    }, 3000);
    try {
      var r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') >= 0) return { json: await r.json() };
      if (!r.ok) { var he = new Error('http ' + r.status); he.status = r.status; throw he; }
      if (!r.body || !r.body.getReader) { var all = await r.text(); if (ct.indexOf('ndjson') >= 0) all.split('\n').forEach(feed); else return { legacy: all }; return {}; }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', raw = '', nd = ct.indexOf('ndjson') >= 0;
      for (;;) {
        var rd = await reader.read(); if (rd.done) break;
        last = Date.now();
        var chunk = dec.decode(rd.value, { stream: true });
        if (!nd) { raw += chunk; continue; }
        buf += chunk;
        var i; while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      if (nd) { if (buf.trim()) feed(buf); return {}; }
      return { legacy: raw };
    } catch (e) {
      if (reason === 'idle') { var er = new Error('idle'); er.idle = true; throw er; }
      throw e;
    } finally { clearInterval(guard); }
    function feed(line) { line = line.trim(); if (!line) return; var ev; try { ev = JSON.parse(line); } catch (e) { return; } onEvent(ev); }
  }
  function legacyToFinal(text) {
    var m = /```(?:pine|pinescript)?[ \t]*\n([\s\S]*?)```/.exec(text || '');
    if (!m || !/\/\/@version=/.test(m[1])) return { kind: 'text', explain: String(text || '').trim() };
    var code = m[1], fm = /^\s*\/\/\s*FILE:\s*(.+?)\s*$/im.exec(code), file = 'nexus_indicator.pine';
    if (fm) { file = fm[1].trim(); code = code.replace(fm[0], '').replace(/^\n/, ''); }
    return { kind: 'script', code: code.replace(/\s+$/, '') + '\n', file: file, explain: text.replace(m[0], '').trim(), report: null };
  }

  // Runs a model request (build or fix) and renders progress and the result. `retry` re-runs the same request.
  async function runModel(body, retry) {
    setBusy(true);
    var col = addShell(), prog = new Progress(col), fin = null, err = null;
    try {
      var res = await call(body, function (ev) {
        if (ev.t === 'stage') prog.stage(ev);
        else if (ev.t === 'code') prog.code(ev.d);
        else if (ev.t === 'final') fin = ev;
        else if (ev.t === 'error') err = ev.message;
      });
      if (res.json) { if (res.json.kind === 'error' || res.json.reply) err = res.json.message || res.json.reply; else fin = res.json; }
      else if (res.legacy != null) fin = legacyToFinal(res.legacy);
      if (!fin && !err) err = t('e_empty');
    } catch (e) {
      err = e && e.name === 'AbortError' && !e.idle ? null : e && e.idle ? t('e_idle') : e && e.status === 413 ? t('big') : t('e_conn');
      if (err === null) { prog.done(); col.innerHTML = ''; addBubble(col, t('stopped')); setBusy(false); return; }
    }
    var secs = prog.done();
    if (err) { renderError(col, err, retry); setBusy(false); return; }
    var msg;
    if (fin.kind === 'script' && fin.code) {
      msg = { r: 'a', kind: 'script', id: ++S.seq, explain: fin.explain || '', code: fin.code, file: fin.file || 'nexus_indicator.pine', title: fin.title || '', report: fin.report || null, base: fin.base || '', ms: fin.ms || secs * 1000 };
      S.cur = { id: msg.id, code: msg.code, file: msg.file };
      S.msgs.push(msg); save(); renderScript(col, msg);
    } else {
      msg = { r: 'a', kind: 'text', explain: fin.explain || '…' };
      S.msgs.push(msg); save(); addBubble(col, msg.explain);
    }
    statKey = 'st_live'; dot.className = 'dot live'; stat.textContent = t(statKey);
    setBusy(false); toBottom(true);
  }

  /* ---------- actions ---------- */
  function submit() {
    if (busy) { if (ctl) { try { ctl.abort(); } catch (e) {} } return; }
    var text = input.value.trim();
    if (!text && !pending.length) return;
    var atts = pending.slice(), previews = atts.filter(function (a) { return a.kind === 'image'; }).map(function (a) { return a.preview; });
    var content = text, fileText = '';
    atts.forEach(function (a) { if (a.kind === 'text') fileText += '\nFile "' + a.name + '":\n' + a.text + '\n'; });
    var bin = atts.filter(function (a) { return a.kind !== 'text'; });
    var plain = (text || t('fromAtt')) + (fileText ? '\n' + fileText : '');
    if (bin.length) {
      content = bin.map(function (a) { return { type: a.kind === 'image' ? 'image' : 'document', source: { type: 'base64', media_type: a.media_type, data: a.data } }; });
      content.push({ type: 'text', text: plain });
    } else content = plain;
    input.value = ''; grow(); pending = []; renderChips();
    addUser(text || '(' + t('attach') + ')', previews);
    S.msgs.push({ r: 'u', text: text || t('fromAtt'), api: fileText ? plain.slice(0, 4000) : undefined, imgs: bin.length || undefined });
    save();
    var go = function () {
      var msgs = apiMessages(); msgs[msgs.length - 1] = { role: 'user', content: content };
      runModel({ v: 2, mode: 'build', lang: L ? 'en' : 'ar', messages: msgs, code: S.cur && S.cur.code ? S.cur.code : '', file: S.cur && S.cur.code ? S.cur.file : undefined }, go);
    };
    go();
  }
  function runFix(msg, tvError) {
    var shown = tvError ? t('fix_user') + '\n' + tvError : t('autofix_user');
    addUser(shown);
    S.msgs.push({ r: 'u', text: shown, api: tvError ? t('fix_req') : t('autofix_user') }); save();
    var go = function () {
      runModel({ v: 2, mode: 'fix', lang: L ? 'en' : 'ar', messages: apiMessages(), code: msg.code, file: msg.file, tvError: tvError || undefined }, go);
    };
    go();
  }
  async function quickCall(body, userText, histText, labelKey, toMsg) {
    if (busy) return;
    setBusy(true);
    addUser(userText);
    S.msgs.push({ r: 'u', text: userText, api: histText }); save();
    var col = addShell(), prog = new Progress(col, labelKey); prog.quick = true;
    var retry = function () { S.msgs.pop(); save(); var last = thread.lastElementChild; if (last && last.classList.contains('u')) last.remove(); quickCall(body, userText, histText, labelKey, toMsg); };
    try {
      var res = await call(body, function () {});
      prog.done();
      var j = res.json;
      if (!j || j.kind === 'error' || !j.code) { renderError(col, (j && j.message) || t('e_empty'), retry); setBusy(false); return; }
      var msg = toMsg(j); msg.r = 'a'; msg.kind = 'script'; msg.id = ++S.seq;
      S.cur = { id: msg.id, code: msg.code, file: msg.file };
      S.msgs.push(msg); save(); renderScript(col, msg);
    } catch (e) { prog.done(); renderError(col, e && e.idle ? t('e_idle') : t('e_conn'), retry); }
    setBusy(false); toBottom(true);
  }
  function useTemplate(id) {
    var title = tplTitle(id);
    quickCall({ v: 2, mode: 'template', templateId: id, lang: L ? 'en' : 'ar' }, t('tpl_user') + title, t('tpl_hist') + title, 's_tplget', function (j) {
      return { explain: j.explain || '', code: j.code, file: j.file, title: j.title, report: j.report, base: j.base };
    });
  }
  function checkCode(code) {
    var n = code.replace(/\s+$/, '').split('\n').length;
    quickCall({ v: 2, mode: 'lint', code: code }, t('chk_user', { n: n }), t('chk_user', { n: n }), 's_lint', function (j) {
      var rep = j.report || {}, cnt = (rep.errors || []).length + (rep.warnings || []).length;
      return { explain: rep.verified ? t('chk_clean') : t('chk_bad', { n: Math.max(1, cnt) }), code: j.code, file: 'my_script.pine', title: '', report: rep, base: 'paste' };
    });
  }
  function tool(name) {
    closeDrawer();
    var cur = S.cur && S.cur.code;
    if (name === 'how') return openModal('howModal');
    if (name === 'check') { openModal('checkModal'); setTimeout(function () { $('checkIn').focus(); }, 50); return; }
    if (name === 'image') { pickFile('image/*'); input.value = t('p_img'); }
    else if (name === 'file') { pickFile('.pine,.txt,.pdf,image/*'); input.value = t('p_file'); }
    else if (name === 'idea') input.value = t('p_idea');
    else if (name === 'strategy') input.value = cur ? t('p_strat_cur') : t('p_strat');
    else if (name === 'explain') { if (cur) { input.value = t('p_explain_cur'); submit(); return; } input.value = t('p_explain'); }
    input.focus(); grow();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
  }
  function newChat() {
    if (busy && ctl) { try { ctl.abort(); } catch (e) {} }
    S = { msgs: [], cur: null, seq: 0 }; pending = []; renderChips();
    try { localStorage.removeItem(STORE); } catch (e) {}
    renderAll(); input.value = ''; grow(); input.focus();
  }
  function launch() { appview.classList.add('on'); if (!matchMedia('(pointer:coarse)').matches) input.focus(); }
  function home() { appview.classList.remove('on'); }
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; }

  /* ---------- wiring ---------- */
  $('menu').onclick = openDrawer;
  scrim.onclick = closeDrawer;
  $('newchat').onclick = newChat;
  if ($('home')) $('home').onclick = home;
  ['langL', 'langA'].forEach(function (id) { var b = $(id); if (b) b.onclick = toggleLang; });
  $('ctxNew').onclick = function () { S.cur = null; save(); refreshCurrent(); input.focus(); };
  drawer.addEventListener('click', function (e) { var b = e.target.closest('button[data-tool]'); if (b) tool(b.getAttribute('data-tool')); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]') || (e.target.classList && e.target.classList.contains('modal'))) closeModals();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModals(); closeDrawer(); } });
  $('checkGo').onclick = function () { var v = $('checkIn').value; if (!v.trim() || busy) return; closeModals(); $('checkIn').value = ''; checkCode(v); };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); if (!busy) submit(); }
  });
  sendBtn.onclick = submit;
  $('att').onclick = function () { pickFile(); };
  fileInput.onchange = function () { var f = fileInput.files && fileInput.files[0]; if (f) handleFile(f); };
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [], got = false;
    for (var i = 0; i < items.length; i++) { if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) { handleFile(f); got = true; } } }
    if (got) { e.preventDefault(); appview.classList.add('on'); input.focus(); }
  });
  (function () {
    var mic = $('mic'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !mic) { if (mic) mic.style.display = 'none'; return; }
    var rec = new SR(); recRef = rec; rec.lang = L ? 'en-US' : 'ar-SA'; rec.interimResults = true; rec.continuous = true;
    var on = false, base = '';
    rec.onresult = function (e) { var tx = ''; for (var i = e.resultIndex; i < e.results.length; i++) tx += e.results[i][0].transcript; input.value = (base + ' ' + tx).trim(); grow(); };
    rec.onend = function () { on = false; mic.classList.remove('rec'); };
    rec.onerror = function () { on = false; mic.classList.remove('rec'); };
    mic.onclick = function () { if (on) { rec.stop(); return; } base = input.value; try { rec.start(); on = true; mic.classList.add('rec'); input.focus(); } catch (e) {} };
  })();

  /* engine status */
  fetch(ENDPOINT, { method: 'GET' }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.hasKey === false) { statKey = 'st_key'; dot.className = 'dot'; } else { statKey = 'st_live'; dot.className = 'dot live'; }
    stat.textContent = t(statKey);
  }).catch(function () { statKey = 'st_ready'; dot.className = 'dot'; stat.textContent = t(statKey); });

  /* auto-update: reload to the newest deployed version (never while busy or typing) */
  (function () {
    var myE = null;
    function chk() {
      try {
        fetch(location.pathname + '?_u=' + Date.now(), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
          var e = r.headers.get('etag') || r.headers.get('last-modified'); if (!e) return;
          if (myE === null) { myE = e; return; }
          if (e !== myE) { var typing = input.value.trim() || document.querySelector('.modal.on') || document.querySelector('.fixbox.on'); if (!busy && !typing) location.reload(); }
        }).catch(function () {});
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') chk(); });
    setInterval(chk, 180000); chk();
  })();

  window.NexusApp = { launch: launch, home: home, toggleLang: toggleLang, useTemplate: function (id) { launch(); useTemplate(id); }, demo: function () { launch(); useTemplate('smc'); } };

  load();
  applyLang();
})();
