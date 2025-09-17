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

// -------------------- CONFIG --------------------
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// -------------------- LOWDB --------------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = { users: {}, stock: [], pendingTopup: {}, transactions: [] };
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// -------------------- KEYBOARDS --------------------
const mainKeyboard = Markup.keyboard([
  ['🛒 Buy Account', '📦 Check Stock'],
  ['💰 Wallet', '💳 Add Funds'],
  ['📩 Contact Admin']
]).resize();

// -------------------- MOTIVATIONAL TIPS --------------------
const tips = [
  "💡 Tip: Buy accounts now to dominate Twitter! 🚀",
  "🔥 Hot Deal: Accounts are limited, grab yours! 🛒",
  "💎 Pro Tip: Keep your wallet topped up for instant access!",
  "✨ Motivation: Every account you buy is a step closer to Twitter growth!"
];
function sendTip(ctx) {
  const tip = tips[Math.floor(Math.random() * tips.length)];
  ctx.reply(tip);
}

// -------------------- START --------------------
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  await db.write();

  const welcome = [
    "✨✨✨ WELCOME ✨✨✨",
    "🎉 Ultimate Twitter Seller Bot 🎉",
    "🚀 Get premium accounts instantly 🚀",
    "💎 Manage wallet | Buy | Add Funds | Check Stock 💎",
  ];

  for (let i = 0; i < welcome.length; i++) {
    setTimeout(() => ctx.reply(welcome[i]), i * 500);
  }

  setTimeout(() => {
    ctx.reply("🔥 Main Menu:", mainKeyboard);
    sendTip(ctx);
  }, welcome.length * 500 + 200);
});

// -------------------- USER HANDLERS --------------------
bot.hears('🛒 Buy Account', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingBuyQty = true;
  await db.write();
  ctx.reply('🛒 How many Twitter accounts would you like to buy? Enter a number:');
});

bot.hears('📦 Check Stock', async (ctx) => {
  await db.read();
  ctx.reply(`📦 Current stock: ${db.data.stock.length} account(s) available.`, mainKeyboard);
  sendTip(ctx);
});

bot.hears('💰 Wallet', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  ctx.reply(`💰 Your wallet balance: ₹${(db.data.users[uid].wallet ?? 0).toFixed(2)}`, mainKeyboard);
  sendTip(ctx);
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
  ctx.reply('📩 Contact admin:', Markup.inlineKeyboard([
    [Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]
  ]));
});

// -------------------- MESSAGE HANDLER --------------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };

  const user = db.data.users[uid];

  // HANDLE BUY
  if (user.expectingBuyQty) {
    const qty = parseInt(ctx.message.text);
    if (!qty || qty <= 0) return ctx.reply('❌ Please enter a valid number.');
    if (db.data.stock.length < qty) return ctx.reply('❌ Not enough stock available.');
    const cost = PRICE_PER_ACCOUNT * qty;
    if (user.wallet < cost) return ctx.reply(`❌ Not enough balance. You need ₹${cost}`);
    const accounts = db.data.stock.splice(0, qty);
    user.wallet -= cost;
    user.totalSpent += cost;
    await db.write();

    let msg = `✅ Payment of ₹${cost.toFixed(2)} deducted.\nHere are your ${qty} account(s):\n\n`;
    accounts.forEach((a, i) => {
      msg += `Account ${i + 1}:\n\`\`\`\n${a.username}, ${a.password}, ${a.email}\n\`\`\`\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
    user.expectingBuyQty = false;
    await db.write();
    return;
  }

  // HANDLE ADD FUNDS
  if (user.expectingTopupAmount) {
    const amount = parseFloat(ctx.message.text);
    if (!amount || amount <= 0) return ctx.reply('❌ Please enter a valid amount.');
    const txid = nanoid(6);
    db.data.pendingTopup[txid] = { userId: uid, amount, username: ctx.from.username || ctx.from.first_name };
    await db.write();

    const qrData = `upi://pay?pa=${UPI_ID}&pn=Twitter Seller&am=${amount}&cu=INR`;
    const qrPath = path.join(__dirname, `qr_${txid}.png`);
    await QRCode.toFile(qrPath, qrData);

    await ctx.replyWithPhoto({ source: fs.createReadStream(qrPath) }, { caption: `💳 Pay ₹${amount} to ${UPI_ID}\nSend screenshot here after payment.` });
    user.expectingTopupAmount = false;
    await db.write();
    return;
  }
});

// -------------------- PAYMENT SCREENSHOT FORWARD --------------------
bot.on('photo', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  const user = db.data.users[uid];
  if (!user) return;

  const pending = Object.entries(db.data.pendingTopup).find(([txid, p]) => p.userId === uid);
  if (!pending) return ctx.reply('❌ No pending topup found.');

  const [txid, data] = pending;

  await bot.telegram.sendPhoto(
    ADMIN_ID,
    ctx.message.photo[ctx.message.photo.length - 1].file_id,
    {
      caption: `💳 Topup request from @${data.username} (ID: ${uid})\nAmount: ₹${data.amount}`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Verify', callback_data: `verify_${txid}` }],
          [{ text: '❌ Decline', callback_data: `decline_${txid}` }]
        ]
      }
    }
  );
  ctx.reply('✅ Screenshot sent to admin for verification.');
});

// -------------------- ADMIN CALLBACK --------------------
bot.on('callback_query', async (ctx) => {
  const uid = ctx.from.id;
  if (uid !== ADMIN_ID) return ctx.answerCbQuery('❌ Only admin');

  const data = ctx.callbackQuery.data;

  if (data.startsWith('verify_')) {
    const txid = data.split('_')[1];
    await db.read();
    const topup = db.data.pendingTopup[txid];
    if (!topup) return ctx.answerCbQuery('❌ Transaction not found');
    const user = db.data.users[topup.userId];
    user.wallet += topup.amount;
    delete db.data.pendingTopup[txid];
    await db.write();
    await ctx.editMessageCaption(`✅ Verified ₹${topup.amount} topup for @${topup.username}`);
    await bot.telegram.sendMessage(topup.userId, `✅ Your wallet has been credited with ₹${topup.amount}`);
    return;
  }

  if (data.startsWith('decline_')) {
    const txid = data.split('_')[1];
    await db.read();
    const topup = db.data.pendingTopup[txid];
    if (!topup) return ctx.answerCbQuery('❌ Transaction not found');
    delete db.data.pendingTopup[txid];
    await db.write();
    await ctx.editMessageCaption(`❌ Declined ₹${topup.amount} topup for @${topup.username}`);
    await bot.telegram.sendMessage(topup.userId, `❌ Your wallet topup of ₹${topup.amount} was declined`);
    return;
  }
});

// -------------------- ADMIN COMMANDS --------------------
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
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  // Format: username,password,email
  const [username, password, email] = text.split(',');
  if (!username || !password || !email) return ctx.reply('❌ Usage: /addaccount username,password,email');
  await db.read();
  db.data.stock.push({ username, password, email });
  await db.write();
  ctx.reply(`✅ Account added: ${username}`);
});

// -------------------- EXPRESS + WEBHOOK --------------------
const app = express();
app.get('/', (req, res) => res.send('🟢 Bot is running'));
app.use(bot.webhookCallback(`/bot${TOKEN}`));
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
});
