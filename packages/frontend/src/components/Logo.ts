/**
 * 3D Midnight logo — renders into a small canvas using Three.js (loaded from CDN).
 * The canvas is sized to fit inline in the navbar brand area.
 */

declare const THREE: any;

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const CANVAS_W = 48;
const CANVAS_H = 48;

let threeReady: Promise<void> | null = null;

function loadThree(): Promise<void> {
  if (threeReady) return threeReady;
  threeReady = new Promise((resolve) => {
    if ((window as any).THREE) { resolve(); return; }
    const s = document.createElement("script");
    s.src = CDN;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
  return threeReady;
}

export function renderLogoCanvas(): string {
  return `<canvas id="midnight-logo" width="${CANVAS_W}" height="${CANVAS_H}"
    style="display:block;width:${CANVAS_W}px;height:${CANVAS_H}px;flex-shrink:0"></canvas>`;
}

export async function initLogo(): Promise<void> {
  const canvas = document.getElementById("midnight-logo") as HTMLCanvasElement | null;
  if (!canvas) return;

  await loadThree();

  const scene = new THREE.Scene();
  scene.background = null; // transparent

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(CANVAS_W, CANVAS_H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const fl = new THREE.DirectionalLight(0xffffff, 2.5);
  fl.position.set(0, 0, 20);
  scene.add(fl);
  const fl2 = new THREE.DirectionalLight(0xffffff, 2.5);
  fl2.position.set(0, 0, -20);
  scene.add(fl2);
  const tfl = new THREE.PointLight(0xffffff, 1.0);
  tfl.position.set(0, 10, 10);
  scene.add(tfl);
  const rim = new THREE.PointLight(0xffffff, 1.2);
  rim.position.set(-10, -5, -10);
  scene.add(rim);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.9,
    roughness: 0.15,
  });

  const logoGroup = new THREE.Group();

  // Ring
  const outerR = 3.6, innerR = 3.1;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  ringShape.holes.push(hole);
  const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.8,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 8,
    curveSegments: 128,
  });
  const ring = new THREE.Mesh(ringGeo, mat);
  ring.position.z = -0.4;
  logoGroup.add(ring);

  // Three stacked cubes
  const cubeSize = (outerR - innerR) * 1.5;
  const g = (innerR - 2.5 * cubeSize) / 3;
  const yPositions = [0, cubeSize + g, 2 * (cubeSize + g)];
  const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
  for (const y of yPositions) {
    const cube = new THREE.Mesh(cubeGeo, mat);
    cube.position.y = y;
    logoGroup.add(cube);
  }

  logoGroup.rotation.x = Math.PI * 0.05;
  logoGroup.rotation.y = -Math.PI * 0.1;
  scene.add(logoGroup);

  // Animate
  function animate() {
    requestAnimationFrame(animate);
    logoGroup.rotation.y += 0.008;
    renderer.render(scene, camera);
  }
  animate();
}
