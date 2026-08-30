export class AudioAnalyzer {
  constructor(context) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.84;
    this.input.connect(this.analyser);
    this.analyser.connect(this.output);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousEnergy = 0;
    this.beat = 0;
  }

  sample() {
    this.analyser.getByteFrequencyData(this.data);
    const bass = band(this.data, 0, 8);
    const mid = band(this.data, 9, 80);
    const treble = band(this.data, 81, 220);
    const energy = (bass * 0.45 + mid * 0.35 + treble * 0.2);
    this.beat = Math.max(0, Math.min(1, (energy - this.previousEnergy - 0.08) * 5));
    this.previousEnergy = this.previousEnergy * 0.82 + energy * 0.18;
    return { bass, mid, treble, energy, beat: this.beat };
  }
}

function band(data, start, end) {
  let total = 0;
  const last = Math.min(data.length - 1, end);
  for (let index = start; index <= last; index += 1) total += data[index];
  return total / ((last - start + 1) * 255);
}
