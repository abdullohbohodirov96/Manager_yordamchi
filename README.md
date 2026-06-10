# 🤖 Community Manager Telegram Bot

## O'rnatish

### 1. Node.js o'rnating (agar yo'q bo'lsa)
```bash
# Ubuntu/Linux
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Mac
brew install node

# Windows
https://nodejs.org dan yuklab o'rnating
```

### 2. Papkaga o'ting va kutubxonalarni o'rnating
```bash
cd tgbot
npm install
```

### 3. Anthropic API Key oling
1. https://console.anthropic.com ga kiring
2. API Keys bo'limidan yangi key oling

### 4. Botni ishga tushiring
```bash
# Linux/Mac
ANTHROPIC_API_KEY=sk-ant-... node bot.js

# Windows CMD
set ANTHROPIC_API_KEY=sk-ant-...
node bot.js

# Windows PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-..."
node bot.js
```

## Komandalar
- `/start` — Botni boshlash
- `/hisobot` — Kunlik to'liq tahlil
- `/zebo` — Faqat Zebo tahlili
- `/noizma` — Faqat Noizma tahlili
- `/yangilash` — Sheets yangilash

## Istalgan savol
Bot istalgan savolga javob beradi, masalan:
- "Bugun nechta lead tushdi?"
- "Qaysi leadlarni qayta qo'ng'iroq kerak?"
- "Noizma yaxshimi Zebodan?"
- "Qimmat degan leadlarga nima deyish kerak?"

## MUHIM: Sheets public qilish
Google Sheets → Share → "Anyone with the link" → Viewer

## 24/7 serverda ishlatish (ixtiyoriy)
```bash
npm install -g pm2
pm2 start bot.js --name "cm-bot"
pm2 save
pm2 startup
```
