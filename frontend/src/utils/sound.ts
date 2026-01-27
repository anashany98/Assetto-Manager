
// Simple Sound Synthesizer using Web Audio API
// This avoids the need for external MP3 files and ensures sounds work immediately.

class SoundManager {
    private ctx: AudioContext | null = null;
    private enabled: boolean = true;

    constructor() {
        try {
            // @ts-ignore
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
        } catch (e) {
            console.warn("Web Audio API not supported");
            this.enabled = false;
        }
    }

    private ensureContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    public playClick() {
        if (!this.enabled || !this.ctx) return;
        this.ensureContext();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // High pitched short "tick"
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    public playHover() {
        if (!this.enabled || !this.ctx) return;
        this.ensureContext();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // Very subtle low "wub"
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.03);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.03);
    }

    public playConfirm() {
        if (!this.enabled || !this.ctx) return;
        this.ensureContext();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // Success chord / mechanical engagement
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
}

export const soundManager = new SoundManager();
