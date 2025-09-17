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

// -------------------- Handle Text Input --------------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };

  // Buy account flow
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(ctx.message.text);
    if (isNaN(qty) || qty <= 0) return ctx.reply('❌ Please enter a valid number');
    if (db.data.stock.length < qty) return ctx.reply(`❌ Only ${db.data.stock.length} accounts available in stock`);

    const totalCost = qty * PRICE_PER_ACCOUNT;
    if ((db.data.users[uid].wallet || 0) < totalCost) return ctx.reply(`❌ Insufficient balance. You need ₹${totalCost}`);

    // Deduct wallet
    db.data.users[uid].wallet -= totalCost;
    db.data.users[uid].totalSpent += totalCost;

    // Give accounts
    const accountsToGive = db.data.stock.splice(0, qty);
    await db.write();

    let msg = `✅ Payment of ₹${totalCost.toFixed(2)} has been deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    accountsToGive.forEach((acc, i) => {
      msg += `Account ${i + 1}:\n\`\`\`\n${acc.username}, ${acc.password}, ${acc.email}\n\`\`\`\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard });
    db.data.users[uid].expectingBuyQty = false;
    await db.write();
    return;
  }

  // Add funds flow
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Enter a valid amount');

    const txId = nanoid(6);
    db.data.pendingTopup[txId] = { uid, amount, verified: false };
    await db.write();

    const upiLink = `upi://pay?pa=${UPI_ID}&pn=SHUBHxAR&am=${amount}&cu=INR`;
    const qrPath = path.join(__dirname, `${txId}.png`);
    await QRCode.toFile(qrPath, upiLink);

    await ctx.replyWithPhoto({ source: qrPath }, { caption: `💳 Send ₹${amount} to UPI: ${UPI_ID}\nAfter payment, send screenshot here.\nTransaction ID: ${txId}` });
    fs.unlinkSync(qrPath);
    db.data.users[uid].expectingTopupAmount = false;
    await db.write();
    return;
  }
});

// -------------------- Handle Payment Screenshot --------------------
bot.on('photo', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();

  const pending = Object.entries(db.data.pendingTopup).find(([txId, tx]) => tx.uid === uid && !tx.verified);
  if (!pending) return ctx.reply('❌ No pending topup found.');

  const [txId, tx] = pending;
  const photo = ctx.message.photo.pop();
  const caption = `💳 Payment screenshot received\nUser: ${ctx.from.username || ctx.from.first_name}\nChat ID: ${uid}\nAmount: ₹${tx.amount}\nTransaction ID: ${txId}`;

  await bot.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
    caption,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Verify', callback_data: `verify_${txId}` }],
        [{ text: '❌ Decline', callback_data: `decline_${txId}` }]
      ]
    }
  });

  ctx.reply('✅ Screenshot forwarded to admin for verification');
});

// -------------------- Admin Verify/Decline --------------------
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  await db.read();

  if (data.startsWith('verify_')) {
    const txId = data.split('_')[1];
    const tx = db.data.pendingTopup[txId];
    if (!tx || tx.verified) return ctx.answerCbQuery('❌ Already processed');

    db.data.users[tx.uid].wallet += tx.amount;
    tx.verified = true;
    await db.write();

    await ctx.editMessageCaption(`✅ Payment verified.\nUser: ${tx.uid}\nAmount: ₹${tx.amount}`);
    await bot.telegram.sendMessage(tx.uid, `✅ Payment of ₹${tx.amount} added to your wallet.`, mainKeyboard);
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

bot.command('listaccounts', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  await db.read();
  if (db.data.stock.length === 0) return ctx.reply('📦 Stock is empty');
  const list = db.data.stock.map((a, i) => `${i + 1}. ${a.username}, ${a.password}, ${a.email}`).join('\n');
  ctx.reply(`📦 Stock:\n${list}`);
});

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
  await bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${TOKEN}`);
});
