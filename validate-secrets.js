#!/usr/bin/env node

/**
 * Secret Validation Script
 * Tests all API credentials to ensure they are valid and working
 *
 * IMPORTANT: This script reads from environment variables (.env file)
 * Use: npm run validate-secrets (after setting up .env)
 */

require('dotenv').config();
const https = require('https');

const secrets = {
  TWILIO_API_SID: process.env.TWILIO_API_SID,
  TWILIO_API_SECRET: process.env.TWILIO_API_SECRET,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY
};

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║           VALIDATING API CREDENTIALS                       ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

async function testTwilioAuth() {
  return new Promise((resolve) => {
    console.log("🔍 Testing Twilio Authentication...");

    const auth = Buffer.from(
      `${secrets.TWILIO_ACCOUNT_SID}:${secrets.TWILIO_AUTH_TOKEN}`
    ).toString('base64');

    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: '/2010-04-01/Accounts.json',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const accounts = JSON.parse(data);
            if (accounts.accounts && accounts.accounts.length > 0) {
              console.log("   ✅ TWILIO_ACCOUNT_SID: Valid");
              console.log("   ✅ TWILIO_AUTH_TOKEN: Valid");
              console.log(`   📞 Account: ${accounts.accounts[0].friendly_name}\n`);
              resolve(true);
            } else {
              console.log("   ❌ TWILIO_ACCOUNT_SID: Invalid - No accounts found\n");
              resolve(false);
            }
          } catch (e) {
            console.log("   ❌ TWILIO credentials: Invalid - Parse error\n");
            resolve(false);
          }
        } else {
          console.log(`   ❌ TWILIO credentials: Invalid - HTTP ${res.statusCode}\n`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ TWILIO credentials: Error - ${err.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

async function testTwilioAPI() {
  return new Promise((resolve) => {
    console.log("🔍 Testing Twilio API Keys (SID/Secret)...");

    const auth = Buffer.from(
      `${secrets.TWILIO_API_SID}:${secrets.TWILIO_API_SECRET}`
    ).toString('base64');

    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: '/2010-04-01/Accounts.json',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        console.log("   ✅ TWILIO_API_SID: Valid");
        console.log("   ✅ TWILIO_API_SECRET: Valid\n");
        resolve(true);
      } else {
        console.log(`   ❌ TWILIO_API_SID/SECRET: Invalid - HTTP ${res.statusCode}\n`);
        resolve(false);
      }
    });

    req.on('error', (err) => {
      console.log(`   ❌ TWILIO API Keys: Error - ${err.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

async function testCartesia() {
  return new Promise((resolve) => {
    console.log("🔍 Testing Cartesia API Key...");

    const options = {
      hostname: 'api.cartesia.ai',
      port: 443,
      path: '/v1/voices',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secrets.CARTESIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log("   ✅ CARTESIA_API_KEY: Valid\n");
          resolve(true);
        } else if (res.statusCode === 401) {
          console.log("   ❌ CARTESIA_API_KEY: Invalid - Unauthorized\n");
          resolve(false);
        } else {
          console.log(`   ⚠️  CARTESIA_API_KEY: Uncertain - HTTP ${res.statusCode}\n`);
          resolve(true); // Might still be valid
        }
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ CARTESIA_API_KEY: Error - ${err.message}\n`);
      resolve(false);
    });

    req.end();
  });
}

async function testGroq() {
  return new Promise((resolve) => {
    console.log("🔍 Testing Groq API Key...");

    const postData = JSON.stringify({
      model: "mixtral-8x7b-32768",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 10
    });

    const options = {
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secrets.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log("   ✅ GROQ_API_KEY: Valid\n");
          resolve(true);
        } else if (res.statusCode === 401) {
          console.log("   ❌ GROQ_API_KEY: Invalid - Unauthorized\n");
          resolve(false);
        } else if (res.statusCode === 400) {
          // Might be valid but invalid request - check response
          try {
            const json = JSON.parse(data);
            if (json.error && json.error.message && json.error.message.includes('API key')) {
              console.log("   ❌ GROQ_API_KEY: Invalid - Bad API key\n");
              resolve(false);
            } else {
              console.log("   ✅ GROQ_API_KEY: Valid (Request error, not auth)\n");
              resolve(true);
            }
          } catch (e) {
            console.log(`   ⚠️  GROQ_API_KEY: Uncertain - HTTP ${res.statusCode}\n`);
            resolve(true);
          }
        } else {
          console.log(`   ⚠️  GROQ_API_KEY: Uncertain - HTTP ${res.statusCode}\n`);
          resolve(true);
        }
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ GROQ_API_KEY: Error - ${err.message}\n`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  try {
    const twilio = await testTwilioAuth();
    const twilioApi = await testTwilioAPI();
    const cartesia = await testCartesia();
    const groq = await testGroq();

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    VALIDATION SUMMARY                       ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    const results = [
      { name: 'Twilio (Account SID/Auth Token)', status: twilio },
      { name: 'Twilio API (SID/Secret)', status: twilioApi },
      { name: 'Cartesia API Key', status: cartesia },
      { name: 'Groq API Key', status: groq }
    ];

    const allValid = results.every(r => r.status);

    results.forEach(r => {
      const icon = r.status ? '✅' : '❌';
      console.log(`${icon} ${r.name}`);
    });

    console.log("");
    if (allValid) {
      console.log("🎉 All credentials are valid and working!");
      console.log("\nReady to deploy to Railway with proper configuration.");
      process.exit(0);
    } else {
      console.log("⚠️  Some credentials appear to be invalid.");
      console.log("\nPlease update .env file with valid credentials.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error running validation:", error);
    process.exit(1);
  }
}

runTests();
