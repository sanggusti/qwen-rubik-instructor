"""Cube-state legality: proves a state is physically reachable.

Verbatim port of frontend/src/lib/physical/legality.ts (check + center
canonicalization; the rotation auto-fix stays client-side). Kept in lockstep
via the shared fixture backend/tests/fixtures/legality_fixtures.json — both
engines must agree on every case, same convention as cube_fixtures.json.

`is_well_formed` only counts colors; a random color-count-valid reassembly is
solvable with probability 1/12, so scanned or hand-entered states need the
real checks: cubie structure (incl. mirror-image chirality), corner twist sum
mod 3, edge flip sum mod 2, and permutation parity.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from pipeline.cube.facelet import FACES, State, apply_move, clone_state

# 8 corner slots. Sticker order is clockwise viewed from outside the corner,
# starting with the U/D-face facelet (standard Singmaster/Kociemba labels).
CORNER_SLOTS: List[List[Tuple[str, int]]] = [
    [("U", 8), ("R", 0), ("F", 2)],  # URF
    [("U", 6), ("F", 0), ("L", 2)],  # UFL
    [("U", 0), ("L", 0), ("B", 2)],  # ULB
    [("U", 2), ("B", 0), ("R", 2)],  # UBR
    [("D", 2), ("F", 8), ("R", 6)],  # DFR
    [("D", 0), ("L", 8), ("F", 6)],  # DLF
    [("D", 6), ("B", 8), ("L", 6)],  # DBL
    [("D", 8), ("R", 8), ("B", 6)],  # DRB
]

# The 8 legal corner cubies as clockwise color triples (U/D color first).
# A mirrored reading (e.g. UFR) is physically impossible.
LEGAL_CORNERS = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"]

# 12 edge slots; first sticker is the orientation-primary facelet
# (U/D facelet for U/D-layer slots, F/B facelet for middle-layer slots).
EDGE_SLOTS: List[List[Tuple[str, int]]] = [
    [("U", 5), ("R", 1)],  # UR
    [("U", 7), ("F", 1)],  # UF
    [("U", 3), ("L", 1)],  # UL
    [("U", 1), ("B", 1)],  # UB
    [("D", 5), ("R", 7)],  # DR
    [("D", 1), ("F", 7)],  # DF
    [("D", 3), ("L", 7)],  # DL
    [("D", 7), ("B", 7)],  # DB
    [("F", 5), ("R", 3)],  # FR
    [("F", 3), ("L", 5)],  # FL
    [("B", 5), ("L", 3)],  # BL
    [("B", 3), ("R", 5)],  # BR
]

LEGAL_EDGES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"]

ROTATION_MOVES = ["x", "x'", "y", "y'", "z", "z'"]

# Result: (ok, code, suspects). code in {structure, twist, flip, parity}.
LegalityResult = Tuple[bool, Optional[str], List[Dict[str, object]]]


def _centers_identity(state: State) -> bool:
    return all(state[f][4] == f for f in FACES)


def canonicalize_centers(state: State) -> Optional[State]:
    """Rotate the whole cube so centers sit on their home faces.

    Slice moves and cube rotations displace centers; manual entry can corrupt
    them beyond repair (returns None). BFS over quarter rotations — the
    rotation group's diameter is <= 4 with these generators.
    """
    if _centers_identity(state):
        return clone_state(state)
    frontier = [clone_state(state)]
    for _ in range(4):
        nxt = []
        for s in frontier:
            for m in ROTATION_MOVES:
                t = clone_state(s)
                apply_move(t, m)
                if _centers_identity(t):
                    return t
                nxt.append(t)
        frontier = nxt
    return None


def _permutation_parity(perm: List[int]) -> int:
    swaps = 0
    seen = [False] * len(perm)
    for i in range(len(perm)):
        if seen[i]:
            continue
        length = 0
        j = i
        while not seen[j]:
            seen[j] = True
            j = perm[j]
            length += 1
        swaps += length - 1
    return swaps % 2


def _slot_suspects(slot: List[Tuple[str, int]]) -> List[Dict[str, object]]:
    return [{"face": face, "index": index} for face, index in slot]


def check_legality(input_state: State) -> LegalityResult:
    state = canonicalize_centers(input_state)
    if state is None:
        return (False, "structure", [{"face": f, "index": 4} for f in FACES])

    # --- Corners: identity, chirality, orientation, permutation -------------
    corner_perm: List[int] = []
    corner_seen = [False] * 8
    twist_sum = 0
    bad_corners: List[Dict[str, object]] = []

    for slot in CORNER_SLOTS:
        colors = [state[face][index] for face, index in slot]
        ud = [i for i, c in enumerate(colors) if c in ("U", "D")]
        if len(ud) != 1:
            bad_corners.extend(_slot_suspects(slot))
            continue
        ud_index = ud[0]
        canonical = colors[ud_index] + colors[(ud_index + 1) % 3] + colors[(ud_index + 2) % 3]
        try:
            cubie = LEGAL_CORNERS.index(canonical)
        except ValueError:
            bad_corners.extend(_slot_suspects(slot))
            continue
        if corner_seen[cubie]:
            bad_corners.extend(_slot_suspects(slot))
            continue
        corner_seen[cubie] = True
        corner_perm.append(cubie)
        twist_sum += ud_index
    if bad_corners:
        return (False, "structure", bad_corners)

    # --- Edges: identity, orientation, permutation --------------------------
    edge_perm: List[int] = []
    edge_seen = [False] * 12
    flip_sum = 0
    bad_edges: List[Dict[str, object]] = []

    for slot in EDGE_SLOTS:
        colors = [state[face][index] for face, index in slot]
        key01 = colors[0] + colors[1]
        key10 = colors[1] + colors[0]
        flipped = 0
        if key01 in LEGAL_EDGES:
            cubie = LEGAL_EDGES.index(key01)
        elif key10 in LEGAL_EDGES:
            cubie = LEGAL_EDGES.index(key10)
            flipped = 1
        else:
            bad_edges.extend(_slot_suspects(slot))
            continue
        if edge_seen[cubie]:
            bad_edges.extend(_slot_suspects(slot))
            continue
        edge_seen[cubie] = True
        edge_perm.append(cubie)
        flip_sum += flipped
    if bad_edges:
        return (False, "structure", bad_edges)

    if twist_sum % 3 != 0:
        return (False, "twist", [])
    if flip_sum % 2 != 0:
        return (False, "flip", [])
    if _permutation_parity(corner_perm) != _permutation_parity(edge_perm):
        return (False, "parity", [])
    return (True, None, [])


# User-facing phrasing per failure code — never "illegal"/"parity" jargon.
LEGALITY_DETAILS: Dict[str, str] = {
    "structure": "some stickers look misread — a piece with those colors can't exist",
    "twist": "one corner appears twisted in place",
    "flip": "one edge appears flipped in place",
    "parity": "two pieces appear swapped",
}
