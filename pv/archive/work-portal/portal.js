// A portal: a pane of glass in the room (a CRT's, a laptop's) with another world behind it,
// drawn from where the camera stands, so the camera can fly out of that world through the
// glass into the room (or back in) in one move. The world is built at its own scale: scale
// metres there to one here. It is seen through a window at anchor (a pose in the world,
// facing the viewer along its +z, the world beyond it along -z), the glass's size times
// scale.
//
// Outside, the glass shows the world: each frame the world is drawn from the camera's place
// carried through the glass, into a picture the glass shows at its own place in the frame.
// Inside (enter()), the frame shows the world itself, from a camera of the caller's: the
// two agree as the camera crosses, so the cut is never seen.
import { THREE } from './stage.js';

// scan: how dark a tube's scanlines are (0 for a laptop's flat glass)
export function createPortal(stage, glass, world, { anchor, scale = 10, scan = 0.18 }) {
  const { renderer, camera, frame } = stage;
  const target = new THREE.WebGLRenderTarget(16, 9, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  target.texture.generateMipmaps = false;
  // the camera in the world: the room's carried through the glass (outside), or the caller's
  const eye = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.05, 400);
  glass.material = new THREE.ShaderMaterial({
    uniforms: { tWorld: { value: target.texture }, uRes: { value: new THREE.Vector2(16, 9) }, uScan: { value: scan } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // a little brighter than the world, as glass that glows, with a tube's scanlines
    fragmentShader: `uniform sampler2D tWorld; uniform vec2 uRes; uniform float uScan;
      void main() {
        vec3 c = texture2D(tWorld, gl_FragCoord.xy / uRes).rgb * 1.2;
        c *= 1.0 - uScan * step(1.0, mod(gl_FragCoord.y, 2.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  glass.userData.custom = true; // the room stops drawing its own picture on it

  const S = new THREE.Matrix4().makeScale(scale, scale, scale);
  const M = new THREE.Matrix4();
  const junk = new THREE.Vector3();
  // room pose -> world pose, and back; a pose is anything with position and quaternion
  function toWorld(pose, out = eye) {
    glass.updateMatrixWorld(true);
    anchor.updateMatrixWorld(true);
    M.compose(pose.position, pose.quaternion, junk.set(1, 1, 1));
    M.premultiply(new THREE.Matrix4().copy(glass.matrixWorld).invert()).premultiply(S).premultiply(anchor.matrixWorld);
    M.decompose(out.position, out.quaternion, junk);
    return out;
  }
  function toRoom(pose, out = new THREE.Object3D()) {
    glass.updateMatrixWorld(true);
    anchor.updateMatrixWorld(true);
    M.compose(pose.position, pose.quaternion, junk.set(1, 1, 1));
    M.premultiply(new THREE.Matrix4().copy(anchor.matrixWorld).invert()).premultiply(new THREE.Matrix4().makeScale(1 / scale, 1 / scale, 1 / scale)).premultiply(glass.matrixWorld);
    M.decompose(out.position, out.quaternion, junk);
    return out;
  }

  let inside = null; // the caller's camera in the world while the frame is in it
  const sync = () => {
    eye.fov = camera.fov;
    eye.aspect = camera.aspect;
    eye.updateProjectionMatrix();
  };
  stage.setView(() => (inside ? { scene: world, camera: inside } : null));
  const stop = stage.onFrame(() => {
    if (inside) return;
    sync();
    if (target.width !== frame.width || target.height !== frame.height) target.setSize(frame.width, frame.height);
    glass.material.uniforms.uRes.value.set(frame.width, frame.height);
    camera.updateMatrixWorld(true);
    toWorld(camera);
    eye.updateMatrixWorld(true);
    renderer.setRenderTarget(target);
    renderer.render(world, eye);
    renderer.setRenderTarget(null);
  });

  return {
    eye,
    toWorld,
    toRoom,
    // cam: a PerspectiveCamera in the world (its fov and aspect are kept the room camera's)
    enter(cam) {
      inside = cam;
      cam.fov = camera.fov;
      cam.aspect = camera.aspect;
      cam.updateProjectionMatrix();
    },
    leave: () => (inside = null),
    get inside() {
      return !!inside;
    },
    dispose() {
      stop();
      stage.setView(null);
      target.dispose();
    },
  };
}
