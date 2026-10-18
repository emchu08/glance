"use client";

import { Suspense, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { TIMELINE, span } from "./heroTimeline";

const MODEL = "/models/rayban-display.glb";

/**
 * The source GLB is a Blender export with fifteen unparented roots, baked vertex
 * offsets, and negative scales, so nothing is hand-placed: the group is recentred
 * and scaled from its own measured bounds.
 */
const FIT = 3.4;
const BASE_ROTATION: [number, number, number] = [0.22, -0.55, -0.12];

/**
 * Where the frame rests beside the headline, and its size once centred and front-on, per layout.
 * The end size matches the drawn frame that takes over, which is sized to the viewport width;
 * the camera's field of view is vertical, so a narrow screen needs a much smaller model.
 */
const REST = {
  wide: { x: 0.85, y: -0.3, scale: 0.98, end: 1 },
  narrow: { x: 0.12, y: -0.12, scale: 0.5, end: 0.54 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Glasses({ progress, reduced, layout }: { progress: RefObject<number>; reduced: boolean; layout: keyof typeof REST }) {
  const { scene } = useGLTF(MODEL);
  const outer = useRef<THREE.Group>(null);

  const { object, offset, scale } = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        // The export ships flat 0.5 roughness on the acetate; real frames are wetter.
        // On a white page pure black reads as a cut-out, so the acetate is lifted a touch.
        if (material.name.startsWith("High-Gloss") || material.name.startsWith("Material")) {
          material.roughness = Math.min(material.roughness, 0.14);
          material.metalness = 0.1;
          material.color.lerp(new THREE.Color("#1c2027"), 0.12);
        }
        // Both lens materials ship as 0.8 grey, which renders as opaque plaster.
        // Real display lenses are smoked, so they are darkened and made glassy here.
        // Clear display glass with a faint sky tint, so the lens reads as something to look through.
        if (material.name.startsWith("glass")) {
          material.color.set("#a8cfe2");
          material.roughness = 0.04;
          material.metalness = 0;
          material.transparent = true;
          material.opacity = 0.62;
          if (material instanceof THREE.MeshPhysicalMaterial) {
            material.transmission = 0.55;
            material.thickness = 0.3;
            material.ior = 1.45;
            material.clearcoat = 1;
            material.clearcoatRoughness = 0.03;
          }
          material.envMapIntensity = 2.2;
          continue;
        }
        if (material.name.startsWith("camera lens")) {
          material.color.set("#0a0c0b");
          material.roughness = 0.1;
          material.metalness = 0.55;
          material.envMapIntensity = 2;
          continue;
        }
        material.envMapIntensity = 1.35;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Fitted to the front width: the transition ends with the frame front-on.
    const reach = Math.max(size.x, size.y);
    return {
      object: root,
      offset: [-center.x, -center.y, -center.z] as [number, number, number],
      scale: FIT / reach,
    };
  }, [scene]);

  useFrame((_, delta) => {
    const group = outer.current;
    if (!group) return;
    const rest = REST[layout];
    const t = ease(span(progress.current ?? 0, 0, TIMELINE.turnEnd));
    // One full revolution while it travels from beside the headline to centre stage, ending front-on.
    const target = {
      rx: lerp(BASE_ROTATION[0], 0.02, t),
      ry: lerp(BASE_ROTATION[1], Math.PI * 2, t),
      rz: lerp(BASE_ROTATION[2], 0, t),
      x: lerp(rest.x, 0, t),
      y: lerp(rest.y, 0.05, t),
      s: lerp(rest.scale, rest.end, t) * scale,
    };
    const k = reduced ? 1 : 1 - Math.exp(-9 * delta);
    group.rotation.x += (target.rx - group.rotation.x) * k;
    group.rotation.y += (target.ry - group.rotation.y) * k;
    group.rotation.z += (target.rz - group.rotation.z) * k;
    group.position.x += (target.x - group.position.x) * k;
    group.position.y += (target.y - group.position.y) * k;
    group.scale.setScalar(group.scale.x + (target.s - group.scale.x) * k);
  });

  return (
    <group ref={outer} rotation={BASE_ROTATION} position={[REST[layout].x, REST[layout].y, 0]} scale={scale * REST[layout].scale}>
      <primitive object={object} position={offset} />
    </group>
  );
}

export default function GlassesScene({ progress, reduced, active, layout }: { progress: RefObject<number>; reduced: boolean; active: boolean; layout: keyof typeof REST }) {
  return (
    <Canvas
      camera={{ position: [0, 0.3, 7.2], fov: 32 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
      // Renders only while the stage is on screen; scrolling drives every frame it shows.
      frameloop={active ? "always" : "never"}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <Glasses progress={progress} reduced={reduced} layout={layout} />
        {/* Procedural daylight studio: no HDRI is fetched, so the page works offline.
            Glossy black acetate only reads as glossy with bright shapes to reflect. */}
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={5} color="#ffffff" position={[0, 3.4, 2.6]} scale={[9, 3, 1]} />
          {/* A wide softbox in front and a ring around the set give highlights at every angle of the turn. */}
          <Lightformer intensity={2.2} color="#ffffff" position={[0, 0.4, 5]} scale={[10, 2.2, 1]} />
          <Lightformer form="ring" intensity={2.4} color="#ffffff" position={[0, 0, -5]} scale={6} />
          <Lightformer intensity={3} color="#ffffff" position={[5, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer intensity={3} color="#eaf2ff" position={[-5, 1.5, -1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer intensity={4.5} color="#8dbdef" position={[-4.4, 0.8, 1.6]} scale={[2.8, 6, 1]} />
          <Lightformer intensity={3} color="#ffb98a" position={[4.6, -0.6, 0.8]} scale={[2.4, 5, 1]} />
          <Lightformer intensity={3.4} color="#ffffff" position={[1.5, 1.2, -4]} scale={[6, 4, 1]} />
          <Lightformer intensity={1.4} color="#c9b6ff" position={[0, -3.2, -2]} scale={[8, 3, 1]} />
        </Environment>
        <ContactShadows position={[0, -1.45, 0]} opacity={0.38} scale={12} blur={2.6} far={4} color="#24516d" />
      </Suspense>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 4]} intensity={1.1} color="#ffffff" />
    </Canvas>
  );
}

useGLTF.preload(MODEL);
