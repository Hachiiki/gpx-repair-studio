#!/usr/bin/env python3
"""
Phase 14 fixture generator — binary FIT files for the reader test-suite.

Writes four committed fixtures under src/features/formats/fixtures/files/
and prints their SHA-256 hashes (pinned by tests/fit-reader.test.ts —
the plan's "binary FIT fixtures hash-checked"):

  activity.fit           golden activity: file_id (type 4), record
                         definition + 8 records (one position-less pause
                         record via invalid sint32 markers), lap, session
                         (sport 2 = cycling), activity, valid file CRC.
  activity-compressed.fit same shape with 12 records where records 2..12
                         use compressed-timestamp headers, including one
                         offset wrap (+32 s) — exercises the compressed
                         path and the 14-byte header CRC.
  course.fit             file_id (type 6), course (name), 5 records,
                         2 course points (names with UTF-8 + quotes).
  truncated.fit          activity.fit's message stream cut mid-record,
                         no file CRC — the reader must recover the first
                         records and disclose the truncation.

The encoder is intentionally independent of the TypeScript reader (it
packs structs by hand); the two implementations agreeing is evidence,
not a tautology — the golden VALUES are hand-computed here.

Run: python3 scripts/gen-fit-fixtures.py
"""

import hashlib
import struct
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "src/features/formats/fixtures/files"

# FIT protocol constants ------------------------------------------------------

FIT_EPOCH = 631065600  # 1989-12-31T00:00:00Z in Unix seconds

BASE_ENUM = 0x00
BASE_UINT8 = 0x02
BASE_UINT16 = 0x84
BASE_UINT32 = 0x86
BASE_SINT32 = 0x85
BASE_STRING = 0x07

INVALID_SINT32 = 0x7FFFFFFF
INVALID_UINT8 = 0xFF
INVALID_UINT16 = 0xFFFF
INVALID_UINT32 = 0xFFFFFFFF

MSG_FILE_ID = 0
MSG_SESSION = 18
MSG_LAP = 19
MSG_RECORD = 20
MSG_COURSE = 31
MSG_COURSE_POINT = 32
MSG_ACTIVITY = 34


def crc16_ccitt(data: bytes) -> int:
    """FIT CRC: poly 0x1021, init 0, no reflection, no xor-out."""
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if (crc & 0x8000) else (crc << 1)
            crc &= 0xFFFF
    return crc


def semicircles(degrees: float) -> int:
    return round(degrees * (2 ** 31) / 180.0)


def fit_seconds(iso_unix: int) -> int:
    return iso_unix - FIT_EPOCH


def definition(local: int, global_num: int, fields: list[tuple[int, int, int]]) -> bytes:
    """(fieldNumber, size, baseType) triples → a definition message."""
    body = struct.pack("<BBH", 0, 0, global_num) + bytes([len(fields)])
    for num, size, base in fields:
        body += bytes([num, size, base])
    return bytes([local & 0x0F]) + body


def data(local: int, payload: bytes) -> bytes:
    return bytes([0x40 | (local & 0x0F)]) + payload


def compressed_data(local: int, time_offset: int, payload: bytes) -> bytes:
    return bytes([0x80 | ((local & 0x03) << 5) | (time_offset & 0x1F)]) + payload


def u8(value):  # invalid marker helper
    return INVALID_UINT8 if value is None else int(value)


def u16(value):
    return INVALID_UINT16 if value is None else int(value)


def u32(value):
    return INVALID_UINT32 if value is None else int(value)


def s32(value):
    return INVALID_SINT32 if value is None else semicircles(value)


def altitude_raw(meters: float) -> int:
    return round((meters + 500) * 5)


def fit_file(messages: bytes, *, header_size: int = 12) -> bytes:
    """Assemble header + messages + file CRC (dataSize exact).

    Header layout per the FIT protocol: size(1) + protocol(1) +
    profile(2) + dataSize(4) + ".FIT"(4) = 12 bytes [+ header CRC(2)].
    The 14-byte variant's CRC covers bytes 0..11 (with the FINAL
    dataSize already packed), matching the reader's check.
    """
    if header_size == 14:
        header = struct.pack("<BBHI", 14, 0x10, 2132, len(messages)) + b".FIT"
        header = header + struct.pack("<H", crc16_ccitt(header))
    else:
        header = struct.pack("<BBHI", 12, 0x10, 2132, len(messages)) + b".FIT"
    body = header + messages
    return body + struct.pack("<H", crc16_ccitt(body))


# The shared record payload builder (fields: 253 u32, 0 s32, 1 s32,
# 2 u16, 3 u8, 4 u8 — timestamp, lat, lon, altitude, hr, cadence).
RECORD_DEF_FIELDS = [(253, 4, BASE_UINT32), (0, 4, BASE_SINT32), (1, 4, BASE_SINT32), (2, 2, BASE_UINT16), (3, 1, BASE_UINT8), (4, 1, BASE_UINT8)]


def record_payload(t_fit: int, lat, lon, alt: float, hr, cad) -> bytes:
    return (
        struct.pack("<I", t_fit)
        + struct.pack("<i", s32(lat))
        + struct.pack("<i", s32(lon))
        + struct.pack("<H", altitude_raw(alt))
        + struct.pack("<B", u8(hr))
        + struct.pack("<B", u8(cad))
    )


def build_activity_messages() -> bytes:
    t0 = fit_seconds(1714543200)  # 2024-05-01T06:00:00Z
    msgs = bytearray()

    # file_id (local 0)
    msgs += definition(0, MSG_FILE_ID, [(0, 1, BASE_ENUM), (1, 2, BASE_UINT16), (4, 4, BASE_UINT32)])
    msgs += data(0, struct.pack("<BHI", 4, 1, t0))

    # records (local 1)
    msgs += definition(1, MSG_RECORD, RECORD_DEF_FIELDS)
    records = [
        # (lat, lon, alt, hr, cad) — one pause record (no position) at idx 5
        (-37.950000, 145.100000, 42.0, 120, 82),
        (-37.949555, 145.100027, 42.4, 127, 83),
        (-37.949110, 145.100054, 42.8, 134, 84),
        (-37.948665, 145.100081, 43.2, 141, 85),
        (-37.948220, 145.100108, 43.6, 148, 86),
        (None, None, 43.8, 150, 86),  # pause: position invalid
        (-37.947775, 145.100135, 44.0, 155, 87),
        (-37.947330, 145.100162, 44.4, 162, 88),
    ]
    for i, (lat, lon, alt, hr, cad) in enumerate(records):
        msgs += data(1, record_payload(t0 + 3 * i, lat, lon, alt, hr, cad))

    # lap (local 2)
    msgs += definition(2, MSG_LAP, [(253, 4, BASE_UINT32), (2, 4, BASE_UINT32)])
    msgs += data(2, struct.pack("<II", t0 + 3 * len(records), t0))

    # session (local 3): timestamp, start_time, sport
    msgs += definition(3, MSG_SESSION, [(253, 4, BASE_UINT32), (2, 4, BASE_UINT32), (5, 1, BASE_ENUM)])
    msgs += data(3, struct.pack("<IIB", t0 + 3 * len(records), t0, 2))

    # activity (local 4)
    msgs += definition(4, MSG_ACTIVITY, [(253, 4, BASE_UINT32)])
    msgs += data(4, struct.pack("<I", t0 + 3 * len(records)))

    return bytes(msgs)


def build_compressed_messages() -> bytes:
    """12 records; #1 carries field 253, #2..12 ride compressed headers
    with 3 s offsets — the last wraps (offset 1 < low 4 → +32)."""
    t0 = fit_seconds(1714543200)
    msgs = bytearray()

    msgs += definition(0, MSG_FILE_ID, [(0, 1, BASE_ENUM), (1, 2, BASE_UINT16), (4, 4, BASE_UINT32)])
    msgs += data(0, struct.pack("<BHI", 4, 1, t0))

    msgs += definition(1, MSG_RECORD, RECORD_DEF_FIELDS)
    # Spec-faithful compressed records: a SLIM definition (local 3) without
    # the timestamp field — the compressed header carries the time.
    msgs += definition(3, MSG_RECORD, [f for f in RECORD_DEF_FIELDS if f[0] != 253])

    def point(i):
        return (
            -37.950000 + 0.000045 * i,
            145.100000 + 0.000027 * i,
            42.0 + 0.4 * i,
            120 + 7 * i if 120 + 7 * i <= 200 else 180,
            82 + i if 82 + i <= 95 else 95,
        )

    # Record 0: normal header with the full timestamp (local 1).
    lat, lon, alt, hr, cad = point(0)
    msgs += data(1, record_payload(t0, lat, lon, alt, hr, cad))
    # Records 1..11: compressed headers referencing the SLIM definition
    # (local 3 — no timestamp field, so the payload omits those bytes),
    # offsets 3,6,…,33 mod 32 — the last wraps (offset 1 < low 4 → +32).
    for i in range(1, 12):
        lat, lon, alt, hr, cad = point(i)
        offset = (3 * i) % 32
        slim = (
            struct.pack("<i", s32(lat))
            + struct.pack("<i", s32(lon))
            + struct.pack("<H", altitude_raw(alt))
            + struct.pack("<B", u8(hr))
            + struct.pack("<B", u8(cad))
        )
        msgs += compressed_data(3, offset, slim)

    msgs += definition(2, MSG_LAP, [(253, 4, BASE_UINT32), (2, 4, BASE_UINT32)])
    msgs += data(2, struct.pack("<II", t0 + 33, t0))
    return bytes(msgs)


def build_course_messages() -> bytes:
    t0 = fit_seconds(1718488200)  # 2024-06-15T22:30:00Z
    msgs = bytearray()

    msgs += definition(0, MSG_FILE_ID, [(0, 1, BASE_ENUM), (1, 2, BASE_UINT16), (4, 4, BASE_UINT32)])
    msgs += data(0, struct.pack("<BHI", 6, 1, t0))

    # course (local 1): name string
    name = "Hill Repeats".encode("utf-8")
    msgs += definition(1, MSG_COURSE, [(5, len(name) + 1, BASE_STRING)])
    msgs += data(1, name + b"\x00")

    # records (local 2): timestamp, lat, lon, altitude
    msgs += definition(2, MSG_RECORD, RECORD_DEF_FIELDS)
    points = [
        (47.356700, 8.553400, 412.0),
        (47.357150, 8.553750, 414.5),
        (47.357600, 8.554100, 417.0),
        (47.358050, 8.554450, 419.0),
        (47.358500, 8.554800, 420.5),
    ]
    for i, (lat, lon, alt) in enumerate(points):
        msgs += data(2, record_payload(t0 + 30 * i, lat, lon, alt, None, None))

    # course points (local 3): timestamp, lat, lon, name
    cp_names = ["Start & Café".encode("utf-8"), 'Summit "Uetliberg"'.encode("utf-8")]
    for i, cp_name in enumerate(cp_names):
        lat, lon, _ = points[i * 3]
        msgs += definition(
            3 + i,
            MSG_COURSE_POINT,
            [(1, 4, BASE_UINT32), (2, 4, BASE_SINT32), (3, 4, BASE_SINT32), (6, len(cp_name) + 1, BASE_STRING)],
        )
        msgs += data(
            3 + i,
            struct.pack("<Iii", t0 + 30 * i * 3, semicircles(lat), semicircles(lon)) + cp_name + b"\x00",
        )
    return bytes(msgs)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    fixtures = {
        "activity.fit": fit_file(build_activity_messages()),
        "activity-compressed.fit": fit_file(build_compressed_messages(), header_size=14),
        "course.fit": fit_file(build_course_messages()),
    }

    # truncated.fit: the activity message stream cut mid-record (record 6),
    # no CRC appended — the dataSize in the header still claims the full
    # length (part of the corruption the reader must disclose).
    full = build_activity_messages()
    # Records span bytes 47..183 (17 bytes each): cut inside record 6 so
    # exactly 5 records decode and the 6th reports the truncation.
    cut = 47 + 17 * 5 + 6
    fixtures["truncated.fit"] = fit_file(full[:cut], header_size=12)[: -2] + b"\x00\x00"
    # (re-append two junk bytes so the file has *a* trailing pair that is
    #  not the real CRC — CRC mismatch is one of the expected warnings)

    for name, blob in fixtures.items():
        path = OUT_DIR / name
        path.write_bytes(blob)
        digest = hashlib.sha256(blob).hexdigest()
        print(f"{name}  {len(blob):>6} bytes  sha256={digest}")


if __name__ == "__main__":
    main()
