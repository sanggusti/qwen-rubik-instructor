"""Logical Rubik's cube state — a verbatim port of frontend/src/core/state.ts.

Keeping this bit-for-bit identical to the frontend means the backend's view of
the cube (for solving, highlighting, validation) matches what the user sees.
Any divergence is caught by the Node<->Python cross-validation test.

Faces: U(up) D(down) L(left) R(right) F(front) B(back).
Each face is a flat list of 9 sticker colors. Sticker indices, from the viewer's
perspective looking at that face:
    0 1 2
    3 4 5
    6 7 8
"""

from __future__ import annotations

from typing import Dict, List

FACES = ("U", "D", "L", "R", "F", "B")

# State: face key -> list of 9 color letters.
State = Dict[str, List[str]]


def solved_state() -> State:
    return {f: [f] * 9 for f in FACES}


def clone_state(s: State) -> State:
    return {f: list(s[f]) for f in FACES}


def _rotate_face_cw(face: List[str]) -> List[str]:
    f = face
    return [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]]


def _rotate_face_ccw(face: List[str]) -> List[str]:
    f = face
    return [f[2], f[5], f[8], f[1], f[4], f[7], f[0], f[3], f[6]]


# A "cycle" describes which (face, indices) move where for a CW quarter turn of a
# face layer. Each turn shifts group i -> group i+1 (mod 4).
CYCLES: Dict[str, List[tuple]] = {
    "U": [("F", [0, 1, 2]), ("L", [0, 1, 2]), ("B", [0, 1, 2]), ("R", [0, 1, 2])],
    "D": [("F", [6, 7, 8]), ("R", [6, 7, 8]), ("B", [6, 7, 8]), ("L", [6, 7, 8])],
    "R": [("U", [2, 5, 8]), ("B", [6, 3, 0]), ("D", [2, 5, 8]), ("F", [2, 5, 8])],
    "L": [("U", [0, 3, 6]), ("F", [0, 3, 6]), ("D", [0, 3, 6]), ("B", [8, 5, 2])],
    "F": [("U", [6, 7, 8]), ("R", [0, 3, 6]), ("D", [2, 1, 0]), ("L", [8, 5, 2])],
    "B": [("U", [2, 1, 0]), ("L", [0, 3, 6]), ("D", [6, 7, 8]), ("R", [8, 5, 2])],
}


def _apply_face_turn(state: State, face: str, prime: bool) -> None:
    # A non-prime turn maps new[6] = old[0] in viewer indexing, which is CCW.
    state[face] = _rotate_face_cw(state[face]) if prime else _rotate_face_ccw(state[face])
    cycle = CYCLES[face]
    order = [3, 2, 1, 0] if prime else [0, 1, 2, 3]
    groups = [cycle[i] for i in order]
    tmp = [state[groups[0][0]][idx] for idx in groups[0][1]]
    for i in range(3):
        from_face, from_idx = groups[i + 1]
        to_face, to_idx = groups[i]
        for k in range(3):
            state[to_face][to_idx[k]] = state[from_face][from_idx[k]]
    last_face, last_idx = groups[3]
    for k in range(3):
        state[last_face][last_idx[k]] = tmp[k]


# Slice moves expressed via face turns + whole-cube rotation.
COMPOUND: Dict[str, List[str]] = {
    "M": ["R", "L'", "x'"],
    "M'": ["R'", "L", "x"],
    "E": ["U", "D'", "y'"],
    "E'": ["U'", "D", "y"],
    "S": ["F'", "B", "z"],
    "S'": ["F", "B'", "z'"],
}


def _rot_x(s: State, prime: bool) -> None:
    if not prime:
        F, U, B, D = s["F"], s["U"], s["B"], s["D"]
        s["F"] = U
        s["U"] = _rotate_face_cw(_rotate_face_cw(B))
        s["B"] = _rotate_face_cw(_rotate_face_cw(D))
        s["D"] = F
        s["R"] = _rotate_face_ccw(s["R"])
        s["L"] = _rotate_face_cw(s["L"])
    else:
        F, U, B, D = s["F"], s["U"], s["B"], s["D"]
        s["U"] = F
        s["B"] = _rotate_face_cw(_rotate_face_cw(U))
        s["D"] = _rotate_face_cw(_rotate_face_cw(B))
        s["F"] = D
        s["R"] = _rotate_face_cw(s["R"])
        s["L"] = _rotate_face_ccw(s["L"])


def _rot_y(s: State, prime: bool) -> None:
    if not prime:
        F, L, B, R = s["F"], s["L"], s["B"], s["R"]
        s["F"], s["L"], s["B"], s["R"] = L, B, R, F
        s["U"] = _rotate_face_ccw(s["U"])
        s["D"] = _rotate_face_cw(s["D"])
    else:
        F, L, B, R = s["F"], s["L"], s["B"], s["R"]
        s["L"], s["B"], s["R"], s["F"] = F, L, B, R
        s["U"] = _rotate_face_cw(s["U"])
        s["D"] = _rotate_face_ccw(s["D"])


def _rot_z(s: State, prime: bool) -> None:
    if not prime:
        U, R, D, L = s["U"], s["R"], s["D"], s["L"]
        s["L"] = _rotate_face_ccw(U)
        s["U"] = _rotate_face_ccw(R)
        s["R"] = _rotate_face_ccw(D)
        s["D"] = _rotate_face_ccw(L)
        s["F"] = _rotate_face_ccw(s["F"])
        s["B"] = _rotate_face_cw(s["B"])
    else:
        U, R, D, L = s["U"], s["R"], s["D"], s["L"]
        s["R"] = _rotate_face_cw(U)
        s["D"] = _rotate_face_cw(R)
        s["L"] = _rotate_face_cw(D)
        s["U"] = _rotate_face_cw(L)
        s["F"] = _rotate_face_cw(s["F"])
        s["B"] = _rotate_face_ccw(s["B"])


def apply_move(state: State, move: str) -> None:
    """Apply a single move (mutates state). Matches state.ts applyMove."""
    if not move:
        return
    if move in COMPOUND:
        for m in COMPOUND[move]:
            apply_move(state, m)
        return
    prime = move.endswith("'")
    base = move[:-1] if prime else move
    if base == "x":
        return _rot_x(state, prime)
    if base == "y":
        return _rot_y(state, prime)
    if base == "z":
        return _rot_z(state, prime)
    if base in "UDLRFB":
        return _apply_face_turn(state, base, prime)


def apply_moves(state: State, moves) -> None:
    if isinstance(moves, str):
        moves = moves.split()
    for m in moves:
        apply_move(state, m)


def is_solved(state: State) -> bool:
    return all(all(c == state[f][4] for c in state[f]) for f in FACES)


def is_well_formed(state) -> bool:
    """Basic structural check: 6 named faces, 9 stickers each, and each color
    used exactly 9 times. Does not prove the state is physically solvable."""
    if not isinstance(state, dict) or set(state) != set(FACES):
        return False
    counts = {f: 0 for f in FACES}
    for f in FACES:
        stickers = state[f]
        if not isinstance(stickers, list) or len(stickers) != 9:
            return False
        for c in stickers:
            if c not in counts:
                return False
            counts[c] += 1
    return all(n == 9 for n in counts.values())
