/*
    CUBELETS

    A Cubelet is one of the 27 small cubes that make up a 3x3 Rubik's Cube.
    This module is a *logical* model only — it has no rendering concerns.
    The visual cube lives in `cube.ts` (`CubeMesh` / `Cubie`).

    Faces are stored in a clockwise spiral, Front -> Back:

                  Back
                   5
              -----------
            /    Up     /|
           /     1     / |
           -----------  Right
          |           |  2
    Left  |   Front   |  .
     4    |     0     | /
          |           |/
           -----------
               Down
                3

    The `faces` array is mapped to convenience accessors:

      cubelet.faces[0] === cubelet.front
      cubelet.faces[1] === cubelet.up
      cubelet.faces[2] === cubelet.right
      cubelet.faces[3] === cubelet.down
      cubelet.faces[4] === cubelet.left
      cubelet.faces[5] === cubelet.back

    Each Cubelet has an `id` assigned at creation and an `address` that changes
    as it moves around the Cube. `addressX/Y/Z` are derived from the address and
    locate the Cubelet relative to the Cube's core, each in the range -1..+1.
*/

import type { FaceKey } from '../../core/state';

/** Axis of rotation for a quarter turn. */
export type Axis = 'x' | 'y' | 'z';

/** Direction of a quarter turn: +1 clockwise, -1 counter-clockwise (looking from +axis). */
export type Direction = 1 | -1;

/** Classification of a Cubelet by how many stickered (exposed) faces it has. */
export type CubeletType = 'core' | 'center' | 'edge' | 'corner';

/** Face slot names in clockwise-spiral order: Front, Up, Right, Down, Left, Back. */
export const FACE_NAMES = ['front', 'up', 'right', 'down', 'left', 'back'] as const;
export type FaceName = (typeof FACE_NAMES)[number];

/** Solved-orientation normal label for each face slot. */
const FACE_NORMALS: readonly FaceKey[] = ['F', 'U', 'R', 'D', 'L', 'B'];

/** Normalize signed zero (-0 -> 0) so coordinates compare and print cleanly. */
const nz = (n: number): number => (n === 0 ? 0 : n);

export interface CubeletFace {
    /** Original slot id 0-5 at construction; stable identity used for solving. */
    readonly id: number;
    /** Sticker color, or `null` when the face is interior (hidden) to the Cube. */
    color: FaceKey | null;
    /** Solved-orientation normal label captured at construction. */
    readonly normal: FaceKey;
}

// Quarter-turn face permutations, expressed in current-accessor order
// [front, up, right, down, left, back]: each entry names the OLD face that ends
// up in that slot after the turn. Derived as the inverse of the coordinate
// rotation in `rotateAddress`, so face remapping and lattice motion stay in sync
// (and match the visual animator's `rotateCoord`).
const FACE_PERMUTATIONS: Record<Axis, Record<Direction, readonly FaceName[]>> = {
    x: {
        [1]: ['up', 'back', 'right', 'front', 'left', 'down'],
        [-1]: ['down', 'front', 'right', 'back', 'left', 'up']
    },
    y: {
        [1]: ['left', 'up', 'front', 'down', 'back', 'right'],
        [-1]: ['right', 'up', 'back', 'down', 'front', 'left']
    },
    z: {
        [1]: ['front', 'right', 'down', 'left', 'up', 'back'],
        [-1]: ['front', 'left', 'up', 'right', 'down', 'back']
    }
};

export class Cubelet {
    /** Unique number 0-26 assigned when the Cube is built. */
    readonly id: number;

    /** Current location on the Cube (0-26). Changes as the Cubelet moves. */
    address: number;

    /** Lattice coordinates relative to the Cube core, each in -1..+1. */
    addressX = 0;
    addressY = 0;
    addressZ = 0;

    /** The six faces in clockwise-spiral order (see module header). */
    faces: CubeletFace[];

    /** Derived from the number of stickered faces. */
    readonly type: CubeletType;

    /**
     * @param id     Unique cubelet id 0-26 (also the initial address).
     * @param colors Up to six sticker colors in slot order [front, up, right, down, left, back].
     *               Use `null`/`undefined` for interior faces.
     */
    constructor(id = 0, colors: ReadonlyArray<FaceKey | null | undefined> = []) {
        this.id = id;
        this.address = id;
        this.setAddress(id);

        let extrovertedFaces = 0;
        this.faces = FACE_NAMES.map((_, i): CubeletFace => {
            const color = colors[i] ?? null;
            if (color !== null) extrovertedFaces++;
            return { id: i, color, normal: FACE_NORMALS[i] };
        });

        const types: readonly CubeletType[] = ['core', 'center', 'edge', 'corner'];
        this.type = types[extrovertedFaces] ?? 'core';
    }

    get front(): CubeletFace { return this.faces[0]; }
    get up(): CubeletFace { return this.faces[1]; }
    get right(): CubeletFace { return this.faces[2]; }
    get down(): CubeletFace { return this.faces[3]; }
    get left(): CubeletFace { return this.faces[4]; }
    get back(): CubeletFace { return this.faces[5]; }

    /** Concatenated face-color initials in slot order, '-' for interior faces. */
    get colors(): string {
        return this.faces.map(face => face.color ?? '-').join('');
    }

    /**
     * Assign a new address (0-26) and recompute the lattice coordinates.
     * Called during Cube remapping after moves.
     */
    setAddress(address = 0): void {
        this.address = address;
        this.addressX = nz((address % 3) - 1);
        this.addressY = nz((Math.floor((address % 9) / 3) - 1) * -1);
        this.addressZ = nz((Math.floor(address / 9) - 1) * -1);
    }

    /**
     * Apply a logical quarter turn about `axis`, remapping the faces (orientation)
     * and rotating the lattice coordinates (position).
     */
    rotate(axis: Axis, dir: Direction): void {
        const order = FACE_PERMUTATIONS[axis][dir];
        this.faces = order.map(name => this[name]);
        this.rotateAddress(axis, dir);
    }

    /** Rotate the lattice coordinates by a quarter turn about `axis`. */
    private rotateAddress(axis: Axis, dir: Direction): void {
        const { addressX: x, addressY: y, addressZ: z } = this;
        if (axis === 'x') {
            if (dir === 1) { this.addressY = nz(-z); this.addressZ = nz(y); }
            else { this.addressY = nz(z); this.addressZ = nz(-y); }
        } else if (axis === 'y') {
            if (dir === 1) { this.addressX = nz(z); this.addressZ = nz(-x); }
            else { this.addressX = nz(-z); this.addressZ = nz(x); }
        } else {
            if (dir === 1) { this.addressX = nz(-y); this.addressY = nz(x); }
            else { this.addressX = nz(y); this.addressY = nz(-x); }
        }
    }

    /**
     * Find which face carries `color`.
     * @returns the face name, or `null` if the Cubelet has no such color.
     */
    hasColor(color: FaceKey): FaceName | null {
        const index = this.faces.findIndex(face => face.color === color);
        return index === -1 ? null : FACE_NAMES[index];
    }

    /** True only if the Cubelet carries every one of the given colors. */
    hasColors(...colors: FaceKey[]): boolean {
        return colors.every(color => this.hasColor(color) !== null);
    }

    /** Plain, serializable snapshot of the Cubelet — handy for logging/tests. */
    inspect(): {
        id: number;
        type: CubeletType;
        address: number;
        addressX: number;
        addressY: number;
        addressZ: number;
        colors: string;
    } {
        return {
            id: this.id,
            type: this.type,
            address: this.address,
            addressX: this.addressX,
            addressY: this.addressY,
            addressZ: this.addressZ,
            colors: this.colors
        };
    }
}
