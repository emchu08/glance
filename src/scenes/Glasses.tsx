import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { photoLayout, smooth, type LoadedPhoto } from '../experience/photos';
import { GLASSES_MODEL, RIGHT_LENS_CENTER } from './glassesAsset';

export const clearGlassesCache = () => useGLTF.clear(GLASSES_MODEL);

// Project the destination photograph through the lens using exactly the DOM photo's crop.
// As the lens fills the screen, both layers show the same pixels at the same coordinates.
function PhotoLens({ photo, entry }: { photo: LoadedPhoto; entry: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const texture = useMemo(() => { const t = new THREE.Texture(photo.image); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }, [photo.image]);
  const uniforms = useMemo(() => ({ image: { value: texture }, resolution: { value: new THREE.Vector2() }, imageRect: { value: new THREE.Vector4() }, region: { value: new THREE.Vector4() }, opacity: { value: 0 } }), [texture]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ size }) => {
    if (!material.current) return;
    const active = material.current.uniforms;
    const layout = photoLayout(photo.id, size.width, size.height);
    active.resolution.value.set(size.width, size.height);
    active.imageRect.value.set(layout.left + layout.region.left, layout.top + layout.region.top, layout.width, layout.height);
    active.region.value.set(layout.region.left, layout.region.top, layout.region.width, layout.region.height);
    active.opacity.value = smooth(entry, .18, .54);
  });
  return <shaderMaterial ref={material} uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false}
    vertexShader={`varying vec4 screenPosition; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); screenPosition = gl_Position; }`}
    fragmentShader={`uniform sampler2D image; uniform vec2 resolution; uniform vec4 imageRect; uniform vec4 region; uniform float opacity; varying vec4 screenPosition;
      void main() { vec2 screen = screenPosition.xy / screenPosition.w * .5 + .5; vec2 pixel = vec2(screen.x, 1.0 - screen.y) * resolution;
        vec2 uv = (pixel - imageRect.xy) / imageRect.zw;
        vec3 color = texture2D(image, vec2(uv.x, 1.0 - uv.y)).rgb;
        if (pixel.y < region.y || pixel.y > region.y + region.w) color = vec3(.78, .85, 1.0);
        gl_FragColor = vec4(color, opacity);
        #include <colorspace_fragment>
      }`} />;
}

// Remove only the export's shared translation/rotation/scale. Every mesh keeps its
// original transform relative to the frame, including the camera and hinge details.
function prepareModel(source: THREE.Group) {
  const scene = source.clone(true);
  scene.updateMatrixWorld(true);
  const frame = scene.getObjectByName('Object_26') as THREE.Mesh;
  const lenses = scene.getObjectByName('Object_22') as THREE.Mesh;
  if (!frame?.isMesh || !lenses?.isMesh) throw new Error('Unexpected Ray-Ban model hierarchy');
  const normalization = frame.matrixWorld.clone().invert();
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.matrix.copy(normalization);
  root.add(scene);

  const materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const glassMaterials: THREE.MeshStandardMaterial[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const convert = (original: THREE.MeshStandardMaterial) => {
      let material = materials.get(original);
      if (material) return material;
      material = original.clone();
      if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
      if (original.name === 'High-Gloss_Red_Plastic.001') {
        material.color.set('#11171c'); material.roughness = .3; material.metalness = .08;
        material.transparent = false; material.opacity = 1; material.depthWrite = true;
        if (material instanceof THREE.MeshPhysicalMaterial) { material.clearcoat = .18; material.clearcoatRoughness = .3; }
      } else if (original.name === 'glass.001') {
        material.color.set('#52696b'); material.roughness = .15; material.metalness = .05;
        material.transparent = true; material.opacity = .2; material.depthWrite = false;
        material.side = THREE.FrontSide; glassMaterials.push(material);
      } else if (original.name === 'camera_lens.001') {
        material.color.set('#243e50'); material.roughness = .12; material.metalness = .3;
        material.transparent = true; material.opacity = .72; material.depthWrite = false;
      } else if (original.name === 'Material.002') {
        material.color.set('#15191d'); material.roughness = .32; material.metalness = .45;
      }
      // Keep the original branded texture maps and their alpha channels intact.
      materials.set(original, material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(m => convert(m as THREE.MeshStandardMaterial)) : convert(object.material as THREE.MeshStandardMaterial);
    object.castShadow = !['glass.001', 'camera_lens.001', 'RB_white.001', 'RAY_BAN_white.001'].includes((object.material as THREE.Material).name);
  });

  // The original lens mesh contains both lenses. Extract its wearer-facing right
  // surface (local -X, -Z normal), preserving its exact silhouette and curvature.
  const preview = lenses.geometry.clone();
  preview.applyMatrix4(normalization.clone().multiply(lenses.matrixWorld));
  const positions = preview.getAttribute('position');
  const normals = preview.getAttribute('normal');
  const originalIndex = preview.getIndex();
  const indices: number[] = [];
  for (let i = 0; i < (originalIndex?.count ?? positions.count); i += 3) {
    const a = originalIndex ? originalIndex.getX(i) : i;
    const b = originalIndex ? originalIndex.getX(i + 1) : i + 1;
    const c = originalIndex ? originalIndex.getX(i + 2) : i + 2;
    if (positions.getX(a) < 0 && positions.getX(b) < 0 && positions.getX(c) < 0 && normals.getZ(a) + normals.getZ(b) + normals.getZ(c) < -1.5) indices.push(a, b, c);
  }
  if (!indices.length) throw new Error('Right lens preview surface is missing');
  preview.setIndex(indices);
  return { root, preview, materials: [...materials.values()], glassMaterials };
}

export default function Glasses({ photo, entry, rotation, reduced, onReady }: { photo: LoadedPhoto | null; entry: number; rotation: { x: number; y: number }; reduced: boolean; onReady: (progress: number) => void }) {
  const { scene } = useGLTF(GLASSES_MODEL);
  const model = useMemo(() => prepareModel(scene), [scene]);
  const group = useRef<THREE.Group>(null);
  const reported = useRef(false);
  useEffect(() => () => { model.preview.dispose(); model.materials.forEach(material => material.dispose()); }, [model]);
  useFrame(({ pointer, clock }, dt) => {
    if (!group.current) return;
    if (!reported.current) { reported.current = true; onReady(100); }
    const alignment = THREE.MathUtils.smoothstep(entry, 0, .43);
    const restingY = -.48 + rotation.y + (reduced ? 0 : pointer.x * .07);
    const restingX = .05 + rotation.x + (reduced ? 0 : pointer.y * .035);
    group.current.rotation.y = entry > 0 ? THREE.MathUtils.lerp(restingY, Math.PI, alignment) : reduced ? restingY : THREE.MathUtils.damp(group.current.rotation.y, restingY, 7, dt);
    group.current.rotation.x = entry > 0 ? restingX * (1 - alignment) : reduced ? restingX : THREE.MathUtils.damp(group.current.rotation.x, restingX, 7, dt);
    group.current.rotation.z = -.08 * (1 - alignment);
    group.current.position.y = 1.65 + (reduced ? 0 : Math.sin(clock.elapsedTime * .65) * .035 * (1 - alignment));
    model.glassMaterials.forEach(material => { material.opacity = .2 * (1 - smooth(entry, .5, .8)); });
  });
  return <group ref={group} position={[0, 1.65, 5]} visible={entry < .985}>
    <primitive object={model.root} dispose={null} />
    {photo && entry > .18 && entry < .985 && <mesh geometry={model.preview} position={[0, 0, -.004]} renderOrder={1}>
      <PhotoLens photo={photo} entry={entry} />
    </mesh>}
    {/* The display is a Glance concept; this hardware has no in-lens shopping display. */}
    <group position={[RIGHT_LENS_CENTER[0], RIGHT_LENS_CENTER[1], .005]} visible={entry < .18}>
      <mesh><planeGeometry args={[.44, .27]} /><meshBasicMaterial color="#17374b" transparent opacity={.3} side={THREE.DoubleSide} depthWrite={false}/></mesh>
      {[0, 1, 2].map(i => <mesh key={i} position={[-.035, .065 - i * .065, .006]}><planeGeometry args={[i === 0 ? .27 : .19, .012]} /><meshBasicMaterial color={i === 0 ? '#9cceff' : '#d7ebdf'} side={THREE.DoubleSide} transparent opacity={.65} depthWrite={false}/></mesh>)}
    </group>
  </group>;
}
