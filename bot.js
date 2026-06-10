const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SHEETS = {
  zebo: {
    name: 'Zebo',
    csvUrl: 'https://docs.google.com/spreadsheets/d/1dEE5NipUffWAE0rzrF26bhKOKP4KTtE_LZlyhusy8yU/export?format=csv&cachebust=' + Date.now()
  },
  noizma: {
    name: 'Noizma',
    csvUrl: 'https://docs.google.com/spreadsheets/d/17tPwSgr-jQKut2Gfznd7EsqW-0SVUBX3AdCZO6BdlnE/export?format=csv&cachebust=' + Date.now()
  }
};

// Oldin webhook va pending updatelarni tozalaymiz
async function clearAndStart() {
  try {
    await axios.get(`https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=true`);
    console.log('Webhook tozalandi');
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.log('Webhook tozalash xatosi:', e.message);
  }

  const bot = new TelegramBot(TOKEN, {
    polling: {
      interval: 1000,
      autoStart: true,
      params: { timeout: 10, allowed_updates: ['message'] }
    }
  });

  bot.on('polling_error', (err) => {
    console.error('Polling xato:', err.message);
    if (err.message.includes('409')) {
      console.log('409 conflict - 10 soniya kutib qayta ulanamiz...');
      setTimeout(() => {
        bot.stopPolling().then(() => {
          setTimeout(() => bot.startPolling(), 3000);
        });
      }, 10000);
    }
  });

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    }).filter(r => r['Ismi'] || r['1-Tel nomer']);
  }

  async function fetchSheet(key) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${key === 'zebo' ? '1dEE5NipUffWAE0rzrF26bhKOKP4KTtE_LZlyhusy8yU' : '17tPwSgr-jQKut2Gfznd7EsqW-0SVUBX3AdCZO6BdlnE'}/export?format=csv`;
      const res = await axios.get(url, { timeout: 15000 });
      return parseCSV(res.data);
    } catch(e) {
      console.error('Sheet o\'qish xatosi:', e.message);
      return null;
    }
  }

  async function fetchAll() {
    const [zebo, noizma] = await Promise.all([fetchSheet('zebo'), fetchSheet('noizma')]);
    return { zebo, noizma };
  }

  function calcStats(rows) {
    if (!rows) return null;
    const total = rows.length;
    const boglan = rows.filter(r => r["Bog'lanldimi?"] === 'Haa').length;
    const sifatli = rows.filter(r => r['Lead sifati'] === 'Sifatli').length;
    const sifatsiz = rows.filter(r => r['Lead sifati'] === 'Sifatsiz').length;
    const telOlmadi = rows.filter(r => (r['Izoh'] || '').toLowerCase().includes('tel omadi')).length;
    const qimmat = rows.filter(r => (r['Holati'] || '').toLowerCase().includes('qimmat')).length;
    const qaytaKerak = rows.filter(r => {
      const v = r["Qayta aloqa\n keremi?"] || r["Qayta aloqa keremi?"] || '';
      return v === 'Kerak';
    }).length;
    return { total, boglan, sifatli, sifatsiz, telOlmadi, qimmat, qaytaKerak };
  }

  async function askClaude(system, user) {
    try {
      const res = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: user }]
      }, {
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 30000
      });
      return res.data.content[0].text;
    } catch(e) {
      console.error('Claude xato:', e.response?.data || e.message);
      return null;
    }
  }

  function buildSystem(data) {
    const zs = calcStats(data.zebo);
    const ns = calcStats(data.noizma);
    return `Sen professional CRM va sales tahlilchisisisan. O'zbekistonda qurilish materiallari (penoplex, bazalt, minvata) sotadigan kompaniyaning community manager assistentisan.

ZEBO MA'LUMOTLARI:
Jami: ${zs?.total || 0} lead
Bog'langan: ${zs?.boglan || 0} (${zs ? Math.round(zs.boglan/zs.total*100) : 0}%)
Sifatli: ${zs?.sifatli || 0} | Sifatsiz: ${zs?.sifatsiz || 0}
Qayta aloqa kerak: ${zs?.qaytaKerak || 0}
Tel ko'tarmadi: ${zs?.telOlmadi || 0}
Narx e'tirozi: ${zs?.qimmat || 0}
Leadlar: ${JSON.stringify(data.zebo?.slice(0,20) || [])}

NOIZMA MA'LUMOTLARI:
Jami: ${ns?.total || 0} lead
Bog'langan: ${ns?.boglan || 0} (${ns ? Math.round(ns.boglan/ns.total*100) : 0}%)
Sifatli: ${ns?.sifatli || 0} | Sifatsiz: ${ns?.sifatsiz || 0}
Qayta aloqa kerak: ${ns?.qaytaKerak || 0}
Tel ko'tarmadi: ${ns?.telOlmadi || 0}
Narx e'tirozi: ${ns?.qimmat || 0}
Leadlar: ${JSON.stringify(data.noizma?.slice(0,20) || [])}

O'zbek tilida javob ber. Qisqa, aniq, professional. Telegram format (*bold*, _italic_). Raqamlarga asoslan.`;
  }

  bot.onText(/\/start/, msg => {
    bot.sendMessage(msg.chat.id,
      `👋 Assalomu alaykum, *${msg.from.first_name}*!\n\nMen sizning *Community Manager AI Assistentingizman*.\n\n📊 /hisobot — Kunlik to'liq tahlil\n👤 /zebo — Zebo tahlili\n👤 /noizma — Noizma tahlili\n🔄 /yangilash — Statistika\n\nYoki istalgan savol bering!`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/hisobot/, async msg => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '⏳ Sheets o\'qilmoqda...');
    const data = await fetchAll();
    if (!data.zebo && !data.noizma) return bot.sendMessage(chatId, '❌ Sheets o\'qib bo\'lmadi.');
    const answer = await askClaude(buildSystem(data), 'Zebo va Noizmaning bugungi kunlik to\'liq professional hisobotini ber. Har biri uchun: nechta lead, sifatli foizi, nima qildi, nima qilmadi, ball (10 dan). Oxirida umumiy xulosa.');
    if (!answer) return bot.sendMessage(chatId, '❌ AI javob bera olmadi. ANTHROPIC_API_KEY ni tekshiring.');
    bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/zebo/, async msg => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '⏳ Zebo ma\'lumotlari o\'qilmoqda...');
    const data = await fetchAll();
    const answer = await askClaude(buildSystem(data), 'Faqat ZEBO haqida batafsil professional tahlil ber. Kuchli tomonlari, zaif tomonlari, konkret misollar, tavsiyalar va ball.');
    if (!answer) return bot.sendMessage(chatId, '❌ AI javob bera olmadi.');
    bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/noizma/, async msg => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '⏳ Noizma ma\'lumotlari o\'qilmoqda...');
    const data = await fetchAll();
    const answer = await askClaude(buildSystem(data), 'Faqat NOIZMA haqida batafsil professional tahlil ber. Kuchli tomonlari, zaif tomonlari, konkret misollar, tavsiyalar va ball.');
    if (!answer) return bot.sendMessage(chatId, '❌ AI javob bera olmadi.');
    bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/yangilash/, async msg => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🔄 Yangilanmoqda...');
    const data = await fetchAll();
    const zs = calcStats(data.zebo);
    const ns = calcStats(data.noizma);
    bot.sendMessage(chatId,
      `✅ *Yangilandi!*\n\n*Zebo:* ${zs?.total || 0} lead (${zs?.sifatli || 0} sifatli)\n*Noizma:* ${ns?.total || 0} lead (${ns?.sifatli || 0} sifatli)\n\nJami: *${(zs?.total||0)+(ns?.total||0)} lead*`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('message', async msg => {
    if (msg.text && msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    if (!msg.text) return;
    bot.sendChatAction(chatId, 'typing');
    const data = await fetchAll();
    const answer = await askClaude(buildSystem(data), msg.text);
    if (!answer) return bot.sendMessage(chatId, '❌ AI javob bera olmadi. Qayta urinib ko\'ring.');
    bot.sendMessage(chatId, answer, { parse_mode: 'Markdown' });
  });

  console.log('🤖 Community Manager Bot ishga tushdi!');
}

clearAndStart();
