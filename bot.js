// bot.js
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- CONFIG ----------
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID, 10);
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ---------- LowDB Setup ----------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = { users: {}, stock: [], pendingTopup: {} };
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// ---------- Keyboards ----------
const mainKeyboard = Markup.keyboard([
  ['🛒 Buy Account', '📦 Check Stock'],
  ['💰 Wallet', '💳 Add Funds'],
  ['📩 Contact Admin']
]).resize();

// ---------- MOTIVATIONAL TIPS ----------
const tips = [
  "💡 Buy accounts now to dominate Twitter! 🚀",
  "🔥 Accounts are limited, grab yours! 🛒",
  "💎 Keep wallet topped up for instant access!",
  "✨ Every account purchased is a step closer to growth!"
];

function sendMotivationalTip(ctx) {
  const tip = tips[Math.floor(Math.random() * tips.length)];
  ctx.reply(tip);
}

// ---------- WELCOME ----------
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  await db.write();

  const welcome = [
    "✨✨✨ WELCOME ✨✨✨",
    "🎉 Ultimate Twitter Seller Bot 🎉",
    "🚀 Get premium accounts instantly 🚀",
    "💎 Manage wallet | Buy | Add Funds | Check Stock 💎"
  ];

  for (let i = 0; i < welcome.length; i++) {
    setTimeout(() => ctx.reply(welcome[i]), i * 600);
  }

  setTimeout(() => {
    ctx.reply("🔥 Main Menu:", mainKeyboard);
    sendMotivationalTip(ctx);
  }, welcome.length * 600 + 200);
});

// ---------- USER INTERACTIONS ----------
bot.hears('🛒 Buy Account', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingBuyQty = true;
  await db.write();
  ctx.reply('🛒 How many Twitter accounts would you like to purchase? Enter a number.');
});

bot.hears('📦 Check Stock', async (ctx) => {
  await db.read();
  ctx.reply(`📦 Current stock: ${db.data.stock.length} account(s) available.`, mainKeyboard);
  sendMotivationalTip(ctx);
});

bot.hears('💰 Wallet', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  ctx.reply(`💰 Your wallet balance: ₹${db.data.users[uid].wallet.toFixed(2)}`, mainKeyboard);
  sendMotivationalTip(ctx);
});

bot.hears('💳 Add Funds', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingTopupAmount = true;
  await db.write();
  ctx.reply('💳 Enter the amount you want to add to your wallet (e.g., 100)');
});

bot.hears('📩 Contact Admin', async (ctx) => {
  ctx.reply(
    '📩 Contact the admin:',
    Markup.inlineKeyboard([[Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]])
  );
});

// ---------- TEXT HANDLER ----------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  const msg = ctx.message.text.trim();
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };

  // BUY ACCOUNTS FLOW
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(msg);
    if (isNaN(qty) || qty <= 0) return ctx.reply('❌ Please enter a valid number.');
    if (db.data.stock.length < qty) return ctx.reply('❌ Not enough stock available.');
    const totalPrice = PRICE_PER_ACCOUNT * qty;
    if ((db.data.users[uid].wallet ?? 0) < totalPrice) return ctx.reply('❌ Insufficient wallet balance.');
    const accounts = db.data.stock.splice(0, qty);
    db.data.users[uid].wallet -= totalPrice;
    db.data.users[uid].totalSpent += totalPrice;
    await db.write();

    let msgAcc = `✅ Payment of ₹${totalPrice.toFixed(2)} has been deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    accounts.forEach((acc, i) => {
      msgAcc += `Account ${i + 1}:\n\`\`\`${acc.username}, ${acc.password}, ${acc.email}\`\`\`\n\n`;
    });
    ctx.reply(msgAcc, { parse_mode: 'Markdown', ...mainKeyboard.reply_markup });
    delete db.data.users[uid].expectingBuyQty;
    await db.write();
    return;
  }

  // ADD FUNDS FLOW
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(msg);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Enter a valid amount.');
    const txId = nanoid(6);
    db.data.pendingTopup[txId] = { uid, amount, screenshot: null };
    await db.write();
    // generate QR
    const upi = `upi://pay?pa=${UPI_ID}&pn=Twitter+Seller+Bot&am=${amount}&cu=INR`;
    const qrPath = path.join(__dirname, `${txId}.png`);
    await QRCode.toFile(qrPath, upi);
    ctx.replyWithPhoto({ source: qrPath }, { caption: `💳 Send this amount via UPI and forward screenshot.` });
    delete db.data.users[uid].expectingTopupAmount;
    await db.write();
    return;
  }
});

// ---------- PAYMENT SCREENSHOT ----------
bot.on('photo', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  // find latest pending topup for user
  const pending = Object.entries(db.data.pendingTopup).find(([k, v]) => v.uid == uid && !v.screenshot);
  if (!pending) return ctx.reply('❌ No pending topup found.');
  const [txId, data] = pending;
  const file_id = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  data.screenshot = file_id;
  await db.write();

  // forward to admin with inline buttons
  ctx.reply('✅ Screenshot received. Admin will verify shortly.');
  bot.telegram.sendPhoto(ADMIN_ID, file_id, {
    caption: `💳 Top-up Verification\nUser: ${ctx.from.username}\nChat ID: ${uid}\nAmount: ₹${data.amount}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Verify', callback_data: `verify_${txId}` },
          { text: '❌ Decline', callback_data: `decline_${txId}` }
        ]
      ]
    }
  });
});

// ---------- CALLBACK HANDLER ----------
bot.on('callback_query', async (ctx) => {
  await db.read();
  const data = ctx.callbackQuery.data;
  if (!data.startsWith('verify_') && !data.startsWith('decline_')) return;
  const txId = data.split('_')[1];
  const topup = db.data.pendingTopup[txId];
  if (!topup) return ctx.answerCbQuery('❌ Transaction not found or already processed.');

  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Only admin');

  if (data.startsWith('verify_')) {
    db.data.users[String(topup.uid)].wallet += topup.amount;
    delete db.data.pendingTopup[txId];
    await db.write();
    ctx.editMessageCaption(`✅ Verified\nUser: ${ctx.callbackQuery.from.username}\nAmount: ₹${topup.amount}`);
    bot.telegram.sendMessage(topup.uid, `✅ Your top-up of ₹${topup.amount} has been verified and added to your wallet.`);
  } else if (data.startsWith('decline_')) {
    delete db.data.pendingTopup[txId];
    await db.write();
    ctx.editMessageCaption(`❌ Declined\nUser: ${ctx.callbackQuery.from.username}\nAmount: ₹${topup.amount}`);
    bot.telegram.sendMessage(topup.uid, `❌ Your top-up of ₹${topup.amount} was declined by admin.`);
  }

  ctx.answerCbQuery();
});

// ---------- ADMIN COMMANDS ----------
bot.command('addaccount', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) return ctx.reply('❌ Usage: /addaccount username,password,email');
  const parts = args.split(',');
  if (parts.length !== 3) return ctx.reply('❌ Format: username,password,email');
  db.data.stock.push({ username: parts[0], password: parts[1], email: parts[2] });
  await db.write();
  ctx.reply(`✅ Account added. Total stock: ${db.data.stock.length}`);
});

bot.command('addaccounts', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const lines = ctx.message.text.split('\n').slice(1);
  let added = 0;
  lines.forEach(line => {
    const parts = line.split(',');
    if (parts.length === 3) { db.data.stock.push({ username: parts[0], password: parts[1], email: parts[2] }); added++; }
  });
  await db.write();
  ctx.reply(`✅ ${added} accounts added. Total stock: ${db.data.stock.length}`);
});

bot.command('listaccounts', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  if (db.data.stock.length === 0) return ctx.reply('📦 No accounts in stock.');
  let msg = '📦 Current Stock:\n\n';
  db.data.stock.forEach((acc, i) => msg += `${i + 1}. ${acc.username}, ${acc.password}, ${acc.email}\n`);
  ctx.reply(msg);
});

bot.command('list', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const users = Object.entries(db.data.users)
    .map(([id, u]) => `ID: ${id}, Wallet: ₹${(u.wallet ?? 0).toFixed(2)}, Spent: ₹${(u.totalSpent ?? 0).toFixed(2)}`)
    .join('\n');
  ctx.reply(`👥 Registered Users:\n\n${users || 'No users yet.'}`);
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply('❌ Usage: /broadcast <message>');
  for (const uid of Object.keys(db.data.users)) {
    try { await bot.telegram.sendMessage(uid, msg); } catch (e) { }
  }
  ctx.reply(`✅ Broadcast sent to ${Object.keys(db.data.users).length} users`);
});

// ---------- EXPRESS SERVER + WEBHOOK ----------
const app = express();
app.get('/', (req, res) => res.send('🟢 Bot is running'));
app.use(bot.webhookCallback(`/bot${TOKEN}`));
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
});

// ---------- LAUNCH BOT ----------
bot.launch({ webhook: { domain: WEBHOOK_URL, port: PORT, hookPath: `/bot${TOKEN}` } });
