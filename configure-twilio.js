#!/usr/bin/env node

/**
 * Twilio Phone Number Configuration Script
 * This script configures your Twilio phone number to route incoming calls
 * to the websocketz-4-life voice agent
 */

require('dotenv').config();
const twilio = require('twilio');

// Get credentials from environment
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL || 'https://websocketz-4-life.railway.app';

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('❌ Error: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env');
  process.exit(1);
}

if (!DEPLOYMENT_URL) {
  console.error('❌ Error: DEPLOYMENT_URL must be set in .env');
  console.error('   Example: DEPLOYMENT_URL=https://your-app.railway.app');
  process.exit(1);
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

async function configurePhoneNumber() {
  try {
    console.log('🔍 Fetching your Twilio phone numbers...\n');

    // Get all incoming phone numbers
    const incomingPhoneNumbers = await client.incomingPhoneNumbers.list();

    if (incomingPhoneNumbers.length === 0) {
      console.error('❌ No incoming phone numbers found in your Twilio account.');
      console.error('   Please purchase a phone number in Twilio Console first.');
      process.exit(1);
    }

    console.log(`Found ${incomingPhoneNumbers.length} phone number(s):\n`);

    // Display available numbers
    incomingPhoneNumbers.forEach((num, index) => {
      console.log(`${index + 1}. ${num.friendlyName} (${num.phoneNumber}) - SID: ${num.sid}`);
    });

    // Use the first number (or you can prompt for selection)
    const phoneNumber = incomingPhoneNumbers[0];
    const voiceUrl = `${DEPLOYMENT_URL}/voice/incoming`;
    const statusCallbackUrl = `${DEPLOYMENT_URL}/voice/status-callback`;

    console.log(`\n📞 Configuring phone number: ${phoneNumber.friendlyName} (${phoneNumber.phoneNumber})\n`);
    console.log(`   Voice Webhook URL: ${voiceUrl}`);
    console.log(`   Status Callback URL: ${statusCallbackUrl}\n`);

    // Update the incoming phone number
    const updated = await client.incomingPhoneNumbers(phoneNumber.sid).update({
      voiceUrl: voiceUrl,
      voiceMethod: 'POST',
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      voiceFallbackUrl: '', // Let Twilio handle fallback
      voiceFallbackMethod: 'POST',
    });

    console.log('✅ Successfully configured!\n');
    console.log('Configuration Details:');
    console.log(`  Phone Number: ${updated.phoneNumber}`);
    console.log(`  Friendly Name: ${updated.friendlyName}`);
    console.log(`  Voice Webhook: ${updated.voiceUrl}`);
    console.log(`  Voice Method: ${updated.voiceMethod}`);
    console.log(`  Status Callback: ${updated.statusCallback}`);
    console.log(`  Status Callback Method: ${updated.statusCallbackMethod}\n`);

    console.log('🎙️  Your voice agent is now live!');
    console.log(`   Incoming calls to ${updated.phoneNumber} will route to your voice agent.\n`);

    return updated;
  } catch (error) {
    console.error('❌ Error configuring phone number:\n');
    console.error(error.message);

    if (error.code === 20003) {
      console.error('\n   This error usually means invalid credentials.');
      console.error('   Please verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file.');
    }

    process.exit(1);
  }
}

// Main execution
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  Twilio Phone Number Configuration for websocketz-4-life  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

configurePhoneNumber().then(() => {
  console.log('ℹ️  Configuration complete! You can now test your voice agent.\n');
  console.log('📋 Testing your voice agent:');
  console.log(`   1. Call your Twilio phone number`);
  console.log(`   2. You should hear: "Welcome to the voice agent. Please speak after the beep."`);
  console.log(`   3. Speak or press a key to interact\n`);

  console.log('📊 Monitor your calls:');
  console.log(`   curl ${DEPLOYMENT_URL}/voice/calls\n`);

  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
