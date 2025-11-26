# Twilio Voice Agent - Deployment & Debugging Guide

## Issue: "We are sorry an application error has occurred goodbye"

This error message from Twilio typically indicates one of these problems:

### 1. **Webhook Not Reachable** (Most Common)
Twilio cannot reach your webhook URL over the internet.

**Check:**
```bash
# Test from your local machine if the deployment URL is accessible
curl -X POST https://websocketz-4-life.railway.app/voice/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&From=%2B15551234567&To=%2B15555678901"
```

**If you get:**
- `Connection refused` or `Cannot connect` → Your Railway app isn't running or accessible
- Valid TwiML response → Webhook is reachable (good!)
- 404 Not Found or 500 error → See problems below

### 2. **Invalid TwiML Response**
The response doesn't conform to TwiML specification.

**Requirements per Twilio Docs:**
- Must have `<?xml version="1.0" encoding="UTF-8"?>` declaration
- Root element must be `<Response>`
- All verb names are case-sensitive (e.g., `<Say>` not `<say>`)
- Content-Type header must be `text/xml` or `application/xml`
- HTTP Status must be 200 OK

### 3. **HTTP Headers Incorrect**
- Content-Type not set or wrong value
- Status code is not 200

### 4. **Twilio Phone Number Configuration**
Webhook URL is not correctly configured on the phone number.

**Check in Twilio Console:**
1. Go to Phone Numbers
2. Select your number (+18555722404)
3. Verify Voice Webhook settings:
   - **Webhook URL:** `https://websocketz-4-life.railway.app/voice/incoming`
   - **HTTP Method:** POST
   - **Status Callback URL:** `https://websocketz-4-life.railway.app/voice/status-callback`

## Troubleshooting Steps

### Step 1: Verify Endpoints Locally
```bash
# Start the server
cd /Users/franksimpson/CascadeProjects/websocketz-4-life
npm start

# Run tests in another terminal
bash /tmp/test_voice_agent.sh
```

All 6 tests should pass.

### Step 2: Check Deployment Status
```bash
# Is Railway app running?
# Visit: https://dashboard.railway.app
# Check if "websocketz-4-life" service is running
# Check logs for any errors

# Alternatively, test the URL directly:
curl -I https://websocketz-4-life.railway.app/health
# Should return: HTTP/1.1 200 OK

curl https://websocketz-4-life.railway.app/health | jq .
# Should show: {"status":"ok","message":"Voice Agent is running"...}
```

### Step 3: Verify Twilio Configuration
```bash
# Check current phone number config
node /Users/franksimpson/CascadeProjects/websocketz-4-life/configure-twilio.js
```

### Step 4: Enable Twilio Debugger
1. Log in to Twilio Console: https://www.twilio.com/console
2. Go to **Logs** → **Debugger**
3. Make a test call to your Twilio number
4. Look for error details in the debugger window
5. Common error codes:
   - `11201` - Request timeout
   - `11206` - HTTP connection error
   - `11208` - Curl returned an error

### Step 5: Test from Command Line
```bash
# Simulate Twilio's webhook request
curl -v -X POST https://websocketz-4-life.railway.app/voice/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890abcdef1234567890abcdef&From=%2B15551234567&To=%2B15555678901" \
  2>&1 | grep -E "HTTP|Content-Type|<Response"
```

**Expected output:**
```
< HTTP/1.1 200 OK
< Content-Type: text/xml; charset=utf-8
<?xml version="1.0" encoding="UTF-8"?><Response>...
```

## Railway Deployment Checklist

- [ ] Railway app is connected to GitHub repository
- [ ] .env file variables are set in Railway dashboard:
  - [ ] TWILIO_ACCOUNT_SID
  - [ ] TWILIO_AUTH_TOKEN
  - [ ] TWILIO_API_SID
  - [ ] TWILIO_API_SECRET
  - [ ] GROQ_API_KEY
  - [ ] CARTESIA_API_KEY
  - [ ] INK_WHISPER_API_KEY
  - [ ] NODE_ENV=production
- [ ] No deployment errors in Railway logs
- [ ] Service is marked as "Running"
- [ ] Public URL is accessible
- [ ] Health check passes: `curl https://websocketz-4-life.railway.app/health`

## Common Solutions

### Problem: Railway app shows as running but isn't responding
**Solution:**
- Check Railway logs for startup errors
- Ensure all required environment variables are set
- Verify package.json has "start" script
- Check if PORT is being set correctly (Railway assigns it automatically)

### Problem: Health check works but voice webhook doesn't
**Solution:**
- Verify the exact URL format in Twilio: `https://websocketz-4-life.railway.app/voice/incoming`
- No trailing slashes
- No HTTP (must be HTTPS)
- Re-run configure-twilio.js to update the webhook

### Problem: Phone calls still give error after fixes
**Solution:**
1. Kill any local server running: `pkill -f "node index.js"`
2. Ensure Railway is actually deployed with latest code
3. Review Twilio Debugger for specific error
4. Try making a test call again
5. Allow 30 seconds for Twilio to recognize new webhook config

## Next Steps

1. **Immediate:** Test the Railway deployment URL is accessible
2. **Verify:** Check Twilio Console Debugger during next test call
3. **Confirm:** All environment variables deployed to Railway
4. **Test:** Try making a call and monitor Twilio Debugger
5. **Data:** Share error message(s) from Twilio Debugger

If you need to see real-time logs from Railway deployment:
- Go to https://dashboard.railway.app
- Select your project
- View the "Logs" tab
