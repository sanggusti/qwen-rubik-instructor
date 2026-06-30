import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { Cubelet, FACE_NAMES, type Axis, type Direction } from './cubelets';
import type { FaceKey } from '../cube/state';
import { _internal } from './animator';

const AXES: Axis[] = ['x', 'y', 'z'];
const DIRS: Direction[] = [1, -1];

// Same id encoding used by CubeMesh: makes addressX/Y/Z line up with (x,y,z).
function idFor(x: number, y: number, z: number): number {
    return (x + 1) + (1 - y) * 3 + (1 - z) * 9;
}

// A cubelet whose every face is colored with its own solved-orientation normal,
// so we can read which original face now occupies each slot.
function labeledCubelet(): Cubelet {
    const colors: FaceKey[] = ['F', 'U', 'R', 'D', 'L', 'B'];
    return new Cubelet(0, colors);
}

describe('Cubelet construction', () => {
    it('classifies type by number of stickered faces', () => {
        expect(new Cubelet(0, []).type).toBe('core');
        expect(new Cubelet(0, ['U']).type).toBe('center');
        expect(new Cubelet(0, ['U', 'F']).type).toBe('edge');
        expect(new Cubelet(0, ['U', 'F', 'R']).type).toBe('corner');
    });

    it('exposes faces in slot order with stable normals', () => {
        const c = labeledCubelet();
        expect(c.faces.map(f => f.normal)).toEqual(['F', 'U', 'R', 'D', 'L', 'B']);
        expect(c.front.color).toBe('F');
        expect(c.up.color).toBe('U');
        expect(c.right.color).toBe('R');
        expect(c.down.color).toBe('D');
        expect(c.left.color).toBe('L');
        expect(c.back.color).toBe('B');
    });

    it('renders colors string with "-" for interior faces', () => {
        expect(new Cubelet(0, ['U', null, 'R']).colors).toBe('U-R---');
    });
});

describe('Cubelet.setAddress', () => {
    it('maps address to lattice coords for every position', () => {
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    const c = new Cubelet(idFor(x, y, z));
                    expect([c.addressX, c.addressY, c.addressZ]).toEqual([x, y, z]);
                }
            }
        }
    });
});

describe('Cubelet.rotate — face permutation', () => {
    it('y+1 moves left->front, front->right, right->back, back->left', () => {
        const c = labeledCubelet();
        c.rotate('y', 1);
        expect(c.colors).toBe('LUFDBR'); // front=L up=U right=F down=D left=B back=R
    });

    it('x+1 moves up->front, back->up, down->back, front->down', () => {
        const c = labeledCubelet();
        c.rotate('x', 1);
        expect(c.colors).toBe('UBRFLD'); // front=U up=B right=R down=F left=L back=D
    });

    it('z+1 moves up->right, right->down, down->left, left->up', () => {
        const c = labeledCubelet();
        c.rotate('z', 1);
        expect(c.colors).toBe('FRDLUB'); // front=F up=R right=D down=L left=U back=B
    });
});

describe('Cubelet.rotate — algebraic invariants', () => {
    it('four quarter turns about any axis is the identity', () => {
        for (const axis of AXES) {
            for (const dir of DIRS) {
                const c = new Cubelet(idFor(1, 1, 1), ['F', 'U', 'R', 'D', 'L', 'B']);
                const beforeColors = c.colors;
                const beforeAddr = [c.addressX, c.addressY, c.addressZ];
                for (let i = 0; i < 4; i++) c.rotate(axis, dir);
                expect(c.colors).toBe(beforeColors);
                expect([c.addressX, c.addressY, c.addressZ]).toEqual(beforeAddr);
            }
        }
    });

    it('a turn followed by its inverse is the identity', () => {
        for (const axis of AXES) {
            const c = new Cubelet(idFor(1, 1, 1), ['F', 'U', 'R', 'D', 'L', 'B']);
            const beforeColors = c.colors;
            const beforeAddr = [c.addressX, c.addressY, c.addressZ];
            c.rotate(axis, 1);
            c.rotate(axis, -1);
            expect(c.colors).toBe(beforeColors);
            expect([c.addressX, c.addressY, c.addressZ]).toEqual(beforeAddr);
        }
    });

    it('preserves the multiset of face normals', () => {
        const c = labeledCubelet();
        c.rotate('x', 1);
        c.rotate('y', -1);
        c.rotate('z', 1);
        expect([...c.faces.map(f => f.normal)].sort()).toEqual(['B', 'D', 'F', 'L', 'R', 'U']);
    });
});

describe('Cubelet.rotate — lattice motion matches the visual animator', () => {
    it('address rotation equals animator rotateCoord for all axes/dirs/positions', () => {
        for (const axis of AXES) {
            for (const dir of DIRS) {
                for (let x = -1; x <= 1; x++) {
                    for (let y = -1; y <= 1; y++) {
                        for (let z = -1; z <= 1; z++) {
                            const c = new Cubelet(idFor(x, y, z));
                            c.rotate(axis, dir);

                            const v = new THREE.Vector3(x, y, z);
                            _internal.rotateCoord(v, axis, dir);

                            // Compare against the visual coord, normalizing -0 to 0.
                            expect([c.addressX, c.addressY, c.addressZ]).toEqual([v.x + 0, v.y + 0, v.z + 0]);
                        }
                    }
                }
            }
        }
    });
});

describe('Cubelet color queries', () => {
    it('hasColor returns the face name carrying a color', () => {
        const c = labeledCubelet();
        expect(c.hasColor('R')).toBe('right');
        c.rotate('y', 1); // R moves into the back slot
        expect(c.hasColor('R')).toBe('back');
    });

    it('hasColors requires every color to be present', () => {
        const c = new Cubelet(0, ['U', 'F', 'R']);
        expect(c.hasColors('U', 'F', 'R')).toBe(true);
        expect(c.hasColors('U', 'B')).toBe(false);
    });
});

it('FACE_NAMES is the canonical slot order', () => {
    expect(FACE_NAMES).toEqual(['front', 'up', 'right', 'down', 'left', 'back']);
});
