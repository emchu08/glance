// Measured from the supplied GLB after removing its export transform.
// Wearer faces +Z; their right lens is -X, viewer-left in a front view.
export const GLASSES_MODEL = '/models/ray-ban-meta/ray-ban-meta.glb';
export const RIGHT_LENS_CENTER = [-1.155445218, -.032553792, -.042792006] as const;
export const RIGHT_LENS_WORLD = [-RIGHT_LENS_CENTER[0], 1.65 + RIGHT_LENS_CENTER[1], 5 - RIGHT_LENS_CENTER[2]] as const;
