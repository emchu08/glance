import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Procedural glasses: extruded Bézier rims, tinted lenses, tube temples, hinges, cameras, right-lens mini preview. */
export function Glasses({ progress, rot, reduced, onReady }: { progress: number; rot: { yaw: number; pitch: number }; reduced: boolean; onReady: () => void }) {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const lensMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const preview = useRef<THREE.Group>(null);

  const { rimGeo, lensGeo } = useMemo(() => {
    const outline = (scale = 1) => {
      const s = new THREE.Shape();
      const p = (x: number, y: number) => [x * scale, y * scale] as const;
      s.moveTo(...p(-0.89, 0.47));
      s.bezierCurveTo(...p(-0.5, 0.67), ...p(0.57, 0.62), ...p(0.91, 0.38));
      s.bezierCurveTo(...p(0.88, -0.05), ...p(0.75, -0.6), ...p(0.43, -0.63));
      s.bezierCurveTo(...p(0.06, -0.74), ...p(-0.56, -0.62), ...p(-0.72, -0.43));
      s.bezierCurveTo(...p(-0.89, -0.24), ...p(-0.98, 0.23), ...p(-0.89, 0.47));
      s.closePath();
      return s;
    };
    const rim = outline(1);
    const hole = outline(0.83);
    const holePath = new THREE.Path(hole.getPoints(32).reverse());
    rim.holes.push(holePath);
    const rimGeo = new THREE.ExtrudeGeometry(rim, { depth: 0.17, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.047, bevelThickness: 0.04, curveSegments: 32 });
    const lensGeo = new THREE.ShapeGeometry(outline(0.84), 40);
    return { rimGeo, lensGeo };
  }, []);

  const templeGeo = useMemo(() => {
    const mk = (side: 1 | -1) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(1.96 * side, 0.3, 0.03), new THREE.Vector3(2.12 * side, 0.27, -0.45), new THREE.Vector3(2.07 * side, 0.22, -1.7), new THREE.Vector3(1.9 * side, 0.1, -2.9), new THREE.Vector3(1.76 * side, -0.3, -3.2)]), 48, 0.082, 12, false);
    return [mk(1), mk(-1)];
  }, []);

  useEffect(() => { onReady(); return () => { rimGeo.dispose(); lensGeo.dispose(); templeGeo.forEach((g) => g.dispose()); }; }, [onReady, rimGeo, lensGeo, templeGeo]);

  useFrame((_, dt) => {
    const g = group.current; if (!g) return;
    const align = Math.min(1, progress / 0.43);
    const yawRest = -0.36 + rot.yaw + (reduced ? 0 : pointer.x * 0.07);
    const pitchRest = 0.05 + rot.pitch + (reduced ? 0 : -pointer.y * 0.035);
    const ty = THREE.MathUtils.lerp(yawRest, Math.PI, align);
    const tp = THREE.MathUtils.lerp(pitchRest, 0, align);
    const tr = THREE.MathUtils.lerp(-0.08, 0, align);
    const k = reduced ? 1 : 1 - Math.exp(-7 * dt);
    g.rotation.y += (ty - g.rotation.y) * k; g.rotation.x += (tp - g.rotation.x) * k; g.rotation.z += (tr - g.rotation.z) * k;
    g.visible = progress < 0.985;
    if (lensMat.current) { const f = THREE.MathUtils.clamp((progress - 0.72) / 0.23, 0, 1); lensMat.current.opacity = 0.36 * (1 - f); lensMat.current.roughness = THREE.MathUtils.lerp(0.14, 0.74, f); }
    if (preview.current) preview.current.visible = progress < 0.8;
  });

  const rimMat = <meshPhysicalMaterial color="#141b20" metalness={0.2} roughness={0.26} clearcoat={0.9} clearcoatRoughness={0.15} />;
  const templeMat = <meshPhysicalMaterial color="#192025" roughness={0.24} metalness={0.15} clearcoat={1} />;
  return (
    <group ref={group} position={[0, 1.65, 5]}>
      {/* lenses + rims (wearer faces +Z; right lens is local −X) */}
      {[-1.06, 1.06].map((x) => (
        <group key={x} position={[x, 0, 0]} scale={[x < 0 ? -1 : 1, 1, 1]}>
          <mesh geometry={rimGeo} castShadow>{rimMat}</mesh>
          <mesh geometry={lensGeo} position={[0, 0, 0.07]}>
            <meshPhysicalMaterial ref={x < 0 ? lensMat : undefined} color="#526568" metalness={0.5} roughness={0.14} transparent opacity={0.36} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* camera circle at outer top corner */}
          <mesh position={[0.86, 0.42, 0.14]}><circleGeometry args={[0.087, 24]} /><meshStandardMaterial color="#0a0a0a" /></mesh>
          <mesh position={[0.86, 0.42, 0.15]}><circleGeometry args={[0.052, 24]} /><meshStandardMaterial color={x < 0 ? "#1b2a4a" : "#3a4a5a"} metalness={0.8} roughness={0.2} /></mesh>
          <mesh position={[0.95, 0.4, 0.02]}><boxGeometry args={[0.06, 0.08, 0.1]} /><meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.3} /></mesh>
        </group>
      ))}
      {/* bridge */}
      <mesh position={[0, 0.24, 0.12]} rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[0.07, 0.36, 6, 12]} /><meshPhysicalMaterial color="#141b20" clearcoat={0.9} roughness={0.3} /></mesh>
      {/* temples + housings + hinges + speaker slots */}
      {templeGeo.map((geo, i) => { const side = i === 0 ? 1 : -1; return (
        <group key={side}>
          <mesh geometry={geo} castShadow>{templeMat}</mesh>
          <mesh position={[2.08 * side, 0.24, -0.7]}><boxGeometry args={[0.17, 0.25, 1.45]} />{templeMat}</mesh>
          <mesh position={[1.98 * side, 0.3, -0.1]}><boxGeometry args={[0.23, 0.23, 0.28]} /><meshStandardMaterial color="#0d1115" /></mesh>
          {[0.05, -0.05].map((dz) => <mesh key={dz} position={[2.1 * side, 0.3, -0.1 + dz]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.02, 0.02, 0.05, 10]} /><meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.3} /></mesh>)}
          {[0, 1, 2, 3].map((n) => <mesh key={n} position={[2.17 * side, 0.2, -1.1 - n * 0.12]}><boxGeometry args={[0.02, 0.05, 0.06]} /><meshStandardMaterial color="#050505" /></mesh>)}
        </group>
      ); })}
      {/* right-lens mini preview (abstract) */}
      <group ref={preview} position={[-1.07, -0.01, 0.09]}>
        <mesh><planeGeometry args={[0.54, 0.33]} /><meshBasicMaterial color="#0f2a2c" transparent opacity={0.55} /></mesh>
        {[0.09, 0.03, -0.03].map((y, i) => <mesh key={y} position={[-0.06, y, 0.001]}><planeGeometry args={[0.3 - i * 0.06, 0.02]} /><meshBasicMaterial color={i === 0 ? "#9be6c5" : "#a9cdf5"} /></mesh>)}
        <mesh position={[0.12, -0.1, 0.001]}><planeGeometry args={[0.16, 0.05]} /><meshBasicMaterial color="#245cff" /></mesh>
      </group>
      {/* reflection lightformers */}
      <mesh position={[0, 3, 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 1.2]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
    </group>
  );
}
