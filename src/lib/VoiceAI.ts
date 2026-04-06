/**
 * JKD Voice AI & Ollama Bridge
 * Listens for commands and generates training sessions.
 */

export class VoiceAI {
  private recognition: any;
  private isListening = false;
  private onCommand: (command: string) => void;
  private history: any[] = [];

  constructor(onCommand: (command: string) => void) {
    this.onCommand = onCommand;
    this.history = [
      { 
        role: "system", 
        content: "You are a wise and encouraging JKD (Jeet Kune Do) mentor, providing guidance with the precision and philosophy of the art. Your tone is calm, sophisticated, and female. Provide technical feedback and philosophical insights as a mentor. Keep responses under 25 words." 
      }
    ];
    this.initRecognition();
  }

  private initRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      console.log("Voice Transcript:", transcript);
      
      // Keywords to trigger AI logic
      if (transcript.includes("dojo")) {
        this.onCommand(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        this.recognition.start(); // Keep listening
      }
    };
  }

  public start() {
    if (this.recognition && !this.isListening) {
      this.isListening = true;
      this.recognition.start();
    }
  }

  public stop() {
    this.isListening = false;
    if (this.recognition) {
       this.recognition.stop();
    }
  }

  /**
   * Converses naturally with the user using Ollama Chat.
   */
  public async chat(message: string, telemetry?: any): Promise<string> {
    try {
      // Add user message to history
      const userMessage = telemetry 
        ? `${message}. (Note: Current training stats - Punches: ${telemetry.punches}, Telegraphs: ${telemetry.telegraphs})`
        : message;
        
      this.history.push({ role: "user", content: userMessage });

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: 'gemma4:e2b',
          messages: this.history,
          stream: false
        }),
      });

      const data = await response.json();
      const aiResponse = data.message.content;
      
      // Keep history manageable
      this.history.push({ role: "assistant", content: aiResponse });
      if (this.history.length > 20) this.history.splice(1, 2); // Keep system prompt

      return aiResponse;
    } catch (err) {
      console.error("Ollama Chat Failed:", err);
      return "Empty your mind. Focus on the lead punch. Now.";
    }
  }

  public async generateDrill(command: string): Promise<string> {
    return this.chat(`Generate a short JKD drill based on: "${command}"`);
  }
}
