// bot.js
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import express from 'express';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------ ENV VARIABLES ------------------
const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

// ------------------ LOWDB SETUP ------------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = {
  users: {},          // { userId: {wallet:0,totalSpent:0,expectingBuyQty:false,expectingTopupAmount:false} }
  stock: [],          // [{username,password,email}]
  pendingTopup: {},   // {userId:{amount, messageId}}
  transactions: []    // {userId,amount,timestamp}
};
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// ------------------ BOT & EXPRESS ------------------
const bot = new Telegraf(TOKEN);
const app = express();

// Healthcheck
app.get('/', (req, res) => res.send('🟢 Bot is running'));

// Webhook
app.use(bot.webhookCallback(`/bot${TOKEN}`));
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${TOKEN}`);
});

// ------------------ KEYBOARDS ------------------
const mainKeyboard = Markup.keyboard([
  ['🛒 Buy Account', '📦 Check Stock'],
  ['💰 Wallet', '💳 Add Funds'],
  ['📩 Contact Admin']
]).resize();

// ------------------ WELCOME + MOTIVATION ------------------
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

bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  await db.write();

  const welcome = [
    "✨✨✨ WELCOME ✨✨✨",
    "🎉 Ultimate Twitter Seller Bot 🎉",
    "🚀 Get premium accounts instantly 🚀",
    "💎 Manage wallet | Buy | Add Funds | Check Stock 💎"
  ];

  for (let i = 0; i < welcome.length; i++) {
    setTimeout(() => ctx.reply(welcome[i]), i * 500);
  }

  setTimeout(() => {
    ctx.reply("🔥 Main Menu:", mainKeyboard);
    sendMotivationalTip(ctx);
  }, welcome.length * 500 + 200);
});

// ------------------ BUY ACCOUNT ------------------
bot.hears('🛒 Buy Account', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingBuyQty = true;
  await db.write();
  ctx.reply(`🛒 How many Twitter accounts do you want to purchase? Each costs ₹${PRICE_PER_ACCOUNT}. Please enter a number.`);
});

bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  const text = ctx.message.text;
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };

  // Handle Buy Account Quantity
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(text);
    if (isNaN(qty) || qty < 1) return ctx.reply('❌ Please enter a valid number.');
    if (db.data.stock.length < qty) return ctx.reply(`❌ Only ${db.data.stock.length} accounts available in stock.`);
    const totalCost = qty * PRICE_PER_ACCOUNT;
    if ((db.data.users[uid].wallet || 0) < totalCost) return ctx.reply(`❌ Insufficient wallet balance. You need ₹${totalCost}.`);

    // Deduct wallet
    db.data.users[uid].wallet -= totalCost;
    db.data.users[uid].totalSpent += totalCost;

    // Give accounts
    const accountsToSend = db.data.stock.splice(0, qty);
    let msg = `✅ Payment of ₹${totalCost.toFixed(2)} has been deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    accountsToSend.forEach((a, idx) => {
      msg += `Account ${idx + 1}:\n\`\`\`\n${a.username}, ${a.password}, ${a.email}\n\`\`\`\n\n`;
    });

    await db.write();
    ctx.replyWithMarkdownV2(msg, mainKeyboard);

    db.data.users[uid].expectingBuyQty = false;
    await db.write();
    return;
  }

  // Handle Add Funds Amount
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Please enter a valid amount.');
    const qrData = `upi://pay?pa=${UPI_ID}&pn=ShubhBot&am=${amount}&cu=INR`;
    const qrImagePath = path.join(__dirname, `qr_${uid}.png`);
    await QRCode.toFile(qrImagePath, qrData);
    const sent = await ctx.replyWithPhoto({ source: qrImagePath }, { caption: `💳 Send payment of ₹${amount} to UPI ID: ${UPI_ID} and reply with screenshot.` });
    db.data.users[uid].expectingTopupAmount = false;
    db.data.pendingTopup[uid] = { amount, messageId: sent.message_id };
    await db.write();
    return;
  }
});

// ------------------ CHECK STOCK ------------------
bot.hears('📦 Check Stock', async (ctx) => {
  await db.read();
  ctx.reply(`📦 Current stock: ${db.data.stock.length} account(s) available.`, mainKeyboard);
  sendMotivationalTip(ctx);
});

// ------------------ WALLET ------------------
bot.hears('💰 Wallet', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  ctx.reply(`💰 Your wallet balance: ₹${(db.data.users[uid].wallet).toFixed(2)}`, mainKeyboard);
  sendMotivationalTip(ctx);
});

// ------------------ ADD FUNDS ------------------
bot.hears('💳 Add Funds', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] ||= { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingTopupAmount = true;
  await db.write();
  ctx.reply('💳 Enter the amount you want to add to your wallet (e.g., 100)');
});

// ------------------ CONTACT ADMIN ------------------
bot.hears('📩 Contact Admin', async (ctx) => {
  ctx.reply('📩 Contact the admin:', Markup.inlineKeyboard([[Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]]));
});

// ------------------ PAYMENT SCREENSHOT HANDLING ------------------
bot.on('photo', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  if (!db.data.pendingTopup[uid]) return; // Not expecting payment
  const amount = db.data.pendingTopup[uid].amount;

  // Forward to admin with inline buttons
  const caption = `💳 Payment screenshot received\nUser: ${ctx.from.username || uid}\nChatID: ${uid}\nAmount: ₹${amount.toFixed(2)}`;
  const inline = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Verify', `verify_${uid}`), Markup.button.callback('❌ Decline', `decline_${uid}`)]
  ]);

  await ctx.telegram.sendPhoto(ADMIN_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, { caption, ...inline });
  ctx.reply('✅ Payment screenshot sent to admin for verification.');
});

// ------------------ ADMIN INLINE BUTTONS ------------------
bot.action(/verify_(\d+)/, async (ctx) => {
  const uid = ctx.match[1];
  await db.read();
  if (!db.data.pendingTopup[uid]) return ctx.answerCbQuery('❌ No pending payment.');
  const amount = db.data.pendingTopup[uid].amount;
  db.data.users[uid].wallet += amount;
  db.data.transactions.push({ userId: uid, amount, timestamp: Date.now() });
  delete db.data.pendingTopup[uid];
  await db.write();
  ctx.editMessageCaption(`✅ Payment of ₹${amount.toFixed(2)} verified and added to wallet.`);
  try { await bot.telegram.sendMessage(uid, `✅ Your wallet has been credited with ₹${amount.toFixed(2)}.`); } catch {}
});

bot.action(/decline_(\d+)/, async (ctx) => {
  const uid = ctx.match[1];
  await db.read();
  if (!db.data.pendingTopup[uid]) return ctx.answerCbQuery('❌ No pending payment.');
  delete db.data.pendingTopup[uid];
  await db.write();
  ctx.editMessageCaption(`❌ Payment declined.`);
  try { await bot.telegram.sendMessage(uid, `❌ Your payment was declined by admin.`); } catch {}
});

// ------------------ ADMIN COMMANDS ------------------
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
  let sent = 0;
  for (const uid of Object.keys(db.data.users)) {
    try { await bot.telegram.sendMessage(uid, msg); sent++; } catch {}
  }
  ctx.reply(`✅ Broadcast sent to ${sent} users`);
});

// ------------------ ADD ACCOUNTS VIA TXT/CSV ------------------
bot.on('document', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const fileId = ctx.message.document.file_id;
  const fileInfo = await ctx.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  let added = 0;
  await db.read();
  for (const line of lines) {
    const parts = line.includes(',') ? line.split(',') : line.split(' ');
    if (parts.length < 3) continue;
    db.data.stock.push({ username: parts[0].trim(), password: parts[1].trim(), email: parts[2].trim() });
    added++;
  }
  await db.write();
  ctx.reply(`✅ ${added} account(s) added to stock successfully.`);
});
