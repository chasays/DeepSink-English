import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob } from "@google/genai";
import { SCENES, PERSONAS } from '../constants';
import { PersonaId, SceneId, Persona } from '../types';

export interface LiveSessionConfig {
  persona: Persona;
  onOpen: () => void;
  onMessage: (message: LiveServerMessage) => void;
  onClose: () => void;
  onError: (error: any) => void;
  tools?: any[];
  imageContext?: string | null;
}

export class GeminiService {
  private client: GoogleGenAI;
  private session: Promise<any> | null = null;
  private apiKey: string;

  constructor() {
    // Ensure API Key is available
    this.apiKey = process.env.API_KEY || '';
    if (!this.apiKey) {
      console.error("API_KEY is missing from environment variables.");
    }
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }

  /**
   * Connects to the Gemini Live API with the specified configuration.
   */
  connectLive(config: LiveSessionConfig): Promise<any> {
    const { persona, onOpen, onMessage, onClose, onError, tools, imageContext } = config;

    const systemInstruction = `You are DeepSink, an immersive English native partner. 
Current Persona: ${persona.name} (${persona.role}). 
Description: ${persona.description}.

${imageContext ? `\n\n[CONTEXT UPDATE: The user has uploaded an image for this session. \nImage Analysis: ${imageContext}\n\nIMPORTANT: Start the conversation by discussing this image. Ask the user what they think about it.]` : ''}

CORE RULES:
1. IMMERSION: Behave exactly like your persona. Use their slang, tone, and attitude.
2. CORRECTION: If the user makes a mistake, gently repeat the correct version using the "shadowing" technique (say the correct phrase clearly for them to repeat), then continue the conversation naturally.
3. SCENE CONTROL: Listen to the user. If they say "I want to order coffee" or "Let's go to the beach", use the 'changeScene' tool immediately to switch the environment.
4. PERSONA CONTROL: If user asks to talk to someone else (e.g., "Can I talk to Ross?"), use 'changePersona'.

Keep responses concise (1-3 sentences) to encourage conversation.`;

    try {
      this.session = this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: onOpen,
          onmessage: onMessage,
          onclose: onClose,
          onerror: onError,
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {}, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voiceName } },
          },
          systemInstruction: systemInstruction,
          tools: tools ? [{ functionDeclarations: tools }] : undefined
        }
      });
      console.log("ConnetLive: OK", this.session);
      return this.session;
    } catch (e) {
      console.error("Failed to initiate Live connection:", e);
      throw e;
    }
  }

  /**
   * Sends real-time audio input to the active session.
   */
  sendAudio(data: Blob) {
    if (this.session) {
      this.session.then(s => s.sendRealtimeInput({ media: data }));
    }
  }

  /**
   * Sends a tool response back to the session.
   */
  async sendToolResponse(toolResponse: any) {
    if (this.session) {
      const s = await this.session;
      s.sendToolResponse(toolResponse);
    }
  }

  /**
   * Closes the active session.
   */
  async disconnect() {
    if (this.session) {
      const s = await this.session;
      s.close();
      this.session = null;
    }
  }

  /**
   * Analyzes an uploaded image using gemini-3-pro-preview.
   */
  async analyzeImage(base64Data: string, mimeType: string): Promise<string | undefined> {
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            {
              text: "Analyze this image for an English learner. Describe the setting, objects, and people (if any). Then, list 3 interesting questions or topics we could discuss about this image to practice English. Keep the output concise and conversational."
            }
          ]
        }
      });
      console.log("analyzeImg:", response.text);
      return response.text;
    } catch (e) {
      console.error("Image analysis failed:", e);
      throw e;
    }
  }

  /**
   * Generates a speaking performance report.
   */
  async generateReport(transcript: string): Promise<any> {
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze the following transcript between an English learner (User) and an AI tutor (DeepSink).
        
        TRANSCRIPT:
        ${transcript}
        
        TASK:
        Act as an encouraging but professional IELTS/TOEFL examiner. Evaluate the User's performance.
        
        OUTPUT SCHEMA:
        Return a JSON object with:
        - total: number (0-100 overall score)
        - fluency: number (0-100, flow and speed)
        - vocabulary: number (0-100, word choice and variety)
        - nativeLike: number (0-100, idiomatic usage and vibe)
        - comment: string (Maximum 2 sentences. A specific, warm, and constructive observation about their speaking)`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              total: { type: Type.NUMBER },
              fluency: { type: Type.NUMBER },
              vocabulary: { type: Type.NUMBER },
              nativeLike: { type: Type.NUMBER },
              comment: { type: Type.STRING },
            },
            required: ["total", "fluency", "vocabulary", "nativeLike", "comment"]
          }
        }
      });

      if (response.text) {
        console.log("GenerateReport:", response.text);
        return JSON.parse(response.text);
      }
      return null;
    } catch (e) {
      console.error("Report generation failed:", e);
      return null;
    }
  }
}

export const geminiService = new GeminiService();