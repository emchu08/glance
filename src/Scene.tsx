import { Component, memo, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import Glasses, { clearGlassesCache } from './scenes/Glasses';
import { RIGHT_LENS_WORLD } from './scenes/glassesAsset';
import type { LoadedPhoto } from './experience/photos';

export type SceneProps = { entry: number; photo: LoadedPhoto | null; reduced: boolean; rotation: { x: number; y: number }; onProgress: (progress: number) => void; onError: () => void };

class Boundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function RenderControl({ active }: { active: boolean }) {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { if (!active) return; let id: number; const loop = () => { invalidate(); id = requestAnimationFrame(loop); }; loop(); return () => cancelAnimationFrame(id); }, [active, invalidate]);
  return null;
}
function Director({ entry, reduced }: Pick<SceneProps, 'entry' | 'reduced'>) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const aim = useMemo(() => new THREE.Vector3(), []);
  const lens = useMemo(() => new THREE.Vector3(RIGHT_LENS_WORLD[0], RIGHT_LENS_WORLD[1], RIGHT_LENS_WORLD[2] + .5), []);
  useFrame(({ pointer }) => {
    const align = THREE.MathUtils.smoothstep(entry, 0, .43);
    const zoom = THREE.MathUtils.smoothstep(entry, .36, .9);
    const mobile = size.width < 700;
    target.set(THREE.MathUtils.lerp(mobile ? 2.8 : 3, RIGHT_LENS_WORLD[0], align), THREE.MathUtils.lerp(3.5, RIGHT_LENS_WORLD[1], align), THREE.MathUtils.lerp(mobile ? 27.4 : 14.6, 11.8, align));
    target.lerp(lens, zoom);
    aim.set(THREE.MathUtils.lerp(mobile ? .8 : 0, RIGHT_LENS_WORLD[0], align), THREE.MathUtils.lerp(mobile ? 2.05 : 2.4, RIGHT_LENS_WORLD[1], align), THREE.MathUtils.lerp(5, 0, align));
    if (!reduced) { target.x += pointer.x * .18 * (1 - align); target.y += pointer.y * .1 * (1 - align); }
    camera.position.copy(target); camera.lookAt(aim);
  });
  return null;
}
// Broad translucent light fields live in the same world as the product.
function Atmosphere({ entry, reduced }: { entry: number; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const glow = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,.7)'); gradient.addColorStop(.45, 'rgba(147,184,244,.3)'); gradient.addColorStop(1, 'rgba(180,210,250,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = reduced ? 0 : clock.elapsedTime;
    group.current.position.x = Math.sin(t * .13) * .65;
    group.current.position.y = Math.cos(t * .1) * .25;
  });
  return entry < .88 ? <group ref={group}>
    <sprite position={[2, 3, -1]} scale={[20, 12, 1]}><spriteMaterial map={glow} transparent opacity={.25} depthWrite={false} /></sprite>
    <sprite position={[-6, 0, -2]} scale={[13, 9, 1]}><spriteMaterial map={glow} transparent opacity={.15} depthWrite={false} /></sprite>
    <pointLight position={[3, 4, 7]} color="#b5e8f2" intensity={12} distance={16} decay={2} />
  </group> : null;
}
function Scene(props: SceneProps) {
  const { entry, photo, reduced, rotation, onProgress, onError } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [supported] = useState(() => { try { const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2'); if (!gl) return false; gl.getExtension('WEBGL_lose_context')?.loseContext(); return true; } catch { return false; } });
  useEffect(() => {
    const element = ref.current; if (!element) return;
    let visible = true;
    const update = () => setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }); observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); document.body.style.cursor = ''; };
  }, []);
  useEffect(() => { if (!supported) onError(); }, [supported, onError]);
  return <div className="world-canvas" ref={ref}>
    {supported && <Boundary onError={() => { clearGlassesCache(); onError(); }}><Canvas shadows dpr={[1, 1.5]} frameloop="demand" camera={{ position: [3.6, 3.5, 12.6], fov: 34, near: .025, far: 70 }} gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { onProgress(65); gl.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); onError(); }, { once: true }); }}>
      <RenderControl active={active && entry < .999 && !reduced} />
      <Director entry={entry} reduced={reduced} />
      <Atmosphere entry={entry} reduced={reduced} />
      <ambientLight intensity={THREE.MathUtils.lerp(.45, 1.1, THREE.MathUtils.smoothstep(entry, .87, .99))} color="#f4f3e6" />
      <directionalLight position={[-4, 8, 5]} intensity={THREE.MathUtils.lerp(2.2, 3, THREE.MathUtils.smoothstep(entry, .87, .99))} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-normalBias={.035} shadow-radius={5} />
      <directionalLight position={[5, 3, -4]} color="#d3e3ee" intensity={1.5} />
      <Suspense fallback={null}><Environment resolution={128} frames={1}><Lightformer position={[0, 5, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 3, 1]} intensity={2} /><Lightformer position={[-6, 2, 4]} rotation={[0, Math.PI / 2, 0]} scale={[5, 2, 1]} intensity={3} /><Lightformer position={[5, 3, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[3, 4, 1]} intensity={2} /></Environment></Suspense>
      <Suspense fallback={null}><Glasses photo={photo} entry={entry} rotation={rotation} reduced={reduced} onReady={onProgress} /></Suspense>
      {entry < .72 && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .05, 0]} receiveShadow><planeGeometry args={[100, 100]} /><shadowMaterial transparent opacity={.13} /></mesh>}

    </Canvas></Boundary>}
  </div>;
}

export default memo(Scene);
