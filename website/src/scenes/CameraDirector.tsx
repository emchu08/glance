import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Dispatch } from "react";
import type { Action, State } from "../state/reducer";
import type { ScenarioId } from "../state/data";
import { useIsMobile } from "../ui/hooks";

/**
 * Camera director: hero → align with the wearer's right lens → move through it into the world.
 * Entry blends over scroll progress .36–1; grocery route moves over 3.8 s; damped motion throughout.
 */
const HERO = { desktop: new THREE.Vector3(3.6, 3.5, 12.6), mobile: new THREE.Vector3(2.8, 3.5, 22.3) };
const ALIGN = new THREE.Vector3(1.06, 1.65, 11.8);
const THROUGH = new THREE.Vector3(1.06, 1.65, 4.8);
const LOOK_GLASSES = new THREE.Vector3(0, 1.65, 5);
const WORLD: Record<ScenarioId, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  grocery: { pos: new THREE.Vector3(0, 1.65, 4.5), look: new THREE.Vector3(0, 1.3, -6) },
  jacket: { pos: new THREE.Vector3(0.2, 1.6, 3.2), look: new THREE.Vector3(-0.45, 1.25, 0.1) },
  meal: { pos: new THREE.Vector3(0.3, 1.9, 2.6), look: new THREE.Vector3(-0.5, 0.95, 0.2) },
};

export function CameraDirector({ progress, entered, scene, route, dispatch, reduced }: { progress: number; entered: boolean; scene: ScenarioId; route: State["route"]; dispatch: Dispatch<Action>; reduced: boolean }) {
  const { camera } = useThree();
  const mobile = useIsMobile();
  const target = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const routeStart = useRef<number | null>(null);
  const routeFrom = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const hero = mobile ? HERO.mobile : HERO.desktop;
    if (!entered) {
      if (progress < 0.36) { target.current.lerpVectors(hero, ALIGN, smooth(progress / 0.36)); look.current.copy(LOOK_GLASSES); }
      else { const t = smooth((progress - 0.36) / 0.64); target.current.lerpVectors(ALIGN, THROUGH, t); look.current.lerpVectors(LOOK_GLASSES, WORLD.grocery.look, Math.max(0, (progress - 0.72) / 0.28)); }
      routeStart.current = null;
    } else {
      const w = WORLD[scene];
      if (scene === "grocery" && route && route.progress < 1) {
        if (routeStart.current === null) { routeStart.current = performance.now(); routeFrom.current.copy(camera.position); }
        const dur = reduced ? 1 : 3800;
        const p = Math.min(1, (performance.now() - routeStart.current) / dur);
        const dest = new THREE.Vector3(0, 1.65, route.z);
        target.current.lerpVectors(routeFrom.current, dest, smooth(p));
        look.current.set(0, 1.3, route.z - 6);
        if (p >= 1) { dispatch({ type: "grocery/route-arrived" }); routeStart.current = null; }
        else if (Math.abs(p - route.progress) > 0.05) dispatch({ type: "grocery/route-progress", progress: p });
      } else {
        routeStart.current = null;
        target.current.copy(scene === "grocery" && route ? new THREE.Vector3(0, 1.65, route.z) : w.pos);
        look.current.copy(scene === "grocery" && route ? new THREE.Vector3(0, 1.3, route.z - 6) : w.look);
        if (mobile) target.current.z += 1.2;
      }
    }
    const k = reduced ? 1 : 1 - Math.exp(-7 * dt);
    camera.position.lerp(target.current, k);
    const cur = new THREE.Vector3(); camera.getWorldDirection(cur);
    const desired = look.current.clone().sub(camera.position).normalize();
    camera.lookAt(camera.position.clone().add(cur.lerp(desired, k)));
  });
  return null;
}

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
