// bot.js
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ---------------- LowDB Setup ----------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = { users: {}, stock: [], pendingTopup: {} };
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// ---------------- Keyboards ----------------
const mainKeyboard = Markup.keyboard([
  ['🛒 Buy Account', '📦 Check Stock'],
  ['💰 Wallet', '💳 Add Funds'],
  ['📩 Contact Admin']
]).resize();

// ---------------- Motivational Tips ----------------
const tips = [
  "💡 Tip: Buy accounts now to dominate Twitter! 🚀",
  "🔥 Hot Deal: Accounts are limited, grab yours! 🛒",
  "💎 Keep your wallet topped up for instant access!",
  "✨ Every account you buy is a step closer to Twitter growth!"
];

function sendMotivationalTip(ctx) {
  const tip = tips[Math.floor(Math.random() * tips.length)];
  ctx.reply(tip);
}

// ---------------- Welcome Animation ----------------
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
    setTimeout(() => ctx.reply(welcomeAnimation[i]), i * 500);
  }

  setTimeout(() => {
    ctx.reply("🔥 Main Menu:", mainKeyboard);
    sendMotivationalTip(ctx);
  }, welcomeAnimation.length * 500 + 200);
});

// ---------------- Reply Button Handlers ----------------
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

bot.hears('📩 Contact Admin', (ctx) => {
  ctx.reply(
    '📩 Contact the admin:',
    Markup.inlineKeyboard([[Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]])
  );
});

// ---------------- Text Message Handler ----------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  const text = ctx.message.text.trim();

  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };

  // Handle buying accounts
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(text);
    if (!qty || qty <= 0) return ctx.reply('❌ Please enter a valid number.');
    if (db.data.stock.length < qty) return ctx.reply(`❌ Only ${db.data.stock.length} account(s) in stock.`);
    const totalPrice = qty * PRICE_PER_ACCOUNT;
    if (db.data.users[uid].wallet < totalPrice) return ctx.reply('❌ Insufficient balance.');

    // Deduct wallet
    db.data.users[uid].wallet -= totalPrice;
    db.data.users[uid].totalSpent += totalPrice;

    // Give accounts
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

  // Handle add funds
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(text);
    if (!amount || amount <= 0) return ctx.reply('❌ Enter a valid amount.');
    const qrText = `upi://pay?pa=${UPI_ID}&pn=Twitter Seller Bot&am=${amount}&cu=INR`;
    const qrPath = path.join(__dirname, `qr_${uid}.png`);
    await QRCode.toFile(qrPath, qrText);

    // Forward payment screenshot to admin
    db.data.users[uid].expectingTopupAmount = false;
    db.data.pendingTopup[uid] = amount;
    await db.write();

    ctx.replyWithPhoto({ source: qrPath }, { caption: `💳 Scan QR to pay ₹${amount}` });
    ctx.reply('📸 After payment, send the screenshot here to verify.');
    return;
  }

  // Handle payment screenshot
  if (ctx.message.photo && db.data.pendingTopup[uid]) {
    const amount = db.data.pendingTopup[uid];
    const file_id = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    await bot.telegram.sendPhoto(
      ADMIN_ID,
      file_id,
      {
        caption: `💳 Payment screenshot from @${ctx.from.username || 'N/A'} (ID: ${uid}) Amount: ₹${amount}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Verify', callback_data: `verify_${uid}` }, { text: '❌ Decline', callback_data: `decline_${uid}` }]
          ]
        }
      }
    );
    ctx.reply('✅ Screenshot sent to admin for verification.');
    return;
  }
});

// ---------------- Callback Queries ----------------
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data) return;

  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Only admin');

  await db.read();

  if (data.startsWith('verify_')) {
    const uid = data.split('_')[1];
    const amount = db.data.pendingTopup[uid];
    if (!amount) return ctx.answerCbQuery('❌ Already processed');

    db.data.users[uid].wallet += amount;
    delete db.data.pendingTopup[uid];
    await db.write();

    ctx.editMessageCaption(`✅ Verified payment. ₹${amount} added to user wallet.`);
    await bot.telegram.sendMessage(uid, `✅ Your payment of ₹${amount} has been verified and added to your wallet.`);
  }

  if (data.startsWith('decline_')) {
    const uid = data.split('_')[1];
    delete db.data.pendingTopup[uid];
    await db.write();

    ctx.editMessageCaption(`❌ Payment declined.`);
    await bot.telegram.sendMessage(uid, `❌ Your payment has been declined by the admin.`);
  }
});

// ---------------- Admin Commands ----------------
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
    try { await bot.telegram.sendMessage(uid, msg); } catch (e) { }
  }
  ctx.reply(`✅ Broadcast sent to ${Object.keys(db.data.users).length} users`);
});

bot.command('addaccount', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  const parts = ctx.message.text.split(' ').slice(1).join(' ').split(',');
  if (parts.length < 3) return ctx.reply('❌ Usage: /addaccount username,password,email');
  const [username, password, email] = parts.map(p => p.trim());
  await db.read();
  db.data.stock.push({ username, password, email });
  await db.write();
  ctx.reply(`✅ Added account: ${username}, ${password}, ${email}`);
});

// ---------------- Express + Webhook ----------------
const app = express();
app.get('/', (req, res) => res.send('🟢 Bot is running'));
app.use(bot.webhookCallback(`/bot${TOKEN}`));
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
});
