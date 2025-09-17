// bot.js
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0', 10);
const UPI_ID = process.env.UPI_ID || 'shubham4u@fam';
const PRICE_PER_ACCOUNT = parseFloat(process.env.PRICE_PER_ACCOUNT || '5');
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g., https://your-render-service.onrender.com

if (!TOKEN || !ADMIN_ID || !WEBHOOK_URL) {
  console.error('Please set TG_TOKEN, ADMIN_ID, and WEBHOOK_URL in .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// -------------------- LowDB Setup --------------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);

// Default DB structure
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

const adminInline = Markup.inlineKeyboard([
  [Markup.button.callback('📦 Add Account', 'admin_add')],
  [Markup.button.callback('✅ Verify Payments', 'admin_verify')],
  [Markup.button.callback('📊 Stats', 'admin_stats')],
  [Markup.button.callback('📣 Broadcast', 'admin_broadcast')]
]);

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
    if (ctx.from.id === ADMIN_ID) {
      ctx.reply("👑 Admin Panel:", adminInline);
    } else {
      ctx.reply("🔥 Main Menu:", mainKeyboard);
      sendMotivationalTip(ctx);
    }
  }, welcomeAnimation.length * 600 + 200);
});

// -------------------- User Reply Buttons --------------------
bot.hears('🛒 Buy Account', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
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
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
  ctx.reply(`💰 Your wallet balance: ₹${(db.data.users[uid].wallet ?? 0).toFixed(2)}`, mainKeyboard);
  sendMotivationalTip(ctx);
});

bot.hears('💳 Add Funds', async (ctx) => {
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };
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

// -------------------- Text Handlers (Buy & Add Funds) --------------------
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const uid = String(ctx.from.id);
  await db.read();
  db.data.users[uid] = db.data.users[uid] || { wallet: 0, totalSpent: 0 };

  // --- Add Funds ---
  if (db.data.users[uid].expectingTopupAmount) {
    const amount = parseFloat(text);
    db.data.users[uid].expectingTopupAmount = false;

    if (!amount || amount <= 0) return ctx.reply('❌ Invalid amount. Operation cancelled.', mainKeyboard);

    const txId = nanoid(8);
    db.data.pendingTopup[uid] = { amount, txId };
    await db.write();

    const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=Shubham&am=${amount}&cu=INR`;
    const qrPath = path.join(__dirname, `qr_${txId}.png`);
    try { await QRCode.toFile(qrPath, upiUri, { scale: 6 }); } catch(e){console.error(e);}
    await ctx.replyWithPhoto({ source: qrPath }, { caption: `💳 Scan this QR to pay ₹${amount} or pay to UPI ID: ${UPI_ID}\nSend screenshot here for verification.` });
    try { fs.unlinkSync(qrPath); } catch(e){}
    return;
  }

  // --- Buy Account ---
  if (db.data.users[uid].expectingBuyQty) {
    const qty = parseInt(text, 10);
    db.data.users[uid].expectingBuyQty = false;

    if (!qty || qty <= 0) return ctx.reply('❌ Invalid quantity. Operation cancelled.', mainKeyboard);

    const cost = qty * PRICE_PER_ACCOUNT;
    const userWallet = db.data.users[uid].wallet ?? 0;
    const available = db.data.stock.length;

    if (qty > available) return ctx.reply(`❌ Not enough accounts in stock. Current stock: ${available}.`);
    if (userWallet < cost) return ctx.reply(`❌ Insufficient balance. Total cost: ₹${cost}, wallet: ₹${userWallet}. Add funds first.`);

    db.data.users[uid].wallet -= cost;
    db.data.users[uid].totalSpent = (db.data.users[uid].totalSpent ?? 0) + cost;
    const accountsToSend = db.data.stock.splice(0, qty);
    db.data.transactions.push({ id: nanoid(10), type:'buy', userId: uid, qty, amount: cost, accounts: accountsToSend, createdAt: Date.now() });
    await db.write();

    let replyText = `✅ Payment of ₹${cost.toFixed(2)} deducted from your wallet.\n\nHere are your ${qty} account(s):\n\n`;
    accountsToSend.forEach((a,i)=>{
      replyText += `─────────────────\n`;
      replyText += `USERNAME : <code>${a.username}</code>\n`;
      replyText += `PASSWORD : <code>${a.password}</code>\n`;
      replyText += `EMAIL    : <code>${a.email || 'N/A'}</code>\n`;
      replyText += `─────────────────\n📋 Tap to copy!\n\n`;
    });
    await ctx.reply(replyText, { parse_mode:'HTML' });
    await ctx.reply(`💰 Remaining wallet: ₹${db.data.users[uid].wallet.toFixed(2)}`, mainKeyboard);
    sendMotivationalTip(ctx);
    return;
  }

  return next();
});

// -------------------- Photo Handler (Top-up Screenshot) --------------------
bot.on('photo', async(ctx)=>{
  const uid = String(ctx.from.id);
  if(!db.data.pendingTopup[uid]) return ctx.reply("❌ No top-up request found.");
  const {amount, txId} = db.data.pendingTopup[uid];

  db.data.transactions.push({ txId, userId: uid, amount, status:"pending", createdAt:Date.now() });
  await db.write();

  const photo = ctx.message.photo.slice(-1)[0].file_id;
  await bot.telegram.sendPhoto(ADMIN_ID, photo, {
    caption:`💰 Top-up Request\nUser: ${ctx.from.username||ctx.from.id}\nUserID: ${uid}\nAmount: ₹${amount}\nTxID: ${txId}`,
    reply_markup:{inline_keyboard:[[ {text:`✅ Verify ₹${amount}`, callback_data:`verify_${txId}`}]]}
  });

  delete db.data.pendingTopup[uid];
  await db.write();
  ctx.reply("📨 Screenshot sent to admin for verification. You will be notified once verified.");
});

// -------------------- Admin Verify Callback --------------------
bot.on('callback_query', async(ctx)=>{
  const data = ctx.callbackQuery.data;
  if(data.startsWith("verify_")){
    const txId = data.split("_")[1];
    const tx = db.data.transactions.find(t=>t.txId===txId);
    if(!tx) return ctx.answerCbQuery("❌ Transaction not found.");
    if(tx.status==="verified") return ctx.answerCbQuery("⚠️ Already processed.");
    if(ctx.from.id!==ADMIN_ID) return ctx.answerCbQuery("❌ Only admin can verify.");

    db.data.users[tx.userId] = db.data.users[tx.userId] || { wallet:0, totalSpent:0 };
    db.data.users[tx.userId].wallet += tx.amount;
    tx.status="verified"; tx.verifiedBy=ctx.from.id; tx.verifiedAt=Date.now();
    await db.write();

    ctx.answerCbQuery(`✅ ₹${tx.amount} added to user wallet`);
    ctx.editMessageCaption(ctx.callbackQuery.message.caption + `\n✅ Verified by Admin`);
    await bot.telegram.sendMessage(tx.userId, `✅ Your wallet has been credited with ₹${tx.amount}`);
  }
});

// -------------------- Admin Commands --------------------
bot.command('list', async(ctx)=>{
  if(ctx.from.id!==ADMIN_ID) return ctx.reply('❌ Only admin');
  await db.read();
  const users = Object.entries(db.data.users)
    .map(([id,u])=>`ID: ${id}, Wallet: ₹${(u.wallet??0).toFixed(2)}, Spent: ₹${(u.totalSpent??0).toFixed(2)}`)
    .join('\n');
  ctx.reply(`👥 Registered Users:\n\n${users||'No users yet.'}`);
});

bot.command('broadcast', async(ctx)=>{
  if(ctx.from.id!==ADMIN_ID) return ctx.reply('❌ Only admin');
  const msg = ctx.message.text.split(' ').slice(1).join(' ');
  if(!msg) return ctx.reply('❌ Usage: /broadcast <message>');
  await db.read();
  for(const uid of Object.keys(db.data.users)){
    try{ await bot.telegram.sendMessage(uid, msg); } catch(e){}
  }
  ctx.reply(`✅ Broadcast sent to ${Object.keys(db.data.users).length} users`);
});

// -------------------- Webhook Launch --------------------
await bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${TOKEN}`);
bot.startWebhook(`/bot${TOKEN}`, null, PORT);

console.log(`🚀 Bot started on port ${PORT} using webhook at ${WEBHOOK_URL}/bot${TOKEN}`);
