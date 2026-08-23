# Alex V2

نسخة خاصة قابلة للتشغيل محلياً أو على سيرفر Node.js.

## الموجود الآن
- تسجيل دخول بكلمة مرور خاصة
- جلسة دخول مشفّرة
- Alex / Trading / Landscaping / Business / Files
- حفظ المحادثات محلياً في SQLite
- ذاكرة دائمة يدوية يتم حقنها في تعليمات Alex
- رفع وتحليل الصور
- قراءة PDF وDOCX وTXT وMD وCSV وJSON
- واجهة عربية Responsive للموبايل والكمبيوتر
- PWA manifest كبداية لتحويلها لتطبيق قابل للإضافة للشاشة الرئيسية

## تشغيلها على الكمبيوتر
1. ثبّت Node.js 20+.
2. فك الضغط وافتح Terminal داخل المجلد.
3. نفذ:
   npm install
4. انسخ `.env.example` إلى `.env.local`.
5. ضع:
   OPENAI_API_KEY=...
   ALEX_AI_PASSWORD=...
   ALEX_AI_SESSION_SECRET=...
6. نفذ:
   npm run dev
7. افتح http://localhost:3000

## إنشاء مفتاح session قوي
Mac/Linux:
  openssl rand -base64 48

Windows PowerShell:
  [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))

## النشر
هذه النسخة تستخدم SQLite محلياً. للنشر الدائم يفضل:
- VPS / Railway volume / Fly volume أو أي Node host بقرص دائم.
- أو نقل قاعدة البيانات إلى Supabase/Postgres في الإصدار التالي.

## ملاحظات أمان
- لا تضع OPENAI_API_KEY في الواجهة أو GitHub.
- لا ترفع `.env.local`.
- غيّر كلمة المرور والـ session secret قبل النشر.
- لا تربط تنفيذ صفقات تداول تلقائياً قبل إضافة صلاحيات وحدود مخاطر ومراجعة منفصلة.
