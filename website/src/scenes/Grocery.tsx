import { Html, Instances, Instance } from "@react-three/drei";
import { useEffect, useMemo, useRef, type Dispatch } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PRODUCTS, type Product } from "../state/data";
import type { Action, State } from "../state/reducer";

/** Stylized supermarket aisle: instanced stock, labeled packaging, floor route arrows, projected focus brackets. */
export function Grocery({ state, dispatch, reduced }: { state: State; dispatch: Dispatch<Action>; reduced: boolean }) {
  const slots = useMemo(() => PRODUCTS.map((p, i) => ({ p, pos: new THREE.Vector3(i % 2 === 0 ? -1.75 : 1.75, 1.0 + (i % 3) * 0.45, 1.5 - Math.floor(i / 2) * 1.6 - (i % 3) * 0.2) })), []);
  useEffect(() => {
    if (!state.recognizing) return;
    const t = setTimeout(() => dispatch({ type: "grocery/recognized" }), reduced ? 0 : 750);
    return () => clearTimeout(t);
  }, [state.recognizing, state.selected, dispatch, reduced]);
  const filler = useMemo(() => Array.from({ length: 160 }, (_, i) => ({ x: (i % 2 === 0 ? -1.85 : 1.85) + ((i >> 1) % 3) * (i % 2 === 0 ? -0.08 : 0.08), y: 0.55 + ((i >> 2) % 5) * 0.45, z: 2.6 - ((i >> 3) * 0.5) % 11, c: ["#e2534a", "#3f8fd6", "#f0b63d", "#58b36b", "#7a4fb0", "#f08a3c"][i % 6] })), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -3]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#d8d6cf" /></mesh>
      {[-2.2, 2.2].map((x) => <mesh key={x} position={[x, 1.4, -3]}><boxGeometry args={[0.6, 2.8, 14]} /><meshStandardMaterial color="#bdb8ad" /></mesh>)}
      {[0.55, 1.0, 1.45, 1.9, 2.35].map((y) => [-1.85, 1.85].map((x) => <mesh key={`${x}${y}`} position={[x, y - 0.02, -3]}><boxGeometry args={[0.7, 0.04, 14]} /><meshStandardMaterial color="#a39d90" /></mesh>))}
      {[2, 4, 6, 8].map((a, i) => <Html key={a} position={[0, 2.9, 1.8 - i * 2.4]} center transform distanceFactor={6}><div style={{ background: "#2b3a3a", color: "#fff", padding: "4px 12px", borderRadius: 4, fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Aisle {a}</div></Html>)}
      <Instances limit={200}>
        <boxGeometry args={[0.16, 0.26, 0.16]} />
        <meshStandardMaterial roughness={0.6} />
        {filler.map((f, i) => <Instance key={i} position={[f.x, f.y, f.z]} color={f.c} />)}
      </Instances>
      {slots.map(({ p, pos }) => <Package key={p.id} product={p} base={pos} selected={state.selected === p.id} onSelect={() => dispatch({ type: "grocery/select", productId: p.id })} reduced={reduced} />)}
      {state.route && state.route.progress < 1 && <Arrows z={state.route.z} />}
    </group>
  );
}

function Package({ product, base, selected, onSelect, reduced }: { product: Product; base: THREE.Vector3; selected: boolean; onSelect: () => void; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => (selected ? new THREE.Vector3(base.x * 0.35, 1.45, base.z + 1.2) : base), [selected, base]);
  useFrame((_, dt) => { const g = ref.current; if (!g) return; const k = reduced ? 1 : 1 - Math.exp(-8 * dt); g.position.lerp(target, k); const s = selected ? 1.5 : 1; g.scale.lerp(new THREE.Vector3(s, s, s), k); });
  const dims: Record<Product["packaging"], [number, number, number]> = { bottle: [0.14, 0.34, 0.14], carton: [0.16, 0.3, 0.1], box: [0.22, 0.3, 0.08], bag: [0.2, 0.3, 0.1], punnet: [0.22, 0.12, 0.16], bunch: [0.16, 0.26, 0.12] };
  const [w, h, d] = dims[product.packaging];
  return (
    <group ref={ref} position={base}>
      <mesh castShadow onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        {product.packaging === "bottle" ? <cylinderGeometry args={[w / 2, w / 2, h, 16]} /> : <boxGeometry args={[w, h, d]} />}
        <meshStandardMaterial color={product.color} roughness={0.55} />
      </mesh>
      {product.packaging === "bottle" && <mesh position={[0, h / 2 + 0.03, 0]}><cylinderGeometry args={[0.035, 0.04, 0.06, 12]} /><meshStandardMaterial color={product.ink} /></mesh>}
      <Html position={[0, 0, d / 2 + 0.002]} transform distanceFactor={2.2} center style={{ pointerEvents: "none" }}>
        <div style={{ width: 70, textAlign: "center", color: product.ink, fontFamily: "Manrope, sans-serif" }}>
          <div style={{ fontSize: 7, letterSpacing: 1.5, fontWeight: 800 }}>{product.brand}</div>
          <div style={{ fontSize: 8, fontWeight: 600, lineHeight: 1.1 }}>{product.name}</div>
          <div style={{ fontSize: 6, opacity: 0.8 }}>{product.size}</div>
        </div>
      </Html>
      <Html position={[0, -h / 2 - 0.08, 0.1]} center distanceFactor={4} style={{ pointerEvents: "none" }}>
        <div style={{ background: "#fff", color: "#242d2d", fontSize: 10, padding: "1px 5px", borderRadius: 2, fontFamily: "DM Sans, sans-serif", whiteSpace: "nowrap", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>${product.thisStore.toFixed(2)}</div>
      </Html>
    </group>
  );
}

function Arrows({ z }: { z: number }) {
  const shape = useMemo(() => { const s = new THREE.Shape(); s.moveTo(0, 0.35); s.lineTo(0.3, -0.05); s.lineTo(0.12, -0.05); s.lineTo(0.12, -0.35); s.lineTo(-0.12, -0.35); s.lineTo(-0.12, -0.05); s.lineTo(-0.3, -0.05); s.closePath(); return s; }, []);
  return <group>{[0, 1, 2, 3].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, z + 3 - i * 1.1]}><shapeGeometry args={[shape]} /><meshBasicMaterial color="#245cff" transparent opacity={0.9 - i * 0.15} /></mesh>)}</group>;
}
