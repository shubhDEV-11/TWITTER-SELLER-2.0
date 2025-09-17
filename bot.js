// bot.js
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0', 10);
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

// -------------------- MarkdownV2 Escape --------------------
function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// -------------------- LowDB Setup --------------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = {
  users: {},
  stock: [],
  pendingTopup: {},
  transactions: [],
  invalidInputWarn: {} // track invalid input once per day
};
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

// -------------------- Bot Setup --------------------
const bot = new Telegraf(TOKEN);

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
function sendTip(ctx) {
  const tip = tips[Math.floor(Math.random() * tips.length)];
  ctx.reply(tip);
}

// -------------------- Welcome --------------------
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  await db.write();

  const welcome = [
    "✨✨✨ WELCOME ✨✨✨",
    "🎉 Ultimate Twitter Seller Bot 🎉",
    "🚀 Get premium accounts instantly 🚀",
    "💎 Manage wallet | Buy | Add Funds | Check Stock 💎",
  ];

  for (let i = 0; i < welcome.length; i++) {
    setTimeout(() => ctx.reply(welcome[i]), i * 600);
  }

  setTimeout(() => {
    ctx.reply("🔥 Main Menu:", mainKeyboard);
    sendTip(ctx);
  }, welcome.length * 600 + 200);
});

// -------------------- Buy Account --------------------
bot.hears('🛒 Buy Account', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingBuyQty = true;
  await db.write();
  ctx.reply('🛒 How many Twitter accounts would you like to purchase? Enter a number.');
});

// -------------------- Check Stock --------------------
bot.hears('📦 Check Stock', async (ctx) => {
  await db.read();
  ctx.reply(`📦 Current stock: ${db.data.stock.length} account(s) available.`, mainKeyboard);
  sendTip(ctx);
});

// -------------------- Wallet --------------------
bot.hears('💰 Wallet', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  ctx.reply(`💰 Your wallet balance: ₹${(db.data.users[uid].wallet ?? 0).toFixed(2)}`, mainKeyboard);
  sendTip(ctx);
});

// -------------------- Add Funds --------------------
bot.hears('💳 Add Funds', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  db.data.users[uid].expectingTopupAmount = true;
  await db.write();
  ctx.reply('💳 Enter the amount you want to add to your wallet (e.g., 100)');
});

// -------------------- Contact Admin --------------------
bot.hears('📩 Contact Admin', async (ctx) => {
  ctx.reply(
    '📩 Contact the admin:',
    Markup.inlineKeyboard([[Markup.button.url('Message @SHUBHxAR', 'https://t.me/SHUBHxAR')]])
  );
});

// -------------------- Handle Messages --------------------
bot.on('text', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  const user = db.data.users[uid];

  // Buy account logic
  if (user.expectingBuyQty) {
    const qty = parseInt(ctx.message.text);
    const today = new Date().toDateString();
    if (isNaN(qty) || qty <= 0) {
      if (db.data.invalidInputWarn[uid] !== today) {
        db.data.invalidInputWarn[uid] = today;
        await db.write();
        return ctx.reply('❌ Please enter a valid number only once per day.');
      } else return;
    }

    // check stock
    if (qty > db.data.stock.length) return ctx.reply('❌ Not enough stock available.');
    const cost = qty * PRICE_PER_ACCOUNT;
    if (user.wallet < cost) return ctx.reply(`❌ You need ₹${cost.toFixed(2)}, your wallet has ₹${user.wallet.toFixed(2)}`);
    
    // Deduct and give accounts
    user.wallet -= cost;
    user.totalSpent += cost;
    const accountsToSend = db.data.stock.splice(0, qty);
    let msg = `✅ Payment of ₹${cost.toFixed(2)} has been deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    accountsToSend.forEach((a, idx) => {
      const line = `${a.username}, ${a.password}, ${a.email}`;
      msg += `Account ${idx + 1}:\n\`\`\`\n${escapeMarkdownV2(line)}\n\`\`\`\n\n`;
    });
    await db.write();
    ctx.replyWithMarkdownV2(msg, mainKeyboard);
    user.expectingBuyQty = false;
    return;
  }

  // Add Funds logic
  if (user.expectingTopupAmount) {
    const amt = parseFloat(ctx.message.text);
    const today = new Date().toDateString();
    if (isNaN(amt) || amt <= 0) {
      if (db.data.invalidInputWarn[uid] !== today) {
        db.data.invalidInputWarn[uid] = today;
        await db.write();
        return ctx.reply('❌ Please enter a valid amount only once per day.');
      } else return;
    }

    // generate UPI QR
    const upiURL = `upi://pay?pa=${UPI_ID}&pn=Twitter Seller&am=${amt.toFixed(2)}&cu=INR`;
    const qrPath = path.join(__dirname, `qr_${uid}.png`);
    await QRCode.toFile(qrPath, upiURL);

    user.pendingTopupAmount = amt;
    await db.write();

    ctx.replyWithPhoto({ source: qrPath }, { caption: `💳 Send ₹${amt.toFixed(2)} using UPI to ${UPI_ID} and then send the payment screenshot here.` });
    user.expectingTopupAmount = false;
    return;
  }

  // Handle payment screenshot
  if (ctx.message.photo || ctx.message.document) {
    if (user.pendingTopupAmount) {
      const amt = user.pendingTopupAmount;
      const caption = `💳 Payment screenshot received from @${ctx.from.username || 'N/A'} (ID: ${uid})\nAmount: ₹${amt.toFixed(2)}`;
      await bot.telegram.sendPhoto(ADMIN_ID, ctx.message.photo ? ctx.message.photo[ctx.message.photo.length-1].file_id : ctx.message.document.file_id, {
        caption,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Verify', callback_data: `verify_${uid}` },
              { text: '❌ Decline', callback_data: `decline_${uid}` }
            ]
          ]
        }
      });
      delete user.pendingTopupAmount;
      await db.write();
      return ctx.reply('✅ Payment screenshot sent to admin for verification.');
    }
  }

});

// -------------------- Admin Callback --------------------
bot.on('callback_query', async (ctx) => {
  await db.read();
  const data = ctx.callbackQuery.data;

  if (data.startsWith('verify_')) {
    const uid = data.split('_')[1];
    const user = db.data.users[uid];
    if (!user) return ctx.answerCbQuery('❌ User not found');
    const amt = user.pendingTopupAmount ?? 0;
    user.wallet = (user.wallet || 0) + amt;
    await db.write();
    ctx.editMessageCaption(`✅ Payment verified and ₹${amt.toFixed(2)} added to wallet.`);
    return;
  }

  if (data.startsWith('decline_')) {
    const uid = data.split('_')[1];
    ctx.editMessageCaption('❌ Payment declined by admin.');
    return;
  }
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
    try { await bot.telegram.sendMessage(uid, msg); } catch(e){ }
  }
  ctx.reply(`✅ Broadcast sent to ${Object.keys(db.data.users).length} users`);
});

bot.command('addstock', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Only admin');
  // Admin can upload TXT file
  ctx.reply('📁 Send a TXT file with accounts in format: username,password,email per line');
});

bot.on('document', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  if (!ctx.message.document.file_name.endsWith('.txt')) return ctx.reply('❌ Only TXT files allowed');
  const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
  const res = await fetch(fileLink.href);
  const text = await res.text();
  const lines = text.split('\n').filter(l=>l.trim());
  const accounts = lines.map(l=>{
    const [username,password,email] = l.split(',');
    return { username: username.trim(), password: password.trim(), email: email.trim() };
  });
  await db.read();
  db.data.stock.push(...accounts);
  await db.write();
  ctx.reply(`✅ Added ${accounts.length} accounts to stock`);
});

// -------------------- Express Server + Webhook --------------------
import express from 'express';
const app = express();
app.get('/', (req,res)=>res.send('🟢 Bot is running'));
app.use(bot.webhookCallback(`/bot${TOKEN}`));
app.listen(PORT,()=>console.log(`🚀 Bot running on port ${PORT}\nWebhook: ${WEBHOOK_URL}/bot${TOKEN}`));
