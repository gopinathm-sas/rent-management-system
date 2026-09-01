#!/usr/bin/env node
/**
 * Local Telegram Bot Polling Runner for Munirathnam Illam Rental Manager
 * 
 * Usage:
 *   TELEGRAM_BOT_TOKEN="your_test_bot_token" npm run bot:dev
 * or set TELEGRAM_BOT_TOKEN in .env
 */

const fs = require('fs');
const path = require('path');

// 1. Multi-file .env parser fallback
const candidateEnvFiles = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../functions/.env')
];

candidateEnvFiles.forEach(envPath => {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
});

// Load the same firebase-admin instance used by functions
let admin;
try {
  admin = require(path.resolve(__dirname, '../functions/node_modules/firebase-admin'));
} catch (e) {
  admin = require('firebase-admin');
}

// 2. Locate Service Account Key if available
const candidateSaFiles = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.resolve(__dirname, '../serviceAccountKey.json'),
  path.resolve(__dirname, '../service-account.json'),
  path.resolve(__dirname, '../functions/serviceAccountKey.json'),
  path.resolve(__dirname, '../functions/service-account.json')
].filter(Boolean);

// Also scan root directory for any *-firebase-adminsdk-*.json
try {
  const rootFiles = fs.readdirSync(path.resolve(__dirname, '..'));
  const foundSa = rootFiles.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
  if (foundSa) candidateSaFiles.push(path.resolve(__dirname, '..', foundSa));
} catch (_) {}

const validSaPath = candidateSaFiles.find(p => p && fs.existsSync(p));

if (!admin.apps.length) {
  if (validSaPath) {
    const serviceAccount = require(path.resolve(validSaPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log(`[Firebase] Initialized with service account: ${path.basename(validSaPath)}`);
  } else {
    admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'munirathnam-illam'
    });
    console.log(`[Firebase] Initialized with project ID: ${process.env.VITE_FIREBASE_PROJECT_ID || 'munirathnam-illam'}`);
    console.log('\x1b[33m%s\x1b[0m', '⚠️  Note: No service account key found for local dev.');
    console.log('\x1b[33m%s\x1b[0m', '   For local Firestore read/write, place `serviceAccountKey.json` in the root folder,');
    console.log('\x1b[33m%s\x1b[0m', '   OR deploy to Firebase Functions with `npx firebase deploy --only functions`.\n');
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: TELEGRAM_BOT_TOKEN environment variable is not set!');
  console.log('\nSet your token by running:');
  console.log('  export TELEGRAM_BOT_TOKEN="your_telegram_bot_token"');
  console.log('  npm run bot:dev\n');
  process.exit(1);
}

const { createTelegramBot } = require('../functions/telegramBot');

console.log('\x1b[36m%s\x1b[0m', '🤖 Starting Munirathnam Illam Telegram Bot (Polling Mode)...');

const bot = createTelegramBot(token);

bot.catch((err) => {
  console.error('\x1b[31m[Bot Error]\x1b[0m', err.message);
});

bot.start({
  onStart: (botInfo) => {
    console.log('\x1b[32m%s\x1b[0m', `✅ Bot @${botInfo.username} is running and listening for messages!`);
    console.log('Press Ctrl+C to stop.\n');
  }
});
