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

// -------------------- Handle Buy Account --------------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };

  const text = ctx.message.text;

  // Handle expecting buy quantity
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(text);
    if (isNaN(qty) || qty <= 0) return ctx.reply('❌ Please enter a valid number of accounts.');

    db.data.users[uid].expectingBuyQty = false;
    await db.write();

    const totalCost = qty * PRICE_PER_ACCOUNT;
    if ((db.data.users[uid].wallet || 0) < totalCost) {
      return ctx.reply(`❌ Insufficient balance. You need ₹${totalCost} but have ₹${db.data.users[uid].wallet || 0}.`, mainKeyboard);
    }

    if ((db.data.stock.length || 0) < qty) return ctx.reply(`❌ Only ${db.data.stock.length} account(s) in stock.`, mainKeyboard);

    // Deduct wallet and send accounts
    db.data.users[uid].wallet -= totalCost;
    db.data.users[uid].totalSpent += totalCost;

    let message = `✅ Payment of ₹${totalCost.toFixed(2)} has been deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    for (let i = 0; i < qty; i++) {
      const acc = db.data.stock.shift();
      message += `Account ${i + 1}:\n\`\`\`\nUSERNAME: ${acc.username}\nPASSWORD: ${acc.password}\nEMAIL: ${acc.email}\n\`\`\`\n\n`;
    }

    await db.write();
    ctx.replyWithMarkdownV2(message, mainKeyboard);
    return;
  }

  // Handle expecting topup amount
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

    await ctx.replyWithPhoto({ source: fs.createReadStream(qrPath) }, { caption: `💳 Send payment of ₹${amount} to UPI ID ${UPI_ID}\n\n📸 After sending, send the screenshot here.` });
    fs.unlinkSync(qrPath);
    return;
  }

  // Start Buy / Add Funds commands
  if (text === '🛒 Buy Account') {
    db.data.users[uid].expectingBuyQty = true;
    await db.write();
    return ctx.reply('🛒 How many Twitter accounts would you like to purchase? Please enter a number.');
  }

  if (text === '💳 Add Funds') {
    db.data.users[uid].expectingTopupAmount = true;
    await db.write();
    return ctx.reply('💳 Enter the amount you want to add to your wallet (e.g., 100)');
  }

  if (text === '📦 Check Stock') {
    return ctx.reply(`📦 Current stock: ${db.data.stock.length} account(s) available.`, mainKeyboard);
  }

  if (text === '💰 Wallet') {
    return ctx.reply(`💰 Your wallet balance: ₹${(db.data.users[uid].wallet || 0).toFixed(2)}`, mainKeyboard);
  }

  if (text === '📩 Contact Admin') {
    return ctx.reply(
      '📩 Contact the admin:',
      Markup.inlineKeyboard([[Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]])
    );
  }
});

// -------------------- Screenshot handling --------------------
bot.on('photo', async (ctx) => {
  const uid = String(ctx.from.id);
  if (!db.data.pendingTopup) return;

  const txEntry = Object.entries(db.data.pendingTopup).find(([txId, tx]) => tx.uid === uid && !tx.verified);
  if (!txEntry) return ctx.reply('❌ No pending top-up found.');

  const [txId, tx] = txEntry;
  // Forward to admin
  await ctx.telegram.forwardMessage(ADMIN_ID, uid, ctx.message.message_id);
  ctx.reply('✅ Screenshot sent to admin for verification. You will be notified once verified.');
});

// -------------------- Admin Commands --------------------
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

// -------------------- Express Server + Webhook --------------------
const app = express();
app.get('/', (req, res) => res.send('🟢 Bot is running'));
app.use(bot.webhookCallback(`/bot${TOKEN}`));
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
});
