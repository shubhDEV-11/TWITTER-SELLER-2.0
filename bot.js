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
const defaultData = { users: {}, stock: [], pendingTopup: {}, transactions: [] };
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
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
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

// -------------------- User Reply Buttons --------------------
bot.hears('🛒 Buy Account', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingBuyQty = true;
  await db.write();
  ctx.reply('🛒 How many Twitter accounts would you like to purchase? Please enter a number.');
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
  ctx.reply(`💰 Your wallet balance: ₹${(db.data.users[uid].wallet ?? 0).toFixed(2)}`, mainKeyboard);
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

// -------------------- Text Handler for Buy / Add Funds --------------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  const text = ctx.message.text.trim();

  // Ignore commands in this handler
  if (text.startsWith('/')) return;

  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };

  // Buying accounts
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(text);
    if (!qty || qty <= 0) return ctx.reply('❌ Please enter a valid number.');
    if (db.data.stock.length < qty) return ctx.reply(`❌ Only ${db.data.stock.length} account(s) in stock.`);
    const totalPrice = qty * PRICE_PER_ACCOUNT;
    if (db.data.users[uid].wallet < totalPrice) return ctx.reply('❌ Insufficient balance.');

    db.data.users[uid].wallet -= totalPrice;
    db.data.users[uid].totalSpent += totalPrice;

    const accounts = db.data.stock.splice(0, qty);
    await db.write();

    let msg = `✅ Payment of ₹${totalPrice.toFixed(2)} has been deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    accounts.forEach((acc, i) => {
      msg += `Account ${i + 1}:\n\`\`\`\n${acc.username}, ${acc.password}, ${acc.email}\n\`\`\`\n\n`;
    });

    ctx.reply(msg, { parse_mode: 'Markdown' });
    db.data.users[uid].expectingBuyQty = false;
    await db.write();
    return;
  }

  // Add funds
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(text);
    if (!amount || amount <= 0) return ctx.reply('❌ Enter a valid amount.');

    const qrText = `upi://pay?pa=${UPI_ID}&pn=Twitter Seller Bot&am=${amount}&cu=INR`;
    const qrPath = path.join(__dirname, `qr_${uid}.png`);
    await QRCode.toFile(qrPath, qrText);

    db.data.users[uid].expectingTopupAmount = false;
    db.data.pendingTopup[uid] = amount;
    await db.write();

    ctx.replyWithPhoto({ source: qrPath }, { caption: `💳 Scan QR to pay ₹${amount}` });
    ctx.reply('📸 After payment, send the screenshot here to verify.');
    return;
  }
});

// -------------------- Admin Commands --------------------
bot.command('addaccount', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');

  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!args) return ctx.reply('Usage: /addaccount username,password,email');

  const [username, password, email] = args.split(',');
  if (!username || !password || !email) return ctx.reply('❌ Please provide all fields as username,password,email');

  await db.read();
  db.data.stock.push({ username, password, email });
  await db.write();
  ctx.reply(`✅ Account added: ${username}, ${password}, ${email}`);
});

bot.command('list', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  await db.read();
  const users = Object.entries(db.data.users)
    .map(([id, u]) => `ID: ${id}, Wallet: ₹${(u.wallet ?? 0).toFixed(2)}, Spent: ₹${(u.totalSpent ?? 0).toFixed(2)}`)
    .join('\n');
  ctx.reply(`👥 Registered Users:\n\n${users || 'No users yet.'}`);
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if (!msg) return ctx.reply('❌ Usage: /broadcast <message>');

  await db.read();
  for (const uid of Object.keys(db.data.users)) {
    try { await bot.telegram.sendMessage(uid, msg); } catch(e) {}
  }
  ctx.reply(`✅ Broadcast sent to ${Object.keys(db.data.users).length} users`);
});

// -------------------- Express Server + Webhook --------------------
const app = express();

// Healthcheck for UptimeRobot
app.get('/', (req, res) => res.send('🟢 Bot is running'));

// Telegraf webhook handler
app.use(bot.webhookCallback(`/bot${TOKEN}`));

// Start server on Render-provided port
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
});
