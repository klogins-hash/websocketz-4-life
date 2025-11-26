# Twilio Configuration Guide

This guide walks you through setting up Twilio to work with the websocketz-4-life voice agent.

## Prerequisites

- Twilio account (https://www.twilio.com)
- Active Twilio phone number
- Deployed voice agent URL (e.g., `https://your-app.railway.app`)
- Twilio Account SID and Auth Token

## Step 1: Get Your Twilio Credentials

1. Go to https://console.twilio.com
2. Log in to your account
3. In the Dashboard, find your **Account SID** and **Auth Token**
4. Copy these values to your `.env` file:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
```

## Step 2: Obtain a Twilio Phone Number

If you don't have a phone number yet:

1. Go to **Phone Numbers** → **Manage** in Twilio Console
2. Click **Buy a Number** or use an existing one
3. Select a number and note it down
4. Update your `.env` file:

```env
TWILIO_PHONE_NUMBER=+1234567890
```

## Step 3: Configure Voice Webhook

1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your phone number to edit it
3. Scroll to **Voice & Fax** section

### Voice Configuration

Set the following webhook URL:

**When a call comes in:**
```
POST https://your-railway-app.railway.app/voice/incoming
```

**Status Callbacks:**
```
POST https://your-railway-app.railway.app/voice/status-callback
```

> Replace `your-railway-app` with your actual Railway deployment URL

4. **HTTP Method:** POST
5. **Primary Handler:** The `/voice/incoming` endpoint
6. Click **Save**

## Step 4: Get Your Deployment URL

If running on Railway:

```bash
railway domains
```

Or check your Railway dashboard for the deployment URL.

Example format:
- `https://websocketz-4-life.railway.app`

## Step 5: Test the Configuration

### Test 1: Health Check

```bash
curl https://your-deployed-app/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "Voice Agent is running",
  "timestamp": "2025-11-26T12:00:00.000Z"
}
```

### Test 2: Simulate Incoming Call

```bash
curl -X POST https://your-deployment-url/voice/incoming \
  -d "CallSid=CA1234567890abcdef1234567890abcdef" \
  -d "From=%2B1234567890" \
  -d "To=%2B0987654321"
```

Expected response: TwiML XML
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Welcome to the voice agent. Please speak after the beep.</Say>
  <Gather numDigits="1" action="https://your-url/voice/handle-input" method="POST" timeout="3" speechTimeout="auto">
    <Say voice="Polly.Amy">Please say something or press a key.</Say>
  </Gather>
  <Redirect>https://your-url/voice/end-call</Redirect>
</Response>
```

### Test 3: Make a Real Call

1. Dial your Twilio phone number from any phone
2. You should hear the greeting message
3. Speak or press a key
4. Check server logs for call handling

## Step 6: Configure Advanced Options (Optional)

### Enable Speech Recognition

In the Phone Number configuration:

1. Under **Voice Configuration → Advanced Settings**
2. Enable **Speech Recognition**
3. Set language to your preferred language code:
   - `en-US` - English (United States)
   - `en-GB` - English (United Kingdom)
   - `es-ES` - Spanish
   - etc.

### Set Timeout Values

In the webhook body or TwiML:
- `speechTimeout: 'auto'` - Automatic silence detection
- `speechTimeout: 5` - Maximum 5 seconds of silence
- `timeout: 3` - 3 seconds to gather input

### Enable Call Recording (if needed)

Add to TwiML response:
```xml
<Record action="/voice/recording-callback" />
```

Then handle the recording in your application.

## Step 7: Environment Variables Summary

Your `.env` file should contain:

```env
# Server
PORT=3000
NODE_ENV=production

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# AI Models
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=kimi-k2-0905

CARTESIA_API_KEY=your_cartesia_api_key_here
CARTESIA_VOICE_MODEL=sonic-ultra
CARTESIA_VOICE_ID=15a6759f-809f-4d23-8021-6cb19ce453a1

# Optional
WEBHOOK_URL=https://your-deployment-url.railway.app
```

## Troubleshooting

### Incoming Call Not Working

**Problem:** Calls don't reach your webhook

**Solutions:**
1. Verify the webhook URL is correct in Twilio Console
2. Check that your app is publicly accessible (not localhost)
3. Ensure HTTP POST is allowed
4. Check server logs for errors
5. Test with curl to verify the endpoint responds

```bash
curl -v -X POST https://your-url/voice/incoming \
  -d 'CallSid=test' -d 'From=+1234567890' -d 'To=+0987654321'
```

### No Voice Output

**Problem:** Calls connect but no audio is heard

**Solutions:**
1. Check TwiML response is valid XML
2. Verify voice settings in TwiML (e.g., `voice="Polly.Amy"`)
3. Test with a simpler TwiML response
4. Check Twilio logs for errors
5. Ensure speech synthesis is enabled

### Speech Recognition Not Working

**Problem:** Speech input not being recognized

**Solutions:**
1. Enable Speech Recognition in Phone Number settings
2. Verify language code is set correctly
3. Increase `speechTimeout` value
4. Ensure user is speaking clearly
5. Check Ink Whisper API key is valid

### Call Drops Unexpectedly

**Problem:** Calls drop or disconnect early

**Solutions:**
1. Check your app for unhandled exceptions
2. Verify timeout values are appropriate
3. Ensure TwiML response is valid
4. Check network connectivity
5. Review Twilio logs for specific error messages

## Advanced Configuration

### Adding Custom TwiML Actions

Extend the voice agent to handle additional scenarios:

```javascript
// In index.js - Voice Agent Handler
generateTwiML(callSid, userInput) {
  const twiml = new VoiceResponse();

  // Custom logic here
  if (userInput && userInput.toLowerCase().includes('sales')) {
    twiml.redirect('https://your-app/sales-queue');
  } else if (userInput && userInput.toLowerCase().includes('support')) {
    twiml.redirect('https://your-app/support-queue');
  } else {
    twiml.say('Thank you for calling. Goodbye!');
    twiml.hangup();
  }

  return twiml;
}
```

### Recording Calls

Add call recording:

```javascript
app.post('/voice/incoming', (req, res) => {
  const { CallSid, From, To } = req.body;

  voiceAgent.handleIncoming(CallSid, From, To);

  const twiml = new VoiceResponse();
  twiml.record({
    action: '/voice/recording-callback',
    recordingStatusCallback: '/voice/recording-status'
  });
  twiml.say('Message not recorded. Goodbye!');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/voice/recording-callback', (req, res) => {
  const { RecordingUrl, CallSid } = req.body;
  console.log(`Recording saved: ${RecordingUrl}`);
  res.status(200).end();
});
```

### Call Queue Integration

For more complex scenarios, integrate with Twilio's Task Router:

1. Set up Task Router in Twilio Console
2. Configure workflows and queues
3. Use TwiML enqueue to route calls:

```javascript
twiml.enqueue('support-queue');
```

## Security Considerations

1. **Validate Twilio Requests:** Always verify incoming requests are from Twilio
2. **Use HTTPS Only:** Ensure all webhook URLs use HTTPS
3. **Rotate Auth Token:** Regularly rotate your Twilio auth token
4. **Store Credentials Securely:** Use environment variables, never hardcode
5. **Set Request Timeout:** Implement proper timeout handling
6. **Rate Limiting:** Consider rate limiting on your endpoints

## Monitoring & Logging

### View Twilio Logs

In Twilio Console:
- **Logs** → **Message Logs** for SMS
- **Logs** → **Call Logs** for voice calls
- **Logs** → **Debugger** for detailed event logs

### Access Deployment Logs

On Railway:
```bash
railway logs
```

### Monitor Active Calls

Check your voice agent's active calls:

```bash
curl https://your-app/voice/calls
```

Response:
```json
{
  "activeCalls": 2,
  "calls": [
    {
      "callSid": "CA1234567890abcdef1234567890abcdef",
      "from": "+1234567890",
      "to": "+0987654321",
      "startTime": "2025-11-26T12:00:00.000Z"
    }
  ]
}
```

## Next Steps

1. ✅ Configure Twilio phone number webhooks
2. ✅ Set Twilio credentials in `.env`
3. ✅ Test with curl commands
4. ✅ Make a test call from a real phone
5. ✅ Monitor logs and adjust as needed
6. ✅ Deploy to production when ready

## Support

For Twilio-specific issues:
- Twilio Docs: https://www.twilio.com/docs
- Twilio Support: https://www.twilio.com/help
- Twilio Community: https://community.twilio.com

For voice agent issues:
- Check README.md for general setup
- Review server logs for errors
- Test endpoints with curl
- Verify all environment variables are set

---

**Last Updated:** 2025-11-26
**Voice Agent:** websocketz-4-life
