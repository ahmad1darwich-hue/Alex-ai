# نشر Alex

## المتطلبات
تحتاج فقط إلى:
1. OpenAI API key
2. كلمة مرور خاصة لـ Alex
3. Session secret قوي
4. استضافة Node.js مع قرص دائم

## Environment Variables
ضع هذه القيم في الاستضافة:

OPENAI_API_KEY=...
ALEX_AI_PASSWORD=...
ALEX_AI_SESSION_SECRET=...
ALEX_AI_MODEL=gpt-5.5

## Docker
Build:
docker build -t alex-ai .

Run:
docker run -p 3000:3000 \
  -e OPENAI_API_KEY="..." \
  -e ALEX_AI_PASSWORD="..." \
  -e ALEX_AI_SESSION_SECRET="..." \
  -e ALEX_AI_MODEL="gpt-5.5" \
  -v alex_data:/app/data \
  alex-ai

## ملاحظة
قاعدة البيانات الحالية SQLite، لذلك يجب أن تكون الاستضافة بقرص دائم.
لنسخة سحابية متعددة الأجهزة بشكل أقوى، ننقل لاحقاً إلى Postgres/Supabase.
