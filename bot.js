// bot.js
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0', 10);
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// -------------------- LowDB Setup --------------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = {
  users: {},
  stock: [],
  pendingTopup: {},
  transactions: []
};
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// -------------------- Keyboards --------------------
const mainKeyboard = Markup.keyboard([
  ['🛒 Buy Account', '📦 Check Stock'],
  ['💰 Wallet', '💳 Add Funds'],
  ['📩 Contact Admin']
]).resize();

// -------------------- Motivational Tips --------------------
const tips = [
  "💡 Tip: Buy accounts now to dominate Twitter! 🚀",
  "🔥 Hot Deal: Accounts are limited, grab yours! 🛒",
  "💎 Pro Tip: Keep your wallet topped up for instant access!",
  "✨ Motivation: Every account you buy is a step closer to Twitter growth!"
];
function sendMotivationalTip(ctx) {
  const tip = tips[Math.floor(Math.random() * tips.length)];
  ctx.reply(tip);
}

// -------------------- Fancy Welcome --------------------
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  await db.write();

  const welcomeAnimation = [
    "✨✨✨ WELCOME ✨✨✨",
    "🎉 Ultimate Twitter Seller Bot 🎉",
    "🚀 Get premium accounts instantly 🚀",
    "💎 Manage wallet | Buy | Add Funds | Check Stock 💎",
  ];

  for (let i = 0; i < welcomeAnimation.length; i++) {
    setTimeout(() => ctx.reply(welcomeAnimation[i]), i * 600);
  }

  setTimeout(() => {
    ctx.reply("🔥 Main Menu:", mainKeyboard);
    sendMotivationalTip(ctx);
  }, welcomeAnimation.length * 600 + 200);
});

// -------------------- Handle Buy / Add Funds --------------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };

  const text = ctx.message.text;

  // Expecting Buy Quantity
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(text);
    if (isNaN(qty) || qty <= 0) return ctx.reply('❌ Please enter a valid number.');

    db.data.users[uid].expectingBuyQty = false;
    await db.write();

    const totalCost = qty * PRICE_PER_ACCOUNT;
    if ((db.data.users[uid].wallet || 0) < totalCost) {
      return ctx.reply(`❌ Insufficient balance. You need ₹${totalCost} but have ₹${db.data.users[uid].wallet || 0}.`, mainKeyboard);
    }

    if ((db.data.stock.length || 0) < qty) return ctx.reply(`❌ Only ${db.data.stock.length} account(s) in stock.`, mainKeyboard);

    db.data.users[uid].wallet -= totalCost;
    db.data.users[uid].totalSpent += totalCost;

    let message = `✅ Payment of ₹${totalCost.toFixed(2)} deducted from wallet.\n\nHere are your ${qty} account(s):\n\n`;
    for (let i = 0; i < qty; i++) {
      const acc = db.data.stock.shift();
      message += `Account ${i + 1}:\n\`\`\`\n${acc.username}, ${acc.password}, ${acc.email}\n\`\`\`\n\n`;
    }

    await db.write();
    return ctx.replyWithMarkdownV2(message, mainKeyboard);
  }

  // Expecting Topup Amount
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Enter a valid amount.');

    db.data.users[uid].expectingTopupAmount = false;
    const txId = 'TX' + Date.now();
    db.data.pendingTopup[txId] = { uid, amount, verified: false };
    await db.write();

    const upiURL = `upi://pay?pa=${UPI_ID}&pn=Twitter Seller Bot&cu=INR&am=${amount}`;
    const qrPath = path.join(__dirname, `${txId}.png`);
    await QRCode.toFile(qrPath, upiURL);

    await ctx.replyWithPhoto({ source: fs.createReadStream(qrPath) }, { caption: `💳 Send ₹${amount} to UPI ${UPI_ID}\n📸 After payment, send screenshot here.` });
    fs.unlinkSync(qrPath);
    return;
  }

  // Reply Buttons
  switch (text) {
    case '🛒 Buy Account':
      db.data.users[uid].expectingBuyQty = true;
      await db.write();
      return ctx.reply('🛒 How many Twitter accounts would you like to purchase?');
    case '💳 Add Funds':
      db.data.users[uid].expectingTopupAmount = true;
      await db.write();
      return ctx.reply('💳 Enter the amount you want to add.');
    case '📦 Check Stock':
      return ctx.reply(`📦 Current stock: ${db.data.stock.length} account(s).`, mainKeyboard);
    case '💰 Wallet':
      return ctx.reply(`💰 Wallet balance: ₹${(db.data.users[uid].wallet || 0).toFixed(2)}`, mainKeyboard);
    case '📩 Contact Admin':
      return ctx.reply('📩 Contact admin:', Markup.inlineKeyboard([[Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]]));
  }
});

// -------------------- Handle Payment Screenshots --------------------
bot.on('photo', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();

  const pendingTx = Object.entries(db.data.pendingTopup).find(([txId, tx]) => tx.uid === uid && !tx.verified);
  if (!pendingTx) return ctx.reply('❌ No pending top-up found.');

  const [txId, tx] = pendingTx;

  const caption = `💳 New Topup Request\n\nUser: ${ctx.from.username || ctx.from.first_name}\nChat ID: ${uid}\nAmount: ₹${tx.amount}\n\nClick ✅ to verify or ❌ to decline.`;

  await ctx.telegram.sendPhoto(ADMIN_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
    caption,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Verify', callback_data: `verify_${txId}` }, { text: '❌ Decline', callback_data: `decline_${txId}` }]
      ]
    }
  });

  ctx.reply('✅ Screenshot sent to admin for verification.');
});

// -------------------- Handle Admin Inline Buttons --------------------
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  await db.read();

  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Only admin');

  if (data.startsWith('verify_')) {
    const txId = data.split('_')[1];
    const tx = db.data.pendingTopup[txId];
    if (!tx || tx.verified) return ctx.answerCbQuery('❌ Already processed');

    const uid = tx.uid;
    db.data.users[uid].wallet += tx.amount;
    tx.verified = true;
    await db.write();

    await ctx.editMessageCaption(`✅ Payment verified.\nUser: ${uid}\nAmount: ₹${tx.amount}`);
    await bot.telegram.sendMessage(uid, `✅ Your payment of ₹${tx.amount} has been verified and added to your wallet.`, mainKeyboard);
    return ctx.answerCbQuery('✅ Verified');
  }

  if (data.startsWith('decline_')) {
    const txId = data.split('_')[1];
    const tx = db.data.pendingTopup[txId];
    if (!tx || tx.verified) return ctx.answerCbQuery('❌ Already processed');

    delete db.data.pendingTopup[txId];
    await db.write();

    await ctx.editMessageCaption(`❌ Payment declined.\nUser: ${tx.uid}\nAmount: ₹${tx.amount}`);
    await bot.telegram.sendMessage(tx.uid, `❌ Your payment of ₹${tx.amount} was declined.`, mainKeyboard);
    return ctx.answerCbQuery('❌ Declined');
  }
});

// -------------------- Admin Commands --------------------

// Add account
bot.command('addaccount', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');

  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply('❌ Usage: /addaccount username,password,email');

  const [username, password, email] = text.split(',');
  if (!username || !password || !email) return ctx.reply('❌ Invalid format. Use username,password,email');

  await db.read();
  db.data.stock.push({ username: username.trim(), password: password.trim(), email: email.trim() });
  await db.write();

  ctx.reply(`✅ Account added:\n${username}, ${password}, ${email}`);
});

// List accounts
bot.command('listaccounts', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  await db.read();
  if (db.data.stock.length === 0) return ctx.reply('📦 Stock is empty');
  const list = db.data.stock.map((a, i) => `${i + 1}. ${a.username}, ${a.password}, ${a.email}`).join('\n');
  ctx.reply(`📦 Stock:\n${list}`);
});

// Broadcast
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply('❌ Usage: /broadcast <message>');
  await db.read();
  let count = 0;
  for (const uid of Object.keys(db.data.users)) {
    try { await bot.telegram.sendMessage(uid, msg); count++; } catch (e) {}
  }
  ctx.reply(`✅ Broadcast sent to ${count} users`);
});

// List users
bot.command('list', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  await db.read();
  const users = Object.entries(db.data.users)
    .map(([id, u]) => `ID: ${id}, Wallet: ₹${(u.wallet || 0).toFixed(2)}, Spent: ₹${(u.totalSpent || 0).toFixed(2)}`)
    .join('\n');
  ctx.reply(`👥 Registered Users:\n\n${users || 'No users yet.'}`);
});

// -------------------- Express Server + Webhook --------------------
const app = express();
app.get('/', (req, res) => res.send('🟢 Bot is running'));
app.use(bot.webhookCallback(`/bot${TOKEN}`));

app.listen(PORT, async () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
  // Set webhook
  await bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${TOKEN}`);
});

