const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ========== SOZLAMALAR ==========
const TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SHEETS = {
  zebo: {
    name: 'Zebo',
    id: '1dEE5NipUffWAE0rzrF26bhKOKP4KTtE_LZlyhusy8yU',
    csvUrl: 'https://docs.google.com/spreadsheets/d/1dEE5NipUffWAE0rzrF26bhKOKP4KTtE_LZlyhusy8yU/export?format=csv'
  },
  noizma: {
    name: 'Noizma',
    id: '17tPwSgr-jQKut2Gfznd7EsqW-0SVUBX3AdCZO6BdlnE',
    csvUrl: 'https://docs.google.com/spreadsheets/d/17tPwSgr-jQKut2Gfznd7EsqW-0SVUBX3AdCZO6BdlnE/export?format=csv'
  }
};
// ================================

const bot = new TelegramBot(TOKEN, { polling: { interval: 300, autoStart: true, params: { timeout: 10 } } });

// CSV parse
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// Sheets o'qish
async function fetchSheet(sheetKey) {
  try {
    const sheet = SHEETS[sheetKey];
    const res = await axios.get(sheet.csvUrl, { timeout: 15000 });
    const rows = parseCSV(res.data);
    return rows.filter(r => r['Ismi'] || r['1-Tel nomer']);
  } catch (e) {
    return null;
  }
}

// Ikkala sheet ham
async function fetchAllSheets() {
  const [zebo, noizma] = await Promise.all([
    fetchSheet('zebo'),
    fetchSheet('noizma')
  ]);
  return { zebo, noizma };
}

// Statistika hisoblash
function calcStats(rows) {
  if (!rows) return null;
  const total = rows.length;
  const boglan = rows.filter(r => r["Bog'lanldimi?"] === 'Haa').length;
  const sifatli = rows.filter(r => r['Lead sifati'] === 'Sifatli').length;
  const sifatsiz = rows.filter(r => r['Lead sifati'] === 'Sifatsiz').length;
  const qaytaKerak = rows.filter(r => {
    const v = r["Qayta aloqa\n keremi?"] || r["Qayta aloqa keremi?"] || '';
    return v === 'Kerak';
  }).length;
  const telOlmadi = rows.filter(r => (r['Izoh'] || '').toLowerCase().includes('tel omadi')).length;
  const qimmat = rows.filter(r => (r['Holati'] || '').toLowerCase().includes('qimmat')).length;
  const products = {};
  rows.forEach(r => {
    const p = r["Qaysi mahsulotga qiziqdi"] || '';
    if (p) {
      const key = p.toLowerCase().includes('bazalt') && p.toLowerCase().includes('penoplex') ? 'bazalt+penoplex'
        : p.toLowerCase().includes('bazalt') ? 'bazalt'
        : p.toLowerCase().includes('penoplex') || p.toLowerCase().includes('pinoplex') ? 'penoplex'
        : p.toLowerCase().includes('minvata') ? 'minvata' : p;
      if (key) products[key] = (products[key] || 0) + 1;
    }
  });
  return { total, boglan, sifatli, sifatsiz, qaytaKerak, telOlmadi, qimmat, products };
}

// AI ga so'rov
async function askClaude(systemPrompt, userMessage) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 30000
    });
    return res.data.content[0].text;
  } catch (e) {
    return 'AI javob bera olmadi. Qayta urinib ko\'ring.';
  }
}

// System prompt builder
function buildSystemPrompt(data) {
  const zs = calcStats(data.zebo);
  const ns = calcStats(data.noizma);

  return `Sen professional CRM va sales tahlilchisisisan. Siz O'zbekistonda qurilish materiallari (penoplex, bazalt, minvata) sotadigan kompaniyaning community manager assistentisiz.

HOZIRGI MA'LUMOTLAR (Google Sheets dan real vaqtda):

=== ZEBO (Manager) ===
Jami leadlar: ${zs?.total || 0}
Bog'langan: ${zs?.boglan || 0} (${zs ? Math.round(zs.boglan/zs.total*100) : 0}%)
Sifatli: ${zs?.sifatli || 0} | Sifatsiz: ${zs?.sifatsiz || 0}
Qayta aloqa kerak: ${zs?.qaytaKerak || 0}
Tel ko'tarmadi: ${zs?.telOlmadi || 0}
"Qimmat" e'tirozi: ${zs?.qimmat || 0}
Mahsulot qiziqishi: ${JSON.stringify(zs?.products || {})}

RAW LEADLAR (Zebo):
${JSON.stringify(data.zebo?.slice(0, 30) || [])}

=== NOIZMA (Manager) ===
Jami leadlar: ${ns?.total || 0}
Bog'langan: ${ns?.boglan || 0} (${ns ? Math.round(ns.boglan/ns.total*100) : 0}%)
Sifatli: ${ns?.sifatli || 0} | Sifatsiz: ${ns?.sifatsiz || 0}
Qayta aloqa kerak: ${ns?.qaytaKerak || 0}
Tel ko'tarmadi: ${ns?.telOlmadi || 0}
"Qimmat" e'tirozi: ${ns?.qimmat || 0}
Mahsulot qiziqishi: ${JSON.stringify(ns?.products || {})}

RAW LEADLAR (Noizma):
${JSON.stringify(data.noizma?.slice(0, 30) || [])}

QOIDALAR:
- O'zbek tilida javob ber
- Qisqa, aniq, professional bo'l
- Raqamlar va faktlarga asoslan
- Telegram formatida yoz (bold uchun *matn*, italic uchun _matn_)
- Zarur bo'lsa emoji ishlat
- Tavsiyalar konkret va amaliy bo'lsin`;
}

// Komandalar
bot.onText(/\/start/, async (msg) => {
  const name = msg.from.first_name || 'Boss';
  bot.sendMessage(msg.chat.id,
    `👋 Assalomu alaykum, *${name}*!\n\nMen sizning *Community Manager AI Assistentingizman*.\n\nNima qila olaman:\n📊 /hisobot — Kunlik to'liq tahlil\n👤 /zebo — Zebo tahlili\n👤 /noizma — Noizma tahlili\n🔄 /yangilash — Sheets yangilash\n\nYoki menga istalgan savol bering:\n_"Bugun nechta lead tushdi?"_\n_"Qaysi leadlarni qayta qo'ng'iroq kerak?"_\n_"Zebo yoki Noizma yaxshiroq ishladi?"_`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/hisobot/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '⏳ Sheets o\'qilmoqda, tahlil qilinmoqda...');

  const data = await fetchAllSheets();
  if (!data.zebo && !data.noizma) {
    return bot.sendMessage(chatId, '❌ Sheets o\'qib bo\'lmadi. Sheets public ekanligini tekshiring.');
  }

  const systemPrompt = buildSystemPrompt(data);
  const answer = await askClaude(systemPrompt,
    'Menga bugungi kunlik to\'liq hisobotni ber. Har bir manager (Zebo va Noizma) uchun: nechta lead, nechta sifatli, nima qildi, nima qilmadi, tavsiyalar. Oxirida umumiy xulosa va eng muhim 1 ta masala.'
  );

  bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
});

bot.onText(/\/zebo/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '⏳ Zebo sheets o\'qilmoqda...');

  const data = await fetchAllSheets();
  const systemPrompt = buildSystemPrompt(data);
  const answer = await askClaude(systemPrompt,
    'Faqat ZEBO haqida batafsil tahlil ber. Uning kuchli va zaif tomonlari, konkret misollar bilan.'
  );
  bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
});

bot.onText(/\/noizma/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '⏳ Noizma sheets o\'qilmoqda...');

  const data = await fetchAllSheets();
  const systemPrompt = buildSystemPrompt(data);
  const answer = await askClaude(systemPrompt,
    'Faqat NOIZMA haqida batafsil tahlil ber. Uning kuchli va zaif tomonlari, konkret misollar bilan.'
  );
  bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
});

bot.onText(/\/yangilash/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🔄 Sheets yangilanmoqda...');
  const data = await fetchAllSheets();
  const zs = calcStats(data.zebo);
  const ns = calcStats(data.noizma);
  bot.sendMessage(chatId,
    `✅ *Yangilandi!*\n\n*Zebo:* ${zs?.total || 0} lead (${zs?.sifatli || 0} sifatli)\n*Noizma:* ${ns?.total || 0} lead (${ns?.sifatli || 0} sifatli)\n\nJami: *${(zs?.total||0)+(ns?.total||0)} lead*`,
    { parse_mode: 'Markdown' }
  );
});

// Oddiy xabar — AI javob
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userText = msg.text;
  if (!userText) return;

  bot.sendChatAction(chatId, 'typing');

  const data = await fetchAllSheets();
  if (!data.zebo && !data.noizma) {
    return bot.sendMessage(chatId, '❌ Sheets o\'qib bo\'lmadi.');
  }

  const systemPrompt = buildSystemPrompt(data);
  const answer = await askClaude(systemPrompt, userText);
  bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
});

console.log('🤖 Community Manager Bot ishga tushdi!');
console.log('Komandalar: /hisobot /zebo /noizma /yangilash');
