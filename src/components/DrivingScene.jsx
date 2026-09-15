import { useEffect, useRef } from "react";
import { mapAudioToScene } from "../audio/VisualAudioMapper.js";

export default function DrivingScene({ audioData, moodContext, song, playing, visualSpeed = 1 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    z: 0,
    particles: [],
    glassDrops: [],
    steering: 0,
    driverLane: 0,
    driverVelocity: 0,
    brakeHold: 0,
    lightning: 0,
    nextLightning: 120,
    controls: { left: false, right: false, up: false, down: false }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let frame;
    let last = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      const delta = Math.min(32, now - last) / 16.67;
      last = now;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const environment = getEnvironment(moodContext.phase);
      const metrics = applyEnvironment(mapAudioToScene(audioData, moodContext, reducedMotion), environment);
      const state = stateRef.current;
      const inputSteer = Number(state.controls.right) - Number(state.controls.left);
      const inputThrottle = Number(state.controls.up) - Number(state.controls.down);
      const manualActive = Boolean(inputSteer || inputThrottle);
      const targetVelocity = inputSteer * 0.052;
      state.driverVelocity += (targetVelocity - state.driverVelocity) * Math.min(1, delta * 0.13);
      state.driverLane = clamp(state.driverLane + state.driverVelocity * delta, -0.96, 0.96);
      state.driverLane *= 1 - Math.min(0.07, delta * (manualActive ? 0.006 : 0.018));
      state.brakeHold = state.controls.down
        ? clamp(state.brakeHold + delta * 0.035, 0, 1)
        : Math.max(0, state.brakeHold - delta * 0.055);
      if (state.controls.up) state.brakeHold = Math.max(0, state.brakeHold - delta * 0.12);
      const manualBoost = Math.max(0, inputThrottle);
      const manualBrake = Math.max(0, -inputThrottle);
      const turnLoad = clamp(Math.abs(state.driverVelocity) * 7.5 + Math.abs(inputSteer) * 0.18 + Math.abs(state.driverLane) * 0.12, 0, 0.52);
      const brakeCut = clamp(state.brakeHold * 1.18 + manualBrake * 0.18, 0, 1);
      const roadMotion = clamp((1 + manualBoost * 0.34) * (1 - turnLoad) * (1 - brakeCut), 0, 1.32);
      metrics.manualBoost = manualBoost;
      metrics.manualBrake = manualBrake;
      metrics.manualSteer = inputSteer;
      metrics.brakeHold = state.brakeHold;
      metrics.turnLoad = turnLoad;
      metrics.roadMotion = roadMotion;
      metrics.driveIntensity = Math.min(1, Math.abs(state.driverLane) + Math.abs(state.driverVelocity) * 9 + metrics.manualBoost * 0.5);
      const baseSpeed = 42 + metrics.roadSpeed * visualSpeed * 38;
      metrics.displaySpeed = Math.max(0, Math.round(baseSpeed * roadMotion + manualBoost * 18 - state.brakeHold * 22));
      metrics.rpm = clamp(0.12 + roadMotion * 0.42 + manualBoost * 0.22 + audioData.beat * 0.14 - state.brakeHold * 0.28, 0.04, 1);
      if (playing || !reducedMotion) state.z += delta * metrics.roadSpeed * visualSpeed * roadMotion;
      state.nextLightning -= delta;
      if (metrics.rain > 0.45 && state.nextLightning < 0) {
        state.lightning = 1;
        state.nextLightning = 220 + Math.random() * 520;
      }
      state.lightning = Math.max(0, state.lightning - delta * 0.085);
      const road = makeRoadModel(width, height, state.z, metrics, audioData, visualSpeed, state.driverLane);
      state.steering += (road.steeringTarget + inputSteer * 0.68 + state.driverLane * 0.16 - state.steering) * Math.min(1, delta * 0.1);
      drawSky(context, width, height, moodContext, audioData, metrics, state, environment);
      context.save();
      applyCameraLean(context, width, height, state, metrics);
      drawCity(context, width, height, state.z, metrics, moodContext, road, environment);
      drawStreetLights(context, width, height, state.z, metrics, road, environment);
      drawRoadsideDetails(context, width, height, state.z, metrics, road, environment);
      drawRoad(context, width, height, state.z, metrics, road, environment);
      drawRain(context, width, height, state, delta, metrics);
      drawSpeedStreaks(context, width, height, state.z, metrics, road);
      context.restore();
      drawOverlays(context, width, height, metrics, moodContext, environment);
      drawCockpit(context, width, height, metrics, song, state.steering, road, state, delta);
      drawDrivingHud(context, width, height, state, metrics);
      frame = requestAnimationFrame(draw);
    };

    const updateControls = (event, active) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const controls = stateRef.current.controls;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") controls.left = active;
      else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") controls.right = active;
      else if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") controls.up = active;
      else if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") controls.down = active;
      else return;
      event.preventDefault();
    };
    const onKeyDown = (event) => updateControls(event, true);
    const onKeyUp = (event) => updateControls(event, false);

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [audioData, moodContext, playing, song, visualSpeed]);

  return <canvas className="driving-scene" ref={canvasRef} aria-label="Reactive night highway driving scene" />;
}

function getEnvironment(phase) {
  const environments = {
    morning: {
      sky: ["#385263", "#d09672", "#1f3035"],
      road: ["#263230", "#171e1d", "#080b0b"],
      shoulder: 0.22,
      cityAlpha: 0.54,
      windowAlpha: 0.36,
      lampAlpha: 0.28,
      headlightAlpha: 0.55,
      rainFactor: 0.24,
      haze: "rgba(196, 215, 208,",
      vignette: 0.32,
      stars: 0.04
    },
    afternoon: {
      sky: ["#526c78", "#9eb2b5", "#233334"],
      road: ["#2b3330", "#1b211f", "#0c0f0e"],
      shoulder: 0.18,
      cityAlpha: 0.48,
      windowAlpha: 0.18,
      lampAlpha: 0.12,
      headlightAlpha: 0.4,
      rainFactor: 0.18,
      haze: "rgba(205, 218, 208,",
      vignette: 0.26,
      stars: 0
    },
    evening: {
      sky: ["#18243a", "#684c54", "#181d25"],
      road: ["#202727", "#131817", "#060707"],
      shoulder: 0.28,
      cityAlpha: 0.72,
      windowAlpha: 0.58,
      lampAlpha: 0.78,
      headlightAlpha: 0.78,
      rainFactor: 0.52,
      haze: "rgba(183, 165, 150,",
      vignette: 0.48,
      stars: 0.12
    },
    night: {
      sky: ["#050a13", "#101723", "#050708"],
      road: ["#171b1a", "#101312", "#050606"],
      shoulder: 0.34,
      cityAlpha: 0.82,
      windowAlpha: 0.76,
      lampAlpha: 1,
      headlightAlpha: 1,
      rainFactor: 0.72,
      haze: "rgba(134, 153, 151,",
      vignette: 0.6,
      stars: 0.2
    },
    "late-night": {
      sky: ["#010207", "#050912", "#030405"],
      road: ["#121514", "#0b0d0d", "#030404"],
      shoulder: 0.42,
      cityAlpha: 0.64,
      windowAlpha: 0.44,
      lampAlpha: 0.86,
      headlightAlpha: 1.08,
      rainFactor: 1,
      haze: "rgba(126, 145, 150,",
      vignette: 0.72,
      stars: 0.26
    }
  };
  return environments[phase] || environments.night;
}

function applyEnvironment(metrics, environment) {
  return {
    ...metrics,
    rain: Math.max(0.02, metrics.rain * environment.rainFactor),
    glow: metrics.glow * environment.lampAlpha,
    buildingActivity: metrics.buildingActivity * environment.windowAlpha,
    reflections: metrics.reflections * environment.headlightAlpha
  };
}

function applyCameraLean(ctx, width, height, state, metrics) {
  const roll = clamp(state.driverLane * 0.028 + state.driverVelocity * 0.42 + metrics.manualSteer * 0.012, -0.055, 0.055);
  const sway = clamp(-state.driverLane * width * 0.018 - state.driverVelocity * width * 0.18, -width * 0.035, width * 0.035);
  const lift = -metrics.manualBoost * height * 0.012 + metrics.manualBrake * height * 0.008;
  ctx.translate(width / 2 + sway, height * 0.56 + lift);
  ctx.rotate(roll);
  ctx.translate(-width / 2, -height * 0.56);
}

function makeRoadModel(width, height, z, metrics, audio, visualSpeed, driverLane = 0) {
  const horizon = height * 0.35;
  const dash = height * 0.94;
  const curvePhase = z * 0.018;
  const mainCurve = Math.sin(curvePhase) * 0.54 + Math.sin(curvePhase * 0.43 + 1.7) * 0.34;
  const nextCurve = Math.sin(curvePhase + 0.9) * 0.54 + Math.sin((curvePhase + 0.9) * 0.43 + 1.7) * 0.34;
  const bassLean = (audio.bass - 0.35) * 0.025;
  return {
    horizon,
    dash,
    visualSpeed,
    steeringTarget: Math.max(-0.55, Math.min(0.55, (nextCurve - mainCurve) * 0.7 + mainCurve * 0.25)),
    centerAt(t) {
      const perspective = Math.pow(t, 1.48);
      const farCurve = Math.sin(curvePhase + t * 1.2) * 0.24;
      const nearCurve = Math.sin(curvePhase * 0.74 + t * 2.6) * 0.18;
      const manualLaneShift = driverLane * width * 0.16 * Math.pow(t, 1.08);
      return width / 2 + (mainCurve * perspective + farCurve * t + nearCurve * perspective) * width * 0.21 + bassLean * width - manualLaneShift;
    },
    yAt(t) {
      return horizon + Math.pow(t, 1.72) * (dash - horizon);
    },
    halfAt(t) {
      return width * (0.034 + Math.pow(t, 1.3) * 0.54);
    },
    shoulderAt(t) {
      return width * (0.07 + Math.pow(t, 1.12) * 0.14 + metrics.glow * 0.016);
    }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawSky(ctx, width, height, mood, audio, metrics, state, environment) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, environment.sky[0]);
  gradient.addColorStop(0.58, environment.sky[1]);
  gradient.addColorStop(1, environment.sky[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawCloudDeck(ctx, width, height, state.z, metrics, state.lightning);
  drawLightning(ctx, width, height, state.lightning);

  ctx.globalAlpha = environment.stars + audio.treble * environment.stars;
  for (let i = 0; i < 55; i += 1) {
    const x = (i * 173) % width;
    const y = 22 + ((i * 61) % Math.max(140, height * 0.4));
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawCloudDeck(ctx, width, height, z, metrics, lightning) {
  const cloudAlpha = 0.34 + metrics.rain * 0.28 + lightning * 0.22;
  for (let layer = 0; layer < 3; layer += 1) {
    const y = height * (0.1 + layer * 0.115);
    const drift = (z * (0.16 + layer * 0.07)) % (width * 0.7);
    for (let i = -2; i < 7; i += 1) {
      const x = i * width * 0.28 - drift + layer * 90;
      const radiusX = width * (0.22 + layer * 0.06);
      const radiusY = height * (0.08 + layer * 0.025);
      const cloud = ctx.createRadialGradient(x, y, radiusY * 0.15, x, y, radiusX);
      cloud.addColorStop(0, `rgba(67, 79, 91, ${cloudAlpha * (0.48 - layer * 0.06)})`);
      cloud.addColorStop(0.58, `rgba(22, 29, 39, ${cloudAlpha * 0.34})`);
      cloud.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cloud;
      ctx.save();
      ctx.scale(1, 0.42 + layer * 0.08);
      ctx.fillRect(x - radiusX, (y - radiusY) / (0.42 + layer * 0.08), radiusX * 2, radiusY * 4);
      ctx.restore();
    }
  }
}

function drawLightning(ctx, width, height, amount) {
  if (amount <= 0.01) return;
  ctx.fillStyle = `rgba(170, 205, 235, ${amount * 0.1})`;
  ctx.fillRect(0, 0, width, height * 0.66);
  ctx.strokeStyle = `rgba(210, 232, 255, ${amount * 0.42})`;
  ctx.lineWidth = 1.4;
  const startX = width * (0.22 + (Math.sin(amount * 17) + 1) * 0.28);
  let x = startX;
  let y = height * 0.03;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 8; i += 1) {
    x += (Math.sin(i * 9.7 + amount * 12) * 22);
    y += height * 0.035;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawCity(ctx, width, height, z, metrics, mood, road, environment) {
  const horizon = road.horizon;
  drawDistantSkyline(ctx, width, height, z, metrics, mood, road, environment);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i += 1) {
      const t = ((i * 0.22 + z * 0.005 * road.visualSpeed) % 1 + 1) % 1;
      if (t < 0.28 || t > 0.72) continue;
      const center = road.centerAt(t);
      const scale = 0.34 + Math.pow(t, 1.28) * 2.1;
      const buildingWidth = (22 + (i % 4) * 10) * scale;
      const buildingHeight = (62 + (i % 5) * 32) * scale;
      const shoulder = road.halfAt(t) + road.shoulderAt(t) + width * (0.08 + t * 0.08);
      const x = center + side * shoulder;
      const groundY = road.yAt(t) + 22 * scale;
      const y = groundY - buildingHeight;
      if (x < -buildingWidth * 1.8 || x > width + buildingWidth * 1.8) continue;
      ctx.fillStyle = `rgba(8, 11, 18, ${0.24 + environment.cityAlpha * 0.18})`;
      ctx.fillRect(x - buildingWidth / 2, y, buildingWidth, buildingHeight);
      ctx.fillStyle = `rgba(218, 174, 98, ${0.02 + metrics.buildingActivity * 0.14})`;
      const cols = Math.max(2, Math.floor(buildingWidth / 16));
      const rows = Math.max(3, Math.floor(buildingHeight / 18));
      for (let w = 0; w < cols; w += 1) {
        for (let h = 0; h < rows; h += 1) {
          if ((i + w * 2 + h + Math.floor(z * 0.1)) % 4 === 0) continue;
          ctx.fillRect(x - buildingWidth * 0.32 + w * 12 * scale, y + 10 * scale + h * 13 * scale, 2.4 * scale, 3.2 * scale);
        }
      }
    }
  }
}

function drawDistantSkyline(ctx, width, height, z, metrics, mood, road, environment) {
  const horizon = road.horizon;
  for (let i = 0; i < 10; i += 1) {
    const x = ((i * width * 0.09 - z * 0.28) % (width * 1.2) + width * 1.2) % (width * 1.2) - width * 0.1;
    const w = 24 + (i % 5) * 10;
    const h = 58 + (i % 6) * 18;
    const y = horizon - h + 8;
    ctx.fillStyle = `rgba(5, 9, 15, ${0.18 + environment.cityAlpha * 0.24})`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = `rgba(211, 170, 94, ${0.035 + metrics.buildingActivity * 0.08})`;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if ((row + col + i) % 3 === 0) ctx.fillRect(x + 6 + col * 7, y + 8 + row * 10, 2, 3);
      }
    }
  }
}

function drawStreetLights(ctx, width, height, z, metrics, road, environment) {
  if (environment.lampAlpha < 0.18) return;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 5; i += 1) {
      const depth = ((i * 230 - z * 28) % 980 + 980) % 980;
      const t = Math.min(1, depth / 980);
      const scale = 0.28 + Math.pow(t, 1.08) * 1.1;
      const center = road.centerAt(t);
      const x = center + side * (road.halfAt(t) + road.shoulderAt(t) * 0.34);
      const y = road.yAt(t);
      const pole = 108 * scale;
      ctx.strokeStyle = `rgba(103, 116, 121, ${0.1 + scale * 0.14})`;
      ctx.lineWidth = Math.max(1, 1.35 * scale);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - pole);
      ctx.lineTo(x - side * 24 * scale, y - pole - 8 * scale);
      ctx.stroke();
      const glow = ctx.createRadialGradient(x - side * 24 * scale, y - pole - 8 * scale, 1, x - side * 24 * scale, y - pole - 8 * scale, 54 * scale);
      glow.addColorStop(0, `rgba(255, 220, 150, ${(0.13 + metrics.glow * 0.07) * environment.lampAlpha})`);
      glow.addColorStop(0.42, `rgba(218, 160, 82, ${(0.04 + metrics.glow * 0.035) * environment.lampAlpha})`);
      glow.addColorStop(1, "rgba(255, 170, 70, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 76 * scale, y - pole - 82 * scale, 152 * scale, 140 * scale);
    }
  }
}

function drawRoadsideDetails(ctx, width, height, z, metrics, road, environment) {
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 8; i += 1) {
      const t = ((i * 0.16 + z * 0.02 * road.visualSpeed) % 1 + 1) % 1;
      if (t < 0.04) continue;
      const center = road.centerAt(t);
      const y = road.yAt(t);
      const x = center + side * (road.halfAt(t) + road.shoulderAt(t) * 0.72);
      const postHeight = 7 + t * 42;
      ctx.strokeStyle = `rgba(105, 118, 116, ${0.12 + t * 0.32})`;
      ctx.lineWidth = Math.max(1, t * 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * 2, y - postHeight);
      ctx.stroke();
      ctx.fillStyle = `rgba(230, 173, 92, ${(0.04 + t * 0.18 + metrics.glow * 0.03) * environment.lampAlpha})`;
      ctx.fillRect(x - 2, y - postHeight, 4 + t * 6, 2 + t * 5);
      if (t > 0.58) {
        ctx.strokeStyle = `rgba(135, 150, 146, ${0.07 + t * 0.18})`;
        ctx.lineWidth = Math.max(1, t * 2.5);
        ctx.beginPath();
        ctx.moveTo(x, y - postHeight * 0.55);
        ctx.lineTo(x - side * road.shoulderAt(t) * 1.25, y - postHeight * 0.42);
        ctx.stroke();
      }
    }
  }

  for (let i = 0; i < 1; i += 1) {
    const t = 0.16 + i * 0.13;
    const center = road.centerAt(t);
    const y = road.yAt(t) - 28 * t;
    const side = i % 2 ? 1 : -1;
    const x = center + side * (road.halfAt(t) + road.shoulderAt(t) * 1.35);
    const scale = 0.25 + t * 0.8;
    ctx.save();
    ctx.globalAlpha = 0.12 + t * 0.2;
    ctx.fillStyle = "#182022";
    roundRect(ctx, x - 22 * scale, y - 16 * scale, 44 * scale, 24 * scale, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(170, 185, 177, 0.28)";
    ctx.stroke();
    ctx.restore();
  }
}

function drawRoad(ctx, width, height, z, metrics, road, environment) {
  const left = [];
  const right = [];
  const shoulderLeft = [];
  const shoulderRight = [];
  const steps = 54;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = road.yAt(t);
    const center = road.centerAt(t);
    const half = road.halfAt(t);
    const shoulder = road.shoulderAt(t);
    left.push([center - half, y]);
    right.push([center + half, y]);
    shoulderLeft.push([center - half - shoulder, y]);
    shoulderRight.push([center + half + shoulder, y]);
  }

  ctx.fillStyle = "#05080b";
  ctx.beginPath();
  shoulderLeft.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  [...shoulderRight].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();

  const shoulderGradient = ctx.createLinearGradient(0, road.horizon, 0, road.dash);
  shoulderGradient.addColorStop(0, "rgba(30, 52, 65, 0.05)");
  shoulderGradient.addColorStop(1, `rgba(48, 142, 160, ${environment.shoulder + metrics.glow * 0.08})`);
  ctx.fillStyle = shoulderGradient;
  ctx.beginPath();
  shoulderLeft.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  left.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  right.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  shoulderRight.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();

  const asphalt = ctx.createLinearGradient(0, road.horizon, 0, road.dash);
  asphalt.addColorStop(0, environment.road[0]);
  asphalt.addColorStop(0.48, environment.road[1]);
  asphalt.addColorStop(1, environment.road[2]);
  ctx.fillStyle = asphalt;
  ctx.beginPath();
  left.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  right.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  left.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  right.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.clip();
  drawWetAsphalt(ctx, width, height, z, metrics, road);
  drawRoadReflections(ctx, width, z, metrics, road);
  ctx.restore();

  drawRoadEdge(ctx, left, `rgba(112, 165, 168, ${0.16 + metrics.glow * 0.12})`, 1.3);
  drawRoadEdge(ctx, right, `rgba(112, 165, 168, ${0.16 + metrics.glow * 0.12})`, 1.3);
  drawGuardRails(ctx, left, right, metrics);

  for (let i = -2; i < 16; i += 1) {
    const base = ((i * 0.115 + z * 0.052) % 1.25 + 1.25) % 1.25;
    const t1 = Math.min(0.98, base);
    const t2 = Math.min(0.995, base + 0.055 + t1 * 0.055);
    if (t1 < 0.02 || t1 > 0.98) continue;
    drawLaneDash(ctx, road, t1, t2, 0, 0.007 + t1 * 0.012, `rgba(231, 218, 139, ${0.28 + t1 * 0.48})`);
    drawLaneDash(ctx, road, t1, t2, -0.36, 0.004 + t1 * 0.007, `rgba(176, 186, 184, ${0.1 + t1 * 0.22})`);
    drawLaneDash(ctx, road, t1, t2, 0.36, 0.004 + t1 * 0.007, `rgba(176, 186, 184, ${0.1 + t1 * 0.22})`);
  }
  drawRumbleStrips(ctx, z, metrics, road);
  drawRoadChevrons(ctx, z, metrics, road);

  const headlight = ctx.createRadialGradient(width / 2, road.dash * 0.94, width * 0.05, width / 2, road.dash * 0.88, width * 0.56);
  headlight.addColorStop(0, `rgba(235, 226, 186, ${(0.11 + metrics.glow * 0.05) * environment.headlightAlpha})`);
  headlight.addColorStop(0.52, `rgba(111, 136, 132, ${(0.06 + metrics.glow * 0.04) * environment.headlightAlpha})`);
  headlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = headlight;
  ctx.fillRect(0, road.horizon, width, road.dash - road.horizon);
}

function drawRumbleStrips(ctx, z, metrics, road) {
  for (let side = -1; side <= 1; side += 2) {
    for (let i = -1; i < 18; i += 1) {
      const t = ((i * 0.07 + z * 0.07) % 1.08 + 1.08) % 1.08;
      if (t < 0.08 || t > 0.98) continue;
      const offset = side * (0.92 + t * 0.13);
      const p1 = lanePoint(road, t, offset);
      const p2 = lanePoint(road, Math.min(0.995, t + 0.018 + t * 0.018), offset);
      const alpha = 0.08 + t * 0.18 + metrics.driveIntensity * 0.1;
      ctx.strokeStyle = `rgba(231, 214, 132, ${alpha})`;
      ctx.lineWidth = 2 + t * 6;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
}

function drawRoadChevrons(ctx, z, metrics, road) {
  if (metrics.driveIntensity < 0.12) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 7; i += 1) {
    const t = ((i * 0.13 + z * 0.038) % 1 + 1) % 1;
    if (t < 0.22 || t > 0.92) continue;
    const center = lanePoint(road, t, 0);
    const width = road.halfAt(t) * (0.16 + t * 0.08);
    const height = 10 + t * 36;
    ctx.strokeStyle = `rgba(125, 224, 238, ${metrics.driveIntensity * (0.05 + t * 0.09)})`;
    ctx.lineWidth = 1 + t * 4;
    ctx.beginPath();
    ctx.moveTo(center.x - width, center.y + height * 0.45);
    ctx.lineTo(center.x, center.y);
    ctx.lineTo(center.x + width, center.y + height * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoadEdge(ctx, points, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

function drawGuardRails(ctx, left, right, metrics) {
  for (const [points, side] of [[left, -1], [right, 1]]) {
    ctx.save();
    ctx.strokeStyle = `rgba(156, 181, 176, ${0.05 + metrics.driveIntensity * 0.06})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const railX = x + side * 18;
      const railY = y - 12;
      index ? ctx.lineTo(railX, railY) : ctx.moveTo(railX, railY);
    });
    ctx.stroke();
    ctx.strokeStyle = `rgba(235, 195, 120, ${0.04 + metrics.glow * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    points.filter((_, index) => index % 6 === 0).forEach(([x, y], index) => {
      const railX = x + side * 18;
      index ? ctx.lineTo(railX, y - 15) : ctx.moveTo(railX, y - 15);
    });
    ctx.stroke();
    ctx.restore();
  }
}

function drawWetAsphalt(ctx, width, height, z, metrics, road) {
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 95; i += 1) {
    const seed = i * 97.13;
    const t = ((seed * 0.003 + z * 0.031) % 1 + 1) % 1;
    const center = road.centerAt(t);
    const spread = road.halfAt(t) * 1.65;
    const x = center + Math.sin(seed) * spread;
    const y = road.yAt(t);
    const length = 8 + t * 58;
    const alpha = (0.012 + t * 0.04) * (0.6 + metrics.rain * 0.8);
    ctx.strokeStyle = `rgba(190, 210, 205, ${alpha})`;
    ctx.lineWidth = 1 + t * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(seed * 2) * 6, Math.min(height, y + length));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawRoadReflections(ctx, width, z, metrics, road) {
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 11; i += 1) {
      const t = ((i * 0.13 + z * 0.018) % 1 + 1) % 1;
      if (t < 0.16) continue;
      const center = road.centerAt(t);
      const x = center + side * road.halfAt(t) * (0.75 + Math.sin(i) * 0.14);
      const y = road.yAt(t);
      const reflection = ctx.createLinearGradient(x, y - 8, x + side * width * 0.035, y + 110 * t);
      reflection.addColorStop(0, `rgba(236, 184, 103, ${0.1 + metrics.glow * 0.07})`);
      reflection.addColorStop(1, "rgba(236, 184, 103, 0)");
      ctx.strokeStyle = reflection;
      ctx.lineWidth = 8 + t * 24;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * 12, y + 80 * t);
      ctx.stroke();
    }
  }
}

function drawLaneDash(ctx, road, t1, t2, offset, widthRatio, color) {
  const p1 = lanePoint(road, t1, offset);
  const p2 = lanePoint(road, t2, offset);
  const halfWidth = road.halfAt(t2) * widthRatio;
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
  const dx = Math.cos(angle) * halfWidth;
  const dy = Math.sin(angle) * halfWidth;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p1.x - dx, p1.y - dy);
  ctx.lineTo(p1.x + dx, p1.y + dy);
  ctx.lineTo(p2.x + dx, p2.y + dy);
  ctx.lineTo(p2.x - dx, p2.y - dy);
  ctx.closePath();
  ctx.fill();
}

function lanePoint(road, t, offset) {
  return {
    x: road.centerAt(t) + road.halfAt(t) * offset,
    y: road.yAt(t)
  };
}

function drawRain(ctx, width, height, state, delta, metrics) {
  const amount = Math.floor(metrics.rain * 130);
  while (state.particles.length < amount) {
    state.particles.push({ x: Math.random() * width, y: Math.random() * height, length: 12 + Math.random() * 24, speed: 8 + Math.random() * 11 });
  }
  state.particles.length = amount;
  ctx.strokeStyle = `rgba(183, 216, 235, ${0.08 + metrics.reflections * 0.14})`;
  ctx.lineWidth = 0.8;
  for (const drop of state.particles) {
    drop.y += drop.speed * delta;
    drop.x -= drop.speed * 0.25 * delta;
    if (drop.y > height) {
      drop.y = -20;
      drop.x = Math.random() * width;
    }
    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - 5, drop.y + drop.length);
    ctx.stroke();
  }
}

function drawSpeedStreaks(ctx, width, height, z, metrics, road) {
  const beat = Number.isFinite(metrics.beat) ? metrics.beat : 0;
  const intensity = Math.max(0, road.visualSpeed - 1) / 1.25 + beat * 0.35 + metrics.manualBoost * 0.45 + metrics.driveIntensity * 0.2;
  if (intensity <= 0.03) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 14; i += 1) {
      const t = ((i * 0.073 + z * 0.045) % 1 + 1) % 1;
      if (t < 0.18) continue;
      const p = lanePoint(road, t, side * (0.78 + t * 0.36));
      const len = (22 + t * 120) * intensity;
      ctx.strokeStyle = `rgba(196, 220, 214, ${0.035 + intensity * 0.08})`;
      ctx.lineWidth = 1 + t * 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - side * len * 0.25, p.y + len);
      ctx.stroke();
    }
  }

  const flare = ctx.createRadialGradient(width / 2, road.dash * 0.84, width * 0.04, width / 2, road.dash * 0.82, width * 0.72);
  flare.addColorStop(0, `rgba(240, 222, 166, ${0.03 + intensity * 0.045})`);
  flare.addColorStop(0.5, `rgba(128, 150, 145, ${0.025 + intensity * 0.035})`);
  flare.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, road.horizon, width, road.dash - road.horizon);
  ctx.restore();
}

function drawCockpit(ctx, width, height, metrics, song, steering, road, state, delta) {
  drawWindshield(ctx, width, height, metrics, road);
  drawWindshieldWeather(ctx, width, height, metrics, state, delta);
  const driverX = width * 0.63;
  const dashY = height * 0.855;
  const pulse = metrics.glow;
  const dashGradient = ctx.createLinearGradient(0, dashY, 0, height);
  dashGradient.addColorStop(0, "rgba(18, 23, 24, 0.76)");
  dashGradient.addColorStop(0.32, "rgba(7, 9, 10, 0.98)");
  dashGradient.addColorStop(1, "#000000");
  ctx.fillStyle = dashGradient;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.quadraticCurveTo(width * 0.28, dashY + 4, width * 0.5, dashY + 20);
  ctx.quadraticCurveTo(width * 0.72, dashY + 4, width, height);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fill();

  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillRect(0, height * 0.915, width, height * 0.085);

  drawHood(ctx, width, height, metrics, steering);
  drawAirmassAndPillars(ctx, width, height, metrics, road);
  drawDashboardDetails(ctx, width, height, metrics, driverX);
  drawInstrumentCluster(ctx, width, height, metrics, driverX);
  drawSteeringWheel(ctx, width, height, steering, pulse, driverX);
  drawPedalGlow(ctx, width, height, metrics);
}

function drawPedalGlow(ctx, width, height, metrics) {
  const y = height * 0.965;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (metrics.manualBoost > 0.02) {
    const boost = ctx.createRadialGradient(width * 0.76, y, 2, width * 0.76, y, width * 0.12);
    boost.addColorStop(0, `rgba(116, 226, 238, ${0.14 + metrics.manualBoost * 0.18})`);
    boost.addColorStop(1, "rgba(116, 226, 238, 0)");
    ctx.fillStyle = boost;
    ctx.fillRect(width * 0.58, height * 0.82, width * 0.34, height * 0.18);
  }
  if (metrics.manualBrake > 0.02) {
    const brake = ctx.createRadialGradient(width * 0.27, y, 2, width * 0.27, y, width * 0.11);
    brake.addColorStop(0, `rgba(238, 92, 78, ${0.12 + metrics.manualBrake * 0.16})`);
    brake.addColorStop(1, "rgba(238, 92, 78, 0)");
    ctx.fillStyle = brake;
    ctx.fillRect(width * 0.12, height * 0.82, width * 0.3, height * 0.18);
  }
  ctx.restore();
}

function drawWindshield(ctx, width, height, metrics, road) {
  const glass = ctx.createLinearGradient(0, road.horizon, 0, height);
  glass.addColorStop(0, "rgba(122, 160, 172, 0.02)");
  glass.addColorStop(0.6, `rgba(92, 129, 135, ${0.035 + metrics.reflections * 0.025})`);
  glass.addColorStop(1, "rgba(0,0,0,0.03)");
  ctx.fillStyle = glass;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = `rgba(34, 49, 52, ${0.28 + metrics.reflections * 0.05})`;
  ctx.lineWidth = Math.max(3, width * 0.0035);
  ctx.beginPath();
  ctx.moveTo(width * 0.08, height);
  ctx.lineTo(width * 0.2, road.horizon * 0.92);
  ctx.moveTo(width * 0.92, height);
  ctx.lineTo(width * 0.8, road.horizon * 0.92);
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width * 0.045, height);
  ctx.lineTo(width * 0.185, road.horizon * 0.92);
  ctx.lineTo(width * 0.165, road.horizon);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, height);
  ctx.lineTo(width * 0.955, height);
  ctx.lineTo(width * 0.815, road.horizon * 0.92);
  ctx.lineTo(width * 0.835, road.horizon);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(212, 244, 255, ${0.04 + metrics.reflections * 0.11})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = height * (0.16 + i * 0.11);
    ctx.beginPath();
    ctx.moveTo(width * (0.22 + i * 0.07), y);
    ctx.quadraticCurveTo(width * 0.5, y + 22, width * (0.75 - i * 0.04), y - 8);
    ctx.stroke();
  }
}

function drawWindshieldWeather(ctx, width, height, metrics, state, delta) {
  const target = Math.floor(metrics.rain * 46);
  while (state.glassDrops.length < target) {
    state.glassDrops.push({
      x: Math.random() * width,
      y: Math.random() * height * 0.78,
      r: 1.2 + Math.random() * 3.4,
      speed: 0.18 + Math.random() * 0.9,
      smear: Math.random() * 34
    });
  }
  state.glassDrops.length = target;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const drop of state.glassDrops) {
    drop.y += drop.speed * delta;
    if (drop.y > height * 0.78) {
      drop.y = Math.random() * height * 0.18;
      drop.x = Math.random() * width;
    }
    const alpha = 0.04 + metrics.reflections * 0.1;
    ctx.strokeStyle = `rgba(205, 230, 235, ${alpha})`;
    ctx.lineWidth = Math.max(0.6, drop.r * 0.45);
    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - drop.r * 0.4, drop.y + drop.smear);
    ctx.stroke();
    ctx.fillStyle = `rgba(218, 240, 244, ${alpha * 0.7})`;
    ctx.beginPath();
    ctx.ellipse(drop.x, drop.y, drop.r * 0.5, drop.r, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const sweep = (Math.sin(state.z * 0.028) + 1) / 2;
  if (metrics.rain > 0.38) {
    ctx.save();
    ctx.strokeStyle = "rgba(3, 5, 6, 0.34)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    drawWiper(ctx, width * 0.36, height * 0.87, width * 0.15, -0.24 + sweep * 0.14);
    drawWiper(ctx, width * 0.64, height * 0.87, width * 0.15, -0.74 + sweep * 0.14);
    ctx.strokeStyle = "rgba(210, 230, 230, 0.035)";
    ctx.lineWidth = 14;
    drawWiper(ctx, width * 0.5, height * 0.87, width * 0.23, -0.52 + sweep * 0.14);
    ctx.restore();
  }
}

function drawWiper(ctx, x, y, length, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHood(ctx, width, height, metrics, steering) {
  const y = height * 0.855;
  const hood = ctx.createLinearGradient(0, y, 0, height);
  hood.addColorStop(0, "rgba(24, 31, 31, 0.82)");
  hood.addColorStop(0.55, "rgba(7, 8, 8, 0.95)");
  hood.addColorStop(1, "#010101");
  ctx.fillStyle = hood;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, y + 34);
  ctx.quadraticCurveTo(width * 0.26, y + 4, width * 0.48, y + 8);
  ctx.quadraticCurveTo(width * (0.68 + steering * 0.018), y + 4, width, y + 32);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(159, 184, 180, ${0.06 + metrics.reflections * 0.05})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.16, y + 34);
  ctx.quadraticCurveTo(width * 0.44, y + 13, width * 0.84, y + 31);
  ctx.stroke();
}

function drawAirmassAndPillars(ctx, width, height, metrics, road) {
  const top = road.horizon * 0.9;
  const bottom = height;
  ctx.save();
  ctx.strokeStyle = `rgba(114, 155, 158, ${0.06 + metrics.reflections * 0.05})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.08, bottom);
  ctx.lineTo(width * 0.2, top);
  ctx.moveTo(width * 0.92, bottom);
  ctx.lineTo(width * 0.8, top);
  ctx.stroke();
  ctx.restore();
}

function drawDashboardDetails(ctx, width, height, metrics, driverX) {
  const y = height * 0.884;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
  roundRect(ctx, width * 0.15, y - 24, width * 0.34, 44, 8);
  ctx.fill();

  ctx.strokeStyle = `rgba(112, 150, 147, ${0.06 + metrics.glow * 0.04})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const x = width * (0.24 + i * 0.055);
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 10, y + 10);
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(130, 190, 184, ${0.08 + metrics.glow * 0.08})`;
  ctx.fillRect(width * 0.3, y - 4, width * 0.1, 2);
  ctx.fillRect(driverX - width * 0.055, y + 18, width * 0.11, 2);
  ctx.restore();
}

function drawInstrumentCluster(ctx, width, height, metrics, driverX) {
  const x = driverX;
  const y = height * 0.875;
  const panelWidth = Math.max(190, Math.min(270, width * 0.28));
  ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
  roundRect(ctx, x - panelWidth / 2, y - 50, panelWidth, 76, 10);
  ctx.fill();
  ctx.strokeStyle = `rgba(88, 174, 184, ${0.18 + metrics.glow * 0.12})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  drawGauge(ctx, x - panelWidth * 0.24, y, 38, metrics.rpm, "RPM", "x1000", "#7ee7ee", metrics);
  drawGauge(ctx, x + panelWidth * 0.24, y, 38, clamp(metrics.displaySpeed / 180, 0, 1), "KM/H", String(metrics.displaySpeed), "#f0d173", metrics);

  ctx.fillStyle = `rgba(135, 235, 230, ${0.12 + metrics.glow * 0.1})`;
  roundRect(ctx, x - 34, y - 17, 68, 28, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(232, 250, 255, 0.82)";
  ctx.font = "800 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(metrics.brakeHold > 0.92 ? "STOP" : metrics.manualBoost > 0.05 ? "BOOST" : metrics.manualBrake > 0.05 ? "BRAKE" : "DRIVE", x, y - 1);
  ctx.fillStyle = "rgba(139, 225, 225, 0.72)";
  ctx.fillRect(x - 22, y + 8, 44 * clamp(metrics.rpm, 0, 1), 2);
  ctx.textAlign = "start";
}

function drawGauge(ctx, x, y, radius, value, label, readout, color, metrics) {
  const start = Math.PI * 1.1;
  const end = Math.PI * 1.9;
  const angle = start + (end - start) * clamp(value, 0, 1);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(220, 235, 232, 0.12)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.stroke();
  ctx.strokeStyle = colorToRgba(color, 0.42 + metrics.glow * 0.18);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, angle);
  ctx.stroke();

  for (let tick = 0; tick <= 6; tick += 1) {
    const tickAngle = start + (end - start) * (tick / 6);
    const inner = radius - (tick % 3 === 0 ? 11 : 7);
    const outer = radius - 1;
    ctx.strokeStyle = `rgba(230, 246, 244, ${tick % 3 === 0 ? 0.42 : 0.22})`;
    ctx.lineWidth = tick % 3 === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(tickAngle) * inner, y + Math.sin(tickAngle) * inner);
    ctx.lineTo(x + Math.cos(tickAngle) * outer, y + Math.sin(tickAngle) * outer);
    ctx.stroke();
  }

  const needleLength = radius - 8;
  ctx.strokeStyle = colorToRgba(color, 0.95);
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * needleLength, y + Math.sin(angle) * needleLength);
  ctx.stroke();
  ctx.fillStyle = "#050809";
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(238, 249, 250, 0.78)";
  ctx.font = "800 9px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 18);
  ctx.fillStyle = colorToRgba(color, 0.9);
  ctx.font = "900 12px Inter, system-ui, sans-serif";
  ctx.fillText(readout, x, y + 32);
  ctx.restore();
}

function colorToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawSteeringWheel(ctx, width, height, steering, pulse, driverX) {
  const x = driverX;
  const y = height * 1.01;
  const radius = Math.min(width * 0.14, height * 0.22);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(steering);
  ctx.scale(1.04, 0.76);

  ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
  ctx.lineWidth = 38;
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI * 1.03, Math.PI * 1.97);
  ctx.stroke();

  ctx.strokeStyle = `rgba(30, 43, 46, ${0.92 + pulse * 0.04})`;
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI * 1.03, Math.PI * 1.97);
  ctx.stroke();

  ctx.strokeStyle = "rgba(5, 7, 8, 0.95)";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.05);
  ctx.lineTo(-radius * 0.66, -radius * 0.45);
  ctx.moveTo(0, -radius * 0.05);
  ctx.lineTo(radius * 0.66, -radius * 0.45);
  ctx.moveTo(0, -radius * 0.05);
  ctx.lineTo(0, -radius * 0.72);
  ctx.stroke();

  ctx.fillStyle = "#040506";
  ctx.beginPath();
  ctx.arc(0, -radius * 0.06, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDrivingHud(ctx, width, height, state, metrics) {
  const active = Math.abs(state.driverLane) > 0.04 || Math.abs(state.driverVelocity) > 0.004 || metrics.manualBoost > 0 || metrics.manualBrake > 0;
  const x = width - Math.min(260, width * 0.34);
  const y = Math.max(54, height * 0.08);
  const panelWidth = Math.min(222, width * 0.42);
  ctx.save();
  ctx.globalAlpha = active ? 0.72 : 0.32;
  ctx.fillStyle = "rgba(3, 7, 10, 0.42)";
  roundRect(ctx, x, y, panelWidth, 46, 8);
  ctx.fill();
  ctx.strokeStyle = active ? "rgba(122, 224, 238, 0.3)" : "rgba(210, 230, 235, 0.12)";
  ctx.stroke();
  ctx.fillStyle = active ? "rgba(230, 250, 255, 0.88)" : "rgba(220, 232, 236, 0.56)";
  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.fillText(metrics.brakeHold > 0.92 ? "STOPPED" : active ? "MANUAL DRIVE" : "AUTO CRUISE", x + 12, y + 18);
  ctx.font = "700 10px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(170, 205, 210, 0.72)";
  ctx.fillText("WASD / ARROWS", x + 12, y + 34);
  const laneX = x + panelWidth - 64;
  ctx.strokeStyle = "rgba(150, 180, 184, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(laneX, y + 31);
  ctx.lineTo(laneX + 44, y + 31);
  ctx.stroke();
  ctx.fillStyle = "rgba(122, 224, 238, 0.86)";
  ctx.beginPath();
  ctx.arc(laneX + 22 + state.driverLane * 19, y + 31, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawOverlays(ctx, width, height, metrics, mood, environment) {
  const haze = ctx.createLinearGradient(0, height * 0.28, 0, height);
  haze.addColorStop(0, "rgba(190, 205, 210, 0)");
  haze.addColorStop(0.48, `${environment.haze} ${0.035 + metrics.rain * 0.035})`);
  haze.addColorStop(1, "rgba(0, 0, 0, 0.16)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(210,220,215,${0.018 + metrics.grain * 0.22})`;
  for (let i = 0; i < 180; i += 1) {
    const x = (i * 91 + Math.floor(metrics.glow * 100)) % width;
    const y = (i * 47) % height;
    ctx.fillRect(x, y, 1, 1);
  }
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${environment.vignette})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
