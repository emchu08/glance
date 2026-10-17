import { useMemo, type Dispatch } from "react";
import * as THREE from "three";
import type { Action, State } from "../state/reducer";

/** Street storefront with a stylized faceless adult in a moss field jacket. Hover/select highlights the garment. */
export default function Jacket({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const torso = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-0.34, 0); s.lineTo(0.34, 0); s.lineTo(0.34, 0.84); s.quadraticCurveTo(0, 0.95, -0.34, 0.84); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 3 }); }, []);
  const sleeve = (side: 1 | -1) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.31 * side, 1.56, 0.13), new THREE.Vector3(0.48 * side, 1.2, 0.14), new THREE.Vector3(0.56 * side, 0.81, 0.15)]), 16, 0.12, 10, false);
  const selected = state.jacketSelected;
  const jacket = selected ? "#7b8358" : "#707652";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#bfb5a4" /></mesh>
      <mesh position={[0, 2.2, -3]}><boxGeometry args={[18, 4.4, 0.3]} /><meshStandardMaterial color="#d4ccbd" /></mesh>
      {[-3.4, -1.2, 1.2, 3.4].map((x) => <mesh key={x} position={[x, 2.1, -2.84]}><planeGeometry args={[1.6, 2.8]} /><meshPhysicalMaterial color="#8da2b5" metalness={0.3} roughness={0.1} clearcoat={1} /></mesh>)}
      {[-9, -5, 6, 10].map((x, i) => <mesh key={x} position={[x, 3 + i * 0.6, -12]}><boxGeometry args={[3, 6 + i, 3]} /><meshStandardMaterial color="#9ea7ad" /></mesh>)}
      <mesh position={[2.4, 0.3, -1.2]}><boxGeometry args={[1.6, 0.1, 0.5]} /><meshStandardMaterial color="#8a6a46" /></mesh>
      {[-0.6, 0.6].map((x) => <mesh key={x} position={[2.4 + x, 0.12, -1.2]}><boxGeometry args={[0.1, 0.25, 0.4]} /><meshStandardMaterial color="#5a4630" /></mesh>)}
      <mesh position={[-2.4, 0.25, -1]}><cylinderGeometry args={[0.28, 0.22, 0.5, 16]} /><meshStandardMaterial color="#b5623a" /></mesh>
      <mesh position={[-2.4, 0.75, -1]}><sphereGeometry args={[0.4, 12, 12]} /><meshStandardMaterial color="#4f7a3a" roughness={0.9} /></mesh>
      {/* person */}
      <group position={[-0.45, 0, 0.1]}>
        <mesh position={[0, 1.9, 0.1]}><sphereGeometry args={[0.16, 16, 16]} /><meshStandardMaterial color="#a6775a" /></mesh>
        <mesh position={[0, 2.0, 0.07]}><sphereGeometry args={[0.165, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#3a2a22" /></mesh>
        <mesh geometry={torso} position={[0, 0.86, 0]} castShadow onClick={(e) => { e.stopPropagation(); dispatch({ type: "jacket/select" }); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
          <meshStandardMaterial color={jacket} roughness={0.94} />
        </mesh>
        {([1, -1] as const).map((s) => <mesh key={s} geometry={sleeve(s)} castShadow><meshStandardMaterial color={jacket} roughness={0.94} /></mesh>)}
        {[-0.12, 0.12].map((x) => <mesh key={x} position={[x, 1.62, 0.3]} rotation={[0.4, 0, x < 0 ? 0.4 : -0.4]}><boxGeometry args={[0.12, 0.1, 0.02]} /><meshStandardMaterial color={jacket} roughness={0.95} /></mesh>)}
        <mesh position={[0, 1.28, 0.31]}><boxGeometry args={[0.02, 0.76, 0.01]} /><meshStandardMaterial color="#3a3d2c" /></mesh>
        {[-0.17, 0.17].map((x) => <group key={x}><mesh position={[x, 1.42, 0.31]}><boxGeometry args={[0.16, 0.14, 0.015]} /><meshStandardMaterial color={jacket} roughness={0.95} /></mesh><mesh position={[x, 1.5, 0.32]}><boxGeometry args={[0.17, 0.04, 0.01]} /><meshStandardMaterial color="#5f6447" /></mesh><mesh position={[x, 1.5, 0.33]}><sphereGeometry args={[0.012, 8, 8]} /><meshStandardMaterial color="#2a2a2a" /></mesh></group>)}
        {[-0.2, 0.2].map((x) => <mesh key={x} position={[x, 1.0, 0.31]} rotation={[0, 0, x < 0 ? -0.5 : 0.5]}><boxGeometry args={[0.16, 0.03, 0.01]} /><meshStandardMaterial color="#5f6447" /></mesh>)}
        {[-0.56, 0.56].map((x) => <mesh key={x} position={[x, 0.78, 0.15]}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color="#a6775a" /></mesh>)}
        {[-0.14, 0.14].map((x) => <mesh key={x} position={[x, 0.45, 0]}><boxGeometry args={[0.2, 0.86, 0.22]} /><meshStandardMaterial color="#2f3a55" /></mesh>)}
        {[-0.14, 0.14].map((x) => <mesh key={x} position={[x, 0.05, 0.06]}><boxGeometry args={[0.22, 0.1, 0.34]} /><meshStandardMaterial color="#e9e4d6" /></mesh>)}
      </group>
    </group>
  );
}
