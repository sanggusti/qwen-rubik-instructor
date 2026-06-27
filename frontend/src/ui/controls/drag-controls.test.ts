import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { _internal } from './drag-controls';

const { faceFromWorldNormal, dominantAxis, resolveDragToMove } = _internal;

function obliqueCamera(): THREE.PerspectiveCamera {
    // Mirrors the default scene pose (see scene.ts): an oblique view where the two
    // in-plane axes of a face foreshorten by different amounts — the situation that
    // exposed the axis-selection magnitude bias.
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    cam.position.set(5, 5, 7);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

// Build a screen-space drag (dx, dy in pixels) aligned with the on-screen
// projection of a world-space `axis`. Matches drag-controls' screenDrag = (dx, -dy)
// convention against NDC (y-up) projection deltas.
function dragAlong(
    cam: THREE.Camera,
    worldPoint: THREE.Vector3,
    axis: THREE.Vector3,
    pixels: number
): { dx: number; dy: number } {
    const a = worldPoint.clone().project(cam);
    const b = worldPoint.clone().add(axis).project(cam);
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len = Math.hypot(sx, sy) || 1;
    const ux = sx / len;
    const uy = sy / len;
    // screenDrag = (dx, -dy) should be parallel to (ux, uy).
    return { dx: ux * pixels, dy: -uy * pixels };
}

function pendingOn(face: string, worldPoint: THREE.Vector3, coord: THREE.Vector3): any {
    return { hitFace: face, hitWorldPoint: worldPoint, hitCubie: { coord }, startScreen: new THREE.Vector2() };
}

function isInverse(a: string, b: string): boolean {
    const prime = (m: string) => (m.endsWith("'") ? m.slice(0, -1) : m + "'");
    return prime(a) === b;
}

describe('faceFromWorldNormal — resolve current face from live geometry', () => {
    it('maps axis-aligned outward normals to the correct face', () => {
        expect(faceFromWorldNormal(new THREE.Vector3(1, 0, 0))).toBe('R');
        expect(faceFromWorldNormal(new THREE.Vector3(-1, 0, 0))).toBe('L');
        expect(faceFromWorldNormal(new THREE.Vector3(0, 1, 0))).toBe('U');
        expect(faceFromWorldNormal(new THREE.Vector3(0, -1, 0))).toBe('D');
        expect(faceFromWorldNormal(new THREE.Vector3(0, 0, 1))).toBe('F');
        expect(faceFromWorldNormal(new THREE.Vector3(0, 0, -1))).toBe('B');
    });

    it('a sticker that now points up resolves to U regardless of its original paint', () => {
        // A front sticker rotated by a real move can end up facing +Y; the live normal
        // must drive the result, not the sticker color. Slight float wobble tolerated.
        const wobbly = new THREE.Vector3(0.02, 0.99, -0.01).normalize();
        expect(faceFromWorldNormal(wobbly)).toBe('U');
    });

    it('returns null for an ambiguous (non-dominant) normal', () => {
        expect(faceFromWorldNormal(new THREE.Vector3(1, 1, 0))).toBeNull();
        expect(dominantAxis(new THREE.Vector3(1, 1, 0))).toBeNull();
    });
});

describe('resolveDragToMove — consistent axis selection from an oblique camera', () => {
    const cam = obliqueCamera();
    // Front-top-right corner sticker, on the front (+Z) face.
    const worldPoint = new THREE.Vector3(1, 1, 1.53);
    const coord = new THREE.Vector3(1, 1, 1);
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);

    it('horizontal (world-X) drag turns a Y-axis layer (U/D/E group)', () => {
        const { dx, dy } = dragAlong(cam, worldPoint, X, 40);
        const move = resolveDragToMove(cam, pendingOn('F', worldPoint, coord), dx, dy);
        expect(move).not.toBeNull();
        expect(['U', "U'", 'D', "D'", 'E', "E'"]).toContain(move);
    });

    it('vertical (world-Y) drag turns an X-axis layer (R/L/M group)', () => {
        const { dx, dy } = dragAlong(cam, worldPoint, Y, 40);
        const move = resolveDragToMove(cam, pendingOn('F', worldPoint, coord), dx, dy);
        expect(move).not.toBeNull();
        expect(['R', "R'", 'L', "L'", 'M', "M'"]).toContain(move);
    });

    it('opposite drags along the same axis produce inverse moves', () => {
        const fwd = dragAlong(cam, worldPoint, X, 40);
        const back = dragAlong(cam, worldPoint, X, -40);
        const m1 = resolveDragToMove(cam, pendingOn('F', worldPoint, coord), fwd.dx, fwd.dy)!;
        const m2 = resolveDragToMove(cam, pendingOn('F', worldPoint, coord), back.dx, back.dy)!;
        expect(m1).not.toBeNull();
        expect(m2).not.toBeNull();
        expect(isInverse(m1, m2)).toBe(true);
    });

    it('selects the slice from the hit cubie coord along the rotation axis', () => {
        // Center-of-front cubie: a horizontal drag should turn the equatorial (E) slice.
        const centerPoint = new THREE.Vector3(0, 0, 1.53);
        const centerCoord = new THREE.Vector3(0, 0, 1);
        const { dx, dy } = dragAlong(cam, centerPoint, X, 40);
        const move = resolveDragToMove(cam, pendingOn('F', centerPoint, centerCoord), dx, dy);
        expect(['E', "E'"]).toContain(move);
    });
});

describe('resolveDragToMove — U face (the reported "U drag turns the middle" case)', () => {
    const cam = obliqueCamera();
    const X = new THREE.Vector3(1, 0, 0);
    const Z = new THREE.Vector3(0, 0, 1);

    // On the top face the two in-plane axes are world X and Z. From the oblique
    // camera both project diagonally on screen, which is exactly what made the old
    // screen-space axis comparison flip and turn the wrong layer.
    it('horizontal (world-X) drag on a front-row top cubie turns its F-layer, never the middle', () => {
        const p = new THREE.Vector3(1, 1.53, 1); // top face, front row (z=+1)
        const coord = new THREE.Vector3(1, 1, 1);
        const { dx, dy } = dragAlong(cam, p, X, 40);
        const move = resolveDragToMove(cam, pendingOn('U', p, coord), dx, dy);
        expect(['F', "F'"]).toContain(move);
    });

    it('horizontal (world-X) drag on a MIDDLE-row top cubie turns the S slice', () => {
        const p = new THREE.Vector3(1, 1.53, 0); // top face, middle row (z=0)
        const coord = new THREE.Vector3(1, 1, 0);
        const { dx, dy } = dragAlong(cam, p, X, 40);
        const move = resolveDragToMove(cam, pendingOn('U', p, coord), dx, dy);
        expect(['S', "S'"]).toContain(move);
    });

    it('front-back (world-Z) drag on a right-column top cubie turns its R-layer', () => {
        const p = new THREE.Vector3(1, 1.53, 1); // top face, right column (x=+1)
        const coord = new THREE.Vector3(1, 1, 1);
        const { dx, dy } = dragAlong(cam, p, Z, 40);
        const move = resolveDragToMove(cam, pendingOn('U', p, coord), dx, dy);
        expect(['R', "R'"]).toContain(move);
    });

    it('axis choice is stable: tiny perpendicular noise does not flip the layer', () => {
        const p = new THREE.Vector3(1, 1.53, 1);
        const coord = new THREE.Vector3(1, 1, 1);
        const base = dragAlong(cam, p, X, 40);
        const noisy = dragAlong(cam, p, new THREE.Vector3(1, 0, 0.18).normalize(), 40);
        const m1 = resolveDragToMove(cam, pendingOn('U', p, coord), base.dx, base.dy);
        const m2 = resolveDragToMove(cam, pendingOn('U', p, coord), noisy.dx, noisy.dy);
        expect(m1).toBe(m2);
    });
});

describe('resolveDragToMove — M slice from a center-column drag (the reported "M turns F" case)', () => {
    const cam = obliqueCamera();
    const Y = new THREE.Vector3(0, 1, 0);

    it('vertical drag on the front-center cubie turns the M slice, not F', () => {
        const p = new THREE.Vector3(0, 0, 1.53); // front face center column (x=0)
        const coord = new THREE.Vector3(0, 0, 1);
        const { dx, dy } = dragAlong(cam, p, Y, 40);
        const move = resolveDragToMove(cam, pendingOn('F', p, coord), dx, dy);
        expect(['M', "M'"]).toContain(move);
    });
});
