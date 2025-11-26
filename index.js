require('dotenv').config();
const express = require('express');
const { VoiceResponse } = require('twilio').twiml;
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration for AI models and Twilio
const config = {
  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    apiSid: process.env.TWILIO_API_SID,
    apiSecret: process.env.TWILIO_API_SECRET,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  // Groq Kimi k2-0905 - Ultra-fast reasoning LLM
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'kimi-k2-0905',
  },
  // Cartesia Sonic Ultra - High-quality voice synthesis
  cartesia: {
    apiKey: process.env.CARTESIA_API_KEY,
    model: process.env.CARTESIA_VOICE_MODEL || 'sonic-ultra',
    voiceId: process.env.CARTESIA_VOICE_ID || 'default',
  },
  // Ink Whisper - Advanced speech recognition
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
  // Generate response using Groq Kimi k2-0905
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

  // Synthesize voice using Cartesia Sonic 3
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

  // Transcribe speech using Ink Whisper
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
    this.aiManager = new AIModelManager();
  }

  generateTwiML(callSid, speechResult = null) {
    const twiml = new VoiceResponse();

    // If we have a speech result, process it
    if (speechResult) {
      // Simple echo agent - can be extended with AI logic
      twiml.say(`You said: ${speechResult}`, { voice: 'Polly.Amy' });
    } else {
      // Initial greeting
      twiml.say('Welcome to the voice agent. Please speak after the beep.', {
        voice: 'Polly.Amy'
      });
    }

    // Gather user input
    const gather = twiml.gather({
      numDigits: 1,
      action: '/voice/handle-input',
      method: 'POST',
      timeout: 3,
      speechTimeout: 'auto'
    });

    gather.say('Please say something or press a key.', { voice: 'Polly.Amy' });

    // Fallback if no input
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
}

const voiceAgent = new VoiceAgent();

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Voice Agent is running',
    timestamp: new Date().toISOString()
  });
});

// Incoming call handler
app.post('/voice/incoming', (req, res) => {
  const { CallSid, From, To } = req.body;

  console.log(`Incoming call - CallSid: ${CallSid}, From: ${From}, To: ${To}`);

  voiceAgent.handleIncoming(CallSid, From, To);

  const twiml = voiceAgent.generateTwiML(CallSid);
  res.type('text/xml');
  res.send(twiml.toString());
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
  res.type('text/xml');
  res.send(twiml.toString());
});

// End call handler
app.post('/voice/end-call', (req, res) => {
  const { CallSid } = req.body;

  console.log(`Ending call - CallSid: ${CallSid}`);

  voiceAgent.endCall(CallSid);

  const twiml = new VoiceResponse();
  twiml.say('Thank you for calling. Goodbye!', { voice: 'Polly.Amy' });
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
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
    message: 'Twilio Voice Agent API',
    endpoints: {
      health: 'GET /health',
      incoming: 'POST /voice/incoming',
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Voice Agent server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Twilio Account SID: ${process.env.TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Not set'}`);
  console.log(`Twilio Auth Token: ${process.env.TWILIO_AUTH_TOKEN ? '✓ Set' : '✗ Not set'}`);
});

module.exports = app;
