
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob } from "@google/genai";
import { SCENES, PERSONAS } from '../constants';
import { PersonaId, SceneId, Persona, SavedSession } from '../types';

export interface LiveSessionConfig {
  persona: Persona;
  onOpen: () => void;
  onMessage: (message: LiveServerMessage) => void;
  onClose: () => void;
  onError: (error: any) => void;
  tools?: any[];
  imageContext?: string | null;
  searchContext?: string | null;
}

export class GeminiService {
  private client: GoogleGenAI;
  private session: Promise<any> | null = null;

  constructor() {
    // Initializing Gemini API directly with environment variable.
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  connectLive(config: LiveSessionConfig): Promise<any> {
    const { persona, onOpen, onMessage, onClose, onError, tools, imageContext, searchContext } = config;

    const systemInstruction = `You are DeepSink, an immersive English native partner. 
Current Persona: ${persona.name} (${persona.role}). 
Description: ${persona.description}.

${imageContext ? `\n[IMAGE CONTEXT: The user uploaded an image. Description: ${imageContext}. Start by discussing this image.]` : ''}
${searchContext ? `\n[INTERNET CONTEXT: Here is grounded search data about the current topic: ${searchContext}. Use this to discuss real-world facts and recent news during the conversation.]` : ''}

CORE RULES:
1. IMMERSION: Behave exactly like your persona.
2. CORRECTION: Use the "shadowing" technique for grammar/fluency slips.
3. SCENE/PERSONA: Use tools if the user asks to switch environments or talk to someone else.
4. KNOWLEDGE: Use the provided search context to stay factually accurate about trending topics.`;

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
      return this.session;
    } catch (e) {
      console.error("Failed to initiate Live connection:", e);
      throw e;
    }
  }

  sendAudio(data: Blob) {
    if (this.session) {
      this.session.then(s => s.sendRealtimeInput({ media: data }));
    }
  }

  async sendToolResponse(toolResponse: any) {
    if (this.session) {
      const s = await this.session;
      s.sendToolResponse(toolResponse);
    }
  }

  async disconnect() {
    if (this.session) {
      const s = await this.session;
      s.close();
      this.session = null;
    }
  }

  async searchGrounding(query: string): Promise<{summary: string, links: {title: string, uri: string}[]}> {
    try {
      const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Research and summarize key conversational points about: ${query}. Focus on current news, trending aspects, and interesting facts that can serve as conversation starters. Keep the summary under 150 words.`,
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const text = response.text || "No summary available.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      // Fix: Title property missing map result by providing a fallback and explicitly handling the optional type.
      const links = chunks.map(c => c.web).filter((web): web is { title?: string; uri: string } => !!web).map(web => ({
        title: web.title || "Reference Source",
        uri: web.uri
      }));

      return { summary: text, links };
    } catch (e) {
      console.error("Search grounding failed:", e);
      throw e;
    }
  }

  async analyzeImage(base64Data: string, mimeType: string): Promise<string | undefined> {
    try {
      // Fix: Used the correct multimodal model 'gemini-2.5-flash'.
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [{ inlineData: { mimeType, data: base64Data } }, { text: "Analyze this image for conversational context." }]
        }
      });
      return response.text;
    } catch (e) {
      throw e;
    }
  }

  async generateReport(transcript: string): Promise<any> {
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Evaluate speaking performance based on this transcript:\n${transcript}`,
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
      return response.text ? JSON.parse(response.text) : null;
    } catch (e) {
      return null;
    }
  }

  async generateGlobalReport(sessions: SavedSession[]): Promise<any> {
    try {
      const historyText = sessions.map(s => s.messages.map(m => m.text).join(' ')).join('\n');
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize progress report based on these sessions:\n${historyText}`,
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
      return response.text ? JSON.parse(response.text) : null;
    } catch (e) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
