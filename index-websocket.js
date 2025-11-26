require('dotenv').config();
const express = require('express');
const { VoiceResponse } = require('twilio').twiml;
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const WSS_PORT = parseInt(process.env.WSS_PORT || '3443', 10);

// Configuration for AI models and Twilio
const config = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    apiSid: process.env.TWILIO_API_SID,
    apiSecret: process.env.TWILIO_API_SECRET,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'kimi-k2-0905',
  },
  cartesia: {
    apiKey: process.env.CARTESIA_API_KEY,
    model: process.env.CARTESIA_VOICE_MODEL || 'sonic-ultra',
    voiceId: process.env.CARTESIA_VOICE_ID || 'default',
  },
  inkWhisper: {
    apiKey: process.env.INK_WHISPER_API_KEY,
    model: process.env.INK_WHISPER_MODEL || 'ink-whisper-pro',
  },
};

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// AI Model Helpers
class AIModelManager {
  async generateWithKimi(userInput) {
    if (!config.groq.apiKey) {
      console.warn('Groq API key not configured');
      return null;
    }
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.groq.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.groq.model,
          messages: [{ role: 'user', content: userInput }],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (error) {
      console.error('Groq Kimi error:', error);
      return null;
    }
  }

  async synthesizeWithSonic3(text) {
    if (!config.cartesia.apiKey) {
      console.warn('Cartesia API key not configured');
      return null;
    }
    try {
      const response = await fetch('https://api.cartesia.ai/v1/voices/synthesize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.cartesia.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model: config.cartesia.model,
          voice_id: config.cartesia.voiceId,
          output_format: 'mp3',
        }),
      });
      return response;
    } catch (error) {
      console.error('Cartesia Sonic 3 error:', error);
      return null;
    }
  }

  async transcribeWithInkWhisper(audioData) {
    if (!config.inkWhisper.apiKey) {
      console.warn('Ink Whisper API key not configured');
      return null;
    }
    try {
      const formData = new FormData();
      formData.append('audio', audioData);
      formData.append('model', config.inkWhisper.model);

      const response = await fetch('https://api.inkwhisper.ai/v1/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.inkWhisper.apiKey}`,
        },
        body: formData,
      });
      const data = await response.json();
      return data.text || null;
    } catch (error) {
      console.error('Ink Whisper error:', error);
      return null;
    }
  }
}

// Voice Agent Handler
class VoiceAgent {
  constructor() {
    this.callSessions = new Map();
    this.mediaStreams = new Map();
    this.aiManager = new AIModelManager();
  }

  generateTwiML(callSid, speechResult = null) {
    const twiml = new VoiceResponse();

    if (speechResult) {
      twiml.say(`You said: ${speechResult}`, { voice: 'Polly.Amy' });
    } else {
      twiml.say('Welcome to the voice agent. Please speak after the beep.', {
        voice: 'Polly.Amy'
      });
    }

    const gather = twiml.gather({
      numDigits: 1,
      action: '/voice/handle-input',
      method: 'POST',
      timeout: 3,
      speechTimeout: 'auto'
    });

    gather.say('Please say something or press a key.', { voice: 'Polly.Amy' });
    twiml.redirect('/voice/end-call');

    return twiml;
  }

  handleIncoming(callSid, from, to) {
    this.callSessions.set(callSid, {
      from,
      to,
      startTime: new Date(),
      active: true
    });
  }

  endCall(callSid) {
    if (this.callSessions.has(callSid)) {
      this.callSessions.get(callSid).active = false;
    }
  }

  registerMediaStream(callSid, websocket) {
    this.mediaStreams.set(callSid, {
      websocket,
      startTime: new Date(),
      audioBuffer: []
    });
  }

  getMediaStream(callSid) {
    return this.mediaStreams.get(callSid);
  }

  closeMediaStream(callSid) {
    const stream = this.mediaStreams.get(callSid);
    if (stream && stream.websocket) {
      stream.websocket.close();
    }
    this.mediaStreams.delete(callSid);
  }
}

const voiceAgent = new VoiceAgent();

// HTTP Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Voice Agent is running',
    timestamp: new Date().toISOString(),
    websocket: 'enabled'
  });
});

// Incoming call handler
app.post('/voice/incoming', (req, res) => {
  const { CallSid, From, To } = req.body;

  console.log(`Incoming call - CallSid: ${CallSid}, From: ${From}, To: ${To}`);

  voiceAgent.handleIncoming(CallSid, From, To);

  const twiml = voiceAgent.generateTwiML(CallSid);

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
});

// Media Streams webhook (tells Twilio where to connect WebSocket)
app.post('/voice/media-stream', (req, res) => {
  const { CallSid } = req.body;

  console.log(`Media stream request - CallSid: ${CallSid}`);

  const twiml = new VoiceResponse();

  // Point to WebSocket server for media streaming
  const wssUrl = `${process.env.DEPLOYMENT_URL.replace('http', 'ws')}/media/${CallSid}`;

  twiml.start().stream({
    url: wssUrl
  });

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
});

// Handle user input (speech or DTMF)
app.post('/voice/handle-input', (req, res) => {
  const { CallSid, SpeechResult, Digits } = req.body;

  console.log(`Input - CallSid: ${CallSid}, Speech: ${SpeechResult}, Digits: ${Digits}`);

  const twiml = new VoiceResponse();

  if (SpeechResult) {
    twiml.say(`I understood: ${SpeechResult}`, { voice: 'Polly.Amy' });
  } else if (Digits) {
    twiml.say(`You pressed: ${Digits}`, { voice: 'Polly.Amy' });
  } else {
    twiml.say('No input received. Goodbye!', { voice: 'Polly.Amy' });
  }

  twiml.hangup();

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
});

// End call handler
app.post('/voice/end-call', (req, res) => {
  const { CallSid } = req.body;

  console.log(`Ending call - CallSid: ${CallSid}`);

  voiceAgent.endCall(CallSid);
  voiceAgent.closeMediaStream(CallSid);

  const twiml = new VoiceResponse();
  twiml.say('Thank you for calling. Goodbye!', { voice: 'Polly.Amy' });
  twiml.hangup();

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
});

// Status callback for call completion
app.post('/voice/status-callback', (req, res) => {
  const { CallSid, CallStatus } = req.body;

  console.log(`Call Status - CallSid: ${CallSid}, Status: ${CallStatus}`);

  res.status(200).end();
});

// Get active calls
app.get('/voice/calls', (req, res) => {
  const activeCalls = Array.from(voiceAgent.callSessions.entries())
    .filter(([_, session]) => session.active)
    .map(([callSid, session]) => ({
      callSid,
      ...session
    }));

  res.json({
    activeCalls: activeCalls.length,
    calls: activeCalls
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Twilio Voice Agent API (WebSocket enabled)',
    wsEnabled: true,
    endpoints: {
      health: 'GET /health',
      incoming: 'POST /voice/incoming',
      mediaStream: 'POST /voice/media-stream',
      handleInput: 'POST /voice/handle-input',
      endCall: 'POST /voice/end-call',
      statusCallback: 'POST /voice/status-callback',
      activeCalls: 'GET /voice/calls'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// WebSocket Server Setup
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket connections for media streams
wss.on('connection', (ws, req) => {
  const { callSid } = req.params;

  console.log(`WebSocket connected for media stream: ${callSid}`);

  voiceAgent.registerMediaStream(callSid, ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.event === 'start') {
        console.log(`Media stream started: ${callSid}`);
      } else if (data.event === 'media') {
        // Real-time audio data from Twilio
        const audioData = data.media?.payload;
        const stream = voiceAgent.getMediaStream(callSid);
        if (stream) {
          stream.audioBuffer.push(audioData);
        }
      } else if (data.event === 'stop') {
        console.log(`Media stream stopped: ${callSid}`);
        voiceAgent.closeMediaStream(callSid);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${callSid}:`, error);
  });

  ws.on('close', () => {
    console.log(`WebSocket closed for media stream: ${callSid}`);
    voiceAgent.closeMediaStream(callSid);
  });

  // Send acknowledgment
  ws.send(JSON.stringify({
    event: 'connected',
    callSid
  }));
});

// HTTP Server
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Voice Agent HTTP server running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Twilio Account SID: ${process.env.TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Not set'}`);
  console.log(`WebSocket Server: Ready on port ${WSS_PORT}`);
});

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  const match = pathname.match(/^\/media\/([A-Za-z0-9]+)$/);

  if (match) {
    const callSid = match[1];
    request.params = { callSid };

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WSS Server (if SSL certificates are available)
if (process.env.SSL_CERT && process.env.SSL_KEY) {
  try {
    const options = {
      cert: fs.readFileSync(process.env.SSL_CERT),
      key: fs.readFileSync(process.env.SSL_KEY)
    };

    const wssServer = https.createServer(options, app);
    wssServer.on('upgrade', (request, socket, head) => {
      const pathname = request.url;
      const match = pathname.match(/^\/media\/([A-Za-z0-9]+)$/);

      if (match) {
        const callSid = match[1];
        request.params = { callSid };

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    wssServer.listen(WSS_PORT, HOST, () => {
      console.log(`🔒 Secure WebSocket Server running on ${HOST}:${WSS_PORT}`);
    });
  } catch (error) {
    console.warn('SSL certificates not found. WSS not available.');
    console.warn('To enable WSS, set SSL_CERT and SSL_KEY environment variables');
  }
}

module.exports = app;
