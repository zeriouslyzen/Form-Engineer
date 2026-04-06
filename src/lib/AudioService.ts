/**
 * Bruce Lee Audio Coach
 * Using Web Speech API for low-latency feedback.
 */

export class AudioCoach {
  private static QUOTES = {
    PUNCH_START: [
      "No hesitation.",
      "Directness is the key.",
      "Snap it like a snake."
    ],
    PUNCH_END: [
      "Perfect. Economic.",
      "Good, be like water.",
      "The lead hand must move from where it is."
    ],
    TELEGRAPH: [
      "Do not pull back! You give warning.",
      "Economy of motion is everything.",
      "Strike without hesitation. Small movements, large results."
    ],
    IDLE: [
      "Empty your mind. Be formless, shapeless, like water.",
      "Knowing is not enough, we must apply.",
      "Willing is not enough, we must do."
    ]
  };

  private synth: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synth = window.speechSynthesis;
    this.initVoice();
  }

  private initVoice() {
    const voices = this.synth.getVoices();
    // Prioritize high-quality macOS female/neutral modern voices
    this.voice = voices.find(v => 
      v.name.includes("Flo") || 
      v.name.includes("Shelley") || 
      v.name.includes("Ava") || 
      v.name.includes("Samantha")
    ) || voices[0];
    
    if (!this.voice) {
        window.speechSynthesis.onvoiceschanged = () => {
            const updatedVoices = window.speechSynthesis.getVoices();
            this.voice = updatedVoices.find(v => 
              v.name.includes("Flo") || 
              v.name.includes("Shelley") || 
              v.name.includes("Ava") || 
              v.name.includes("Samantha")
            ) || updatedVoices[0];
        };
    }
  }

  public speak(type: 'PUNCH_START' | 'PUNCH_END' | 'TELEGRAPH' | 'IDLE') {
    if (this.synth.speaking) return;

    const options = AudioCoach.QUOTES[type];
    const quote = options[Math.floor(Math.random() * options.length)];
    
    const utter = new SpeechSynthesisUtterance(quote);
    if (this.voice) utter.voice = this.voice;
    utter.rate = 1.0;
    utter.pitch = 1.0; 
    
    this.synth.speak(utter);
  }

  public feedback(text: string) {
    if (this.synth.speaking) this.synth.cancel();
    
    // Split long text into shorter sentences for smoother TTS
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    sentences.forEach(sentence => {
      const utter = new SpeechSynthesisUtterance(sentence.trim());
      if (this.voice) utter.voice = this.voice;
      utter.rate = 1.0; 
      utter.pitch = 1.0; 
      this.synth.speak(utter);
    });
  }
}
