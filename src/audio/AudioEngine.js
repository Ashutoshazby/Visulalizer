import { AudioAnalyzer } from "./AudioAnalyzer.js";

export class AudioEngine {
  constructor(audioElement, onFrame) {
    this.audio = audioElement;
    this.onFrame = onFrame;
    this.context = new AudioContext();
    this.source = this.context.createMediaElementSource(audioElement);
    this.analyzer = new AudioAnalyzer(this.context);
    this.source.connect(this.analyzer.input);
    this.analyzer.output.connect(this.context.destination);
    this.frame = null;
    this.loop = this.loop.bind(this);
    this.loop();
  }

  async resume() {
    if (this.context.state !== "running") await this.context.resume();
  }

  loop() {
    this.onFrame(this.analyzer.sample());
    this.frame = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.context.close();
  }
}
