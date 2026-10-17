import { useMemo, type Dispatch } from "react";
import * as THREE from "three";
import type { Action, State } from "../state/reducer";

/** Warm table with a lathed ceramic bowl of rigatoni in tomato sauce (golden-angle spiral), selectable. */
export default function Meal({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const bowl = useMemo(() => new THREE.LatheGeometry([new THREE.Vector2(0.2, 0), new THREE.Vector2(0.55, 0.06), new THREE.Vector2(0.72, 0.2), new THREE.Vector2(0.74, 0.28), new THREE.Vector2(0.7, 0.28), new THREE.Vector2(0.52, 0.12), new THREE.Vector2(0.22, 0.04)], 48), []);
  const pasta = useMemo(() => Array.from({ length: 37 }, (_, i) => { const a = i * 2.399; const r = 0.48 * Math.sqrt((i + 0.5) / 37); return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: a, len: 0.14, rad: 0.041 + (i % 3) * 0.0015, color: i % 2 ? "#dc9a53" : "#c88143" }; }), []);
  const tomatoes = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: Math.cos(i * 0.7 + 0.3) * 0.33, z: Math.sin(i * 0.7 + 0.3) * 0.33 })), []);
  const selected = state.mealStep !== "none";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#9e9484" /></mesh>
      <mesh position={[0, 2.2, -2.2]}><boxGeometry args={[20, 4.4, 0.2]} /><meshStandardMaterial color="#c7c3ad" /></mesh>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow><boxGeometry args={[5.5, 0.14, 3.5]} /><meshStandardMaterial color="#997351" roughness={0.7} /></mesh>
      {Array.from({ length: 17 }, (_, i) => <mesh key={i} position={[-2.6 + i * 0.32, 0.822, 0]}><boxGeometry args={[0.02, 0.002, 3.4]} /><meshStandardMaterial color="#7a5a3e" /></mesh>)}
      <mesh position={[0.6, 0.83, 0.1]}><boxGeometry args={[1.2, 0.01, 3.2]} /><meshStandardMaterial color="#efe9dc" /></mesh>
      <group position={[-0.5, 0.82, 0.2]} onClick={(e) => { e.stopPropagation(); dispatch({ type: "meal/select" }); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <mesh geometry={bowl} castShadow><meshPhysicalMaterial color={selected ? "#e6edcf" : "#f2efe6"} clearcoat={0.6} roughness={0.3} /></mesh>
        <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.5, 32]} /><meshStandardMaterial color="#b8663c" roughness={0.6} /></mesh>
        {pasta.map((p, i) => <mesh key={i} position={[p.x, 0.17, p.z]} rotation={[Math.PI / 2 + 0.3, p.rot, 0]}><cylinderGeometry args={[p.rad, p.rad, p.len, 10, 1, true]} /><meshStandardMaterial color={p.color} side={THREE.DoubleSide} roughness={0.5} /></mesh>)}
        {tomatoes.map((t, i) => <mesh key={i} position={[t.x, 0.18, t.z]}><sphereGeometry args={[0.05, 10, 10]} /><meshStandardMaterial color="#b7482a" /></mesh>)}
        {[0.1, -0.15, 0.25].map((x, i) => <mesh key={i} position={[x, 0.22, -0.1 + i * 0.12]} rotation={[-1.2, i, 0]}><planeGeometry args={[0.09, 0.05]} /><meshStandardMaterial color="#547340" side={THREE.DoubleSide} /></mesh>)}
      </group>
      <mesh position={[1.4, 0.96, -0.8]}><cylinderGeometry args={[0.12, 0.1, 0.28, 16]} /><meshPhysicalMaterial color="#dfe9ee" transparent opacity={0.4} roughness={0.05} /></mesh>
      <mesh position={[-1.6, 0.84, 0.3]}><boxGeometry args={[0.3, 0.02, 0.3]} /><meshStandardMaterial color="#f3f0e8" /></mesh>
      <mesh position={[-1.9, 0.84, 0.3]}><boxGeometry args={[0.02, 0.01, 0.34]} /><meshStandardMaterial color="#c9ccd1" metalness={0.8} /></mesh>
      <mesh position={[2.3, 0.95, 0.9]}><cylinderGeometry args={[0.12, 0.1, 0.22, 12]} /><meshStandardMaterial color="#b5623a" /></mesh>
      <mesh position={[2.3, 1.15, 0.9]}><sphereGeometry args={[0.16, 10, 10]} /><meshStandardMaterial color="#547340" /></mesh>
      {[-1.2, 1.2].map((x) => <mesh key={x} position={[x, 0.5, -1.6]}><boxGeometry args={[0.5, 1, 0.5]} /><meshStandardMaterial color="#3f4a35" /></mesh>)}
    </group>
  );
}
