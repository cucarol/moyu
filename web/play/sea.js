// The open sea under the raft, alive but calm: long low swells rolling out toward the
// horizon, and the raft riding them. One swell function serves the water's surface 
// its shader), the glints, the float and the foam at the logs, so they all rise together.
//
// The raft's rocking is done the other way round: the raft and everything on it (the
// table, the games, the agent) keep still in the scene, and the sea and sky (env) tilt
// and heave against it, which looks the same. The camera rides along at about half the
// raft's motion, a little late (stage.ride). So picking, screen positions and the agent's
// reaches never see the motion. With sway off (⚙, or reduced motion) the raft and the
// view keep still; the sea still swells.
import { THREE } from './stage.js';
import { motion } from './motion.js';

const TAU = Math.PI * 2;
// each swell: its direction (toward the horizon), wavelength (m), period (s), height (m)
const WAVES = [
  [0.25, -1, 11, 8.5, 0.036],
  [-0.45, -1, 7, 6.3, 0.022],
  [0.7, -0.7, 17, 10.9, 0.028],
].map(([dx, dz, len, period, amp], i) => {
  const n = Math.hypot(dx, dz);
  return { dx: dx / n, dz: dz / n, k: TAU / len, w: TAU / period, amp, phase: i * 1.7 };
});
export const SWELL_MAX = WAVES.reduce((s, w) => s + w.amp, 0);

// the water's height above its rest level at (x, z), in the sea's own frame
export function swellAt(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.phase);
  return h;
}

const GLSL_WAVES = WAVES.map((w) => `h += ${w.amp.toFixed(4)} * sin(${w.k.toFixed(5)} * (${w.dx.toFixed(4)} * wx + ${w.dz.toFixed(4)} * wz) - ${w.w.toFixed(5)} * uTime + ${w.phase.toFixed(3)});`).join('\n');

// The surface: a flat plane displaced in the shader (cheap: a vertex every 2 m), its crests
// lighter, so the swells read as slow bands rolling out, out to the middle distance. The
// water's own marks are two layers of the texture drifting apart at two scales, so they
// keep crossing, breaking up and gathering: never still, never fast.
export function seaMaterial(material, z) {
  const uTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader =
      `uniform float uTime;\nvarying float vCrest;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // the plane lies flat (turned -90° about x): its x is the sea's x, its -y the sea's z
        float wx = position.x;
        float wz = -position.y + ${z.toFixed(2)};
        float h = 0.0;
        ${GLSL_WAVES}
        transformed.z += h;
        float fade = 1.0 - smoothstep(18.0, 70.0, length(vec2(wx, wz)));
        vCrest = h / ${SWELL_MAX.toFixed(4)} * fade;`,
      );
    shader.fragmentShader =
      `uniform float uTime;\nvarying float vCrest;\n` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec4 rippleA = texture2D(map, vMapUv + vec2(uTime * 0.035, uTime * 0.01));
        vec4 rippleB = texture2D(map, vMapUv * 1.31 + vec2(-uTime * 0.022, uTime * 0.028));
        diffuseColor *= mix(rippleA, rippleB, 0.5);
        diffuseColor.rgb *= 1.0 + 0.7 * vCrest;
        // on a crest, the marks catch the light: pale flecks riding the swell as it rolls
        float cap = smoothstep(0.45, 0.85, vCrest) * step(0.2, max(rippleA.r, rippleB.r));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.72, 0.9), cap * 0.55);`,
      );
  };
  material.customProgramCacheKey = () => 'sea';
  return uTime;
}

// The raft's own motion: roll, pitch and heave, each two or three slow sines of unrelated
// periods summed, so it never repeats in a way you'd notice. About 0.7° at most.
function raftAt(t) {
  const s = (p, ph = 0) => Math.sin((TAU * t) / p + ph);
  return {
    roll: 0.012 * (0.6 * s(7.7) + 0.3 * s(11.3, 1.3) + 0.1 * s(5.1, 0.4)),
    pitch: 0.009 * (0.6 * s(9.1, 2) + 0.3 * s(6.3, 0.5) + 0.1 * s(13.7)),
    heave: 0.025 * (0.6 * s(8.3, 0.7) + 0.4 * s(6.1, 2.1)),
  };
}

// Rock the raft: env (the sea and sky) moves against it, the camera rides at half, late.
export function rockRaft(stage, env, pivot) {
  const { ride } = stage;
  const euler = new THREE.Euler();
  const LAG = 0.45;
  let amt = motion.sway ? 1 : 0;
  ride.pivot.copy(pivot);
  stage.onFrame((t) => {
    amt += ((motion.sway ? 1 : 0) - amt) * 0.03; // turning it off settles, never snaps
    const a = raftAt(t);
    const b = raftAt(t - LAG);
    env.quaternion.setFromEuler(euler.set(-a.pitch * amt, 0, -a.roll * amt));
    env.position.copy(pivot).sub(pivot.clone().applyQuaternion(env.quaternion)).add(new THREE.Vector3(0, -a.heave * amt, 0));
    ride.q.setFromEuler(euler.set((0.5 * b.pitch - a.pitch) * amt, 0, (0.5 * b.roll - a.roll) * amt));
    ride.p.set(0, (0.5 * b.heave - a.heave) * amt, 0);
  });
  stage.onDispose(() => {
    ride.q.identity();
    ride.p.set(0, 0, 0);
  });
}
