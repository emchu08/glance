"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL = "/models/rayban-display.glb";

/**
 * The source GLB is a Blender export with fifteen unparented roots, baked vertex
 * offsets, and negative scales, so nothing is hand-placed: the group is recentred
 * and scaled from its own measured bounds.
 */
const FIT = 2.75;
const BASE_ROTATION: [number, number, number] = [0.18, -0.62, 0];

function Glasses({ reduced }: { reduced: boolean }) {
  const { scene } = useGLTF(MODEL);
  const outer = useRef<THREE.Group>(null);
  const { pointer } = useThree();

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
        if (material.name.startsWith("High-Gloss") || material.name.startsWith("Material")) {
          material.roughness = Math.min(material.roughness, 0.18);
          material.metalness = 0.12;
        }
        // Both lens materials ship as 0.8 grey, which renders as opaque plaster.
        // Real display lenses are smoked, so they are darkened and made glassy here.
        if (material.name.startsWith("glass")) {
          material.color.set("#121a18");
          material.roughness = 0.05;
          material.metalness = 0;
          if (material instanceof THREE.MeshPhysicalMaterial) {
            material.transmission = 0.38;
            material.thickness = 0.4;
            material.ior = 1.5;
            material.clearcoat = 1;
            material.clearcoatRoughness = 0.04;
          }
          material.envMapIntensity = 2.6;
          continue;
        }
        if (material.name.startsWith("camera lens")) {
          material.color.set("#0a0c0b");
          material.roughness = 0.1;
          material.metalness = 0.55;
          material.envMapIntensity = 2;
          continue;
        }
        material.envMapIntensity = 1.6;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      object: root,
      offset: [-center.x, -center.y, -center.z] as [number, number, number],
      scale: FIT / Math.max(size.x, size.y, size.z),
    };
  }, [scene]);

  useFrame((state, delta) => {
    const group = outer.current;
    if (!group) return;
    if (reduced) {
      group.rotation.set(BASE_ROTATION[0], BASE_ROTATION[1], BASE_ROTATION[2]);
      return;
    }
    // Held near a three-quarter view: a full turn would swing the temples side-on
    // and force the frame to be scaled down to fit its own widest angle.
    const yaw = BASE_ROTATION[1] + Math.sin(state.clock.elapsedTime * 0.26) * 0.3 + pointer.x * 0.2;
    const pitch = BASE_ROTATION[0] + -pointer.y * 0.12;
    const k = 1 - Math.exp(-5 * delta);
    group.rotation.y += (yaw - group.rotation.y) * k;
    group.rotation.x += (pitch - group.rotation.x) * k;
  });

  return (
    <group ref={outer} rotation={BASE_ROTATION} scale={scale}>
      <primitive object={object} position={offset} />
    </group>
  );
}

export default function GlassesScene({ reduced }: { reduced: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0.25, 7.2], fov: 32 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
      frameloop={reduced ? "demand" : "always"}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <Glasses reduced={reduced} />
        {/* Procedural studio: no HDRI is fetched, so the hero works offline. */}
        {/* Glossy black acetate only reads as glossy if there are bright shapes to
            reflect, so the key lights are large and hot rather than merely present. */}
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={5} color="#fff6e6" position={[0, 3.4, 2.6]} scale={[9, 3, 1]} />
          <Lightformer intensity={5.5} color="#7fe3d0" position={[-4.4, 0.8, 1.6]} scale={[2.8, 6, 1]} />
          <Lightformer intensity={3} color="#c9872f" position={[4.6, -0.6, 0.8]} scale={[2.4, 5, 1]} />
          <Lightformer intensity={3.4} color="#ffffff" position={[1.5, 1.2, -4]} scale={[6, 4, 1]} />
          <Lightformer intensity={1.2} color="#ffffff" position={[0, -3.2, -2]} scale={[8, 3, 1]} />
        </Environment>
        <ContactShadows position={[0, -1.35, 0]} opacity={0.5} scale={9} blur={3.2} far={3} color="#000000" />
      </Suspense>
      <ambientLight intensity={0.22} />
      <directionalLight position={[3, 4, 4]} intensity={1.1} color="#fff4e2" />
    </Canvas>
  );
}

useGLTF.preload(MODEL);
