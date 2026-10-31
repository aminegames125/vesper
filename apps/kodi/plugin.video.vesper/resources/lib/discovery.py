"""Finds Vesper servers on the local network with a single mDNS question (`_vesper._tcp.local.`).

Written with the standard library only, because Kodi's Python has no zeroconf package. Nothing
leaves the local network: the question goes to the multicast group 224.0.0.251.
"""

import socket
import struct
import time

SERVICE = "_vesper._tcp.local"
GROUP = ("224.0.0.251", 5353)

TYPE_A, TYPE_PTR, TYPE_TXT, TYPE_SRV = 1, 12, 16, 33


def build_query(name=SERVICE):
    header = struct.pack(">HHHHHH", 0, 0, 1, 0, 0, 0)
    labels = b"".join(bytes([len(p)]) + p.encode() for p in name.split("."))
    return header + labels + b"\x00" + struct.pack(">HH", TYPE_PTR, 1)


def read_name(data, pos):
    """Reads a DNS name that may use compression pointers; returns the name and the next offset."""
    labels, jumped, end = [], False, pos
    for _ in range(64):
        if pos >= len(data):
            break
        length = data[pos]
        if length == 0:
            pos += 1
            break
        if length & 0xC0 == 0xC0:
            pointer = ((length & 0x3F) << 8) | data[pos + 1]
            if not jumped:
                end = pos + 2
            pos, jumped = pointer, True
            continue
        labels.append(data[pos + 1 : pos + 1 + length].decode("utf-8", "replace"))
        pos += 1 + length
    if not jumped:
        end = pos
    return ".".join(labels), end


def parse(data):
    """Returns a list of `(type, name, value)` for every record in a DNS message."""
    if len(data) < 12:
        return []
    _, _, questions, answers, authority, extra = struct.unpack(">HHHHHH", data[:12])
    pos = 12
    for _ in range(questions):
        _, pos = read_name(data, pos)
        pos += 4
    found = []
    for _ in range(answers + authority + extra):
        if pos >= len(data):
            break
        name, pos = read_name(data, pos)
        if pos + 10 > len(data):
            break
        rtype, _, _, length = struct.unpack(">HHIH", data[pos : pos + 10])
        pos += 10
        body = data[pos : pos + length]
        if rtype == TYPE_PTR:
            found.append((rtype, name, read_name(data, pos)[0]))
        elif rtype == TYPE_SRV and length >= 6:
            port = struct.unpack(">H", body[4:6])[0]
            found.append((rtype, name, (port, read_name(data, pos + 6)[0])))
        elif rtype == TYPE_A and length == 4:
            found.append((rtype, name, socket.inet_ntoa(body)))
        elif rtype == TYPE_TXT:
            props, i = {}, 0
            while i < len(body):
                size = body[i]
                item = body[i + 1 : i + 1 + size].decode("utf-8", "replace")
                key, _, value = item.partition("=")
                props[key] = value
                i += 1 + size
            found.append((rtype, name, props))
        pos += length
    return found


def servers_in(records):
    """Joins the PTR, SRV, A and TXT records of replies into `{name, address, mode}` entries."""
    srv = {n: v for t, n, v in records if t == TYPE_SRV}
    addrs = {n: v for t, n, v in records if t == TYPE_A}
    txt = {n: v for t, n, v in records if t == TYPE_TXT}
    out = []
    for t, name, instance in records:
        if t != TYPE_PTR or not name.lower().startswith(SERVICE):
            continue
        if instance not in srv:
            continue
        port, host = srv[instance]
        ip = addrs.get(host)
        if not ip:
            continue
        label = instance.split("." + SERVICE)[0]
        out.append(
            {
                "name": label,
                "address": "http://%s:%d" % (ip, port),
                "mode": txt.get(instance, {}).get("mode", ""),
            }
        )
    return out


def discover(wait=2.5):
    """Asks the network and listens for `wait` seconds. Returns a list of servers (maybe empty)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    records = []
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
        sock.bind(("", 0))
        sock.settimeout(0.4)
        query = build_query()
        deadline = time.time() + wait
        sent = 0.0
        while time.time() < deadline:
            if time.time() - sent > 1.0:
                try:
                    sock.sendto(query, GROUP)
                except OSError:
                    pass
                sent = time.time()
            try:
                data, _ = sock.recvfrom(9000)
            except socket.timeout:
                continue
            except OSError:
                break
            records.extend(parse(data))
    except OSError:
        pass
    finally:
        sock.close()
    seen, unique = set(), []
    for server in servers_in(records):
        if server["address"] not in seen:
            seen.add(server["address"])
            unique.append(server)
    return unique
