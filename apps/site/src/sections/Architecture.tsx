import { useRef } from "react";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "../gsap";
import { Section, scheduleRefresh, Title, useMedia } from "../ui";

type N = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  t: string;
  s: string;
  hot?: boolean;
};

function layout(v: boolean) {
  const nodes: N[] = v
    ? [
        { id: "kodi", x: 40, y: 20, w: 280, h: 74, t: "Kodi + add-on", s: "Record with Vesper" },
        {
          id: "server",
          x: 40,
          y: 170,
          w: 280,
          h: 74,
          t: "Vesper server",
          s: "Rust, port 8484",
          hot: true,
        },
        { id: "prov", x: 40, y: 320, w: 280, h: 74, t: "Your IPTV provider", s: "Live stream" },
        {
          id: "disk",
          x: 40,
          y: 470,
          w: 280,
          h: 74,
          t: "Data folder",
          s: "index.m3u8 + .ts segments",
        },
      ]
    : [
        { id: "kodi", x: 20, y: 40, w: 250, h: 90, t: "Kodi + add-on", s: "Record with Vesper" },
        {
          id: "server",
          x: 375,
          y: 40,
          w: 250,
          h: 90,
          t: "Vesper server",
          s: "Rust, port 8484",
          hot: true,
        },
        { id: "prov", x: 730, y: 40, w: 250, h: 90, t: "Your IPTV provider", s: "Live stream" },
        {
          id: "disk",
          x: 375,
          y: 270,
          w: 250,
          h: 90,
          t: "Data folder",
          s: "index.m3u8 + .ts segments",
        },
      ];
  const c = (id: string, side: "r" | "l" | "b" | "t"): [number, number] => {
    const n = nodes.find((x) => x.id === id)!;
    return side === "r"
      ? [n.x + n.w, n.y + n.h / 2]
      : side === "l"
        ? [n.x, n.y + n.h / 2]
        : side === "b"
          ? [n.x + n.w / 2, n.y + n.h]
          : [n.x + n.w / 2, n.y];
  };
  const L = (a: [number, number], b: [number, number]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
  const paths = v
    ? [
        { id: "p1", d: L(c("kodi", "b"), c("server", "t")), label: "1  Record this" },
        { id: "p2", d: L(c("server", "b"), c("prov", "t")), label: "2  Pull the stream" },
        { id: "p3", d: L(c("prov", "b"), c("disk", "t")), label: "3  HLS in, segments out" },
        {
          id: "p4",
          d: `M${c("disk", "l")[0]} ${c("disk", "l")[1]} C 0 ${c("disk", "l")[1]} 0 ${c("kodi", "l")[1]} ${c("kodi", "l")[0]} ${c("kodi", "l")[1]}`,
          label: "4  Play, even while recording",
        },
      ]
    : [
        { id: "p1", d: L(c("kodi", "r"), c("server", "l")), label: "1  Record this" },
        { id: "p2", d: L(c("server", "r"), c("prov", "l")), label: "2  Pull the stream" },
        {
          id: "p3",
          d: `M${c("prov", "b")[0]} ${c("prov", "b")[1]} C ${c("prov", "b")[0]} 230 ${c("disk", "r")[0] + 120} ${c("disk", "r")[1]} ${c("disk", "r")[0]} ${c("disk", "r")[1]}`,
          label: "3  HLS in, segments out",
        },
        {
          id: "p4",
          d: `M${c("disk", "l")[0]} ${c("disk", "l")[1]} C ${c("kodi", "b")[0]} ${c("disk", "l")[1]} ${c("kodi", "b")[0]} 200 ${c("kodi", "b")[0]} ${c("kodi", "b")[1]}`,
          label: "4  Play, even while recording",
        },
      ];
  return { nodes, paths, vb: v ? "0 0 360 564" : "0 0 1000 400" };
}

const LEGEND = [
  [
    "Record this",
    "Kodi asks the server over HTTP. No login in lite mode, a username and password in full mode.",
  ],
  ["Pull the stream", "The server fetches the channel from your provider with its own connection."],
  [
    "HLS in, segments out",
    "It follows the playlist, appends each segment once and writes an index.m3u8 beside them.",
  ],
  [
    "Play, even while recording",
    "Kodi plays the same HLS folder. Where you stop is saved on the server.",
  ],
];

export default function Architecture() {
  const root = useRef<HTMLDivElement>(null);
  const vertical = useMedia("(max-width: 760px)");
  const { nodes, paths, vb } = layout(vertical);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const dots = gsap.utils.toArray<SVGCircleElement>(".flow-dot", el);
        const lines = gsap.utils.toArray<SVGPathElement>(".flow-line", el);
        const items = gsap.utils.toArray<HTMLElement>(".legend li", el);
        const nodeEls = gsap.utils.toArray<SVGGElement>(".node", el);
        gsap.from(nodeEls, {
          opacity: 0,
          y: 16,
          stagger: 0.12,
          duration: 0.8,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 75%", once: true },
        });
        const tl = gsap.timeline({ repeat: -1, paused: true });
        lines.forEach((ln, i) => {
          const dot = dots[i];
          if (!dot) return;
          const len = ln.getTotalLength();
          const o = { p: 0 };
          const at = i * 1.5;
          tl.set(dot, { opacity: 1 }, at);
          tl.to(
            o,
            {
              p: 1,
              duration: 1.3,
              ease: "power1.inOut",
              onUpdate: () => {
                const pt = ln.getPointAtLength(o.p * len);
                dot.setAttribute("cx", String(pt.x));
                dot.setAttribute("cy", String(pt.y));
              },
            },
            at,
          );
          tl.fromTo(
            ln,
            { strokeDashoffset: len },
            { strokeDashoffset: 0, duration: 1.3, ease: "power1.inOut" },
            at,
          );
          tl.to(dot, { opacity: 0, duration: 0.15 }, at + 1.3);
          tl.fromTo(items[i] ?? [], { opacity: 0.4 }, { opacity: 1, duration: 0.2 }, at);
          tl.to(items[i] ?? [], { opacity: 0.4, duration: 0.2 }, at + 1.35);
        });
        tl.to({}, { duration: 1 });
        gsap.set(lines, { strokeDasharray: (i: number) => lines[i]!.getTotalLength() });
        gsap.set(dots, { opacity: 0 });
        const st = ScrollTriggerPlay(el, tl);
        return () => {
          st.kill();
          tl.kill();
        };
      });
      scheduleRefresh();
      return () => mm.revert();
    },
    { scope: root, dependencies: [vertical], revertOnUpdate: true },
  );

  return (
    <Section id="architecture" labelledBy="arch-title" className="sheet-c">
      <div className="wrap" ref={root}>
        <div className="sec-head">
          <Title id="arch-title">Four hops. Nothing runs in your living room but Kodi.</Title>
        </div>
        <div className="arch">
          <svg
            viewBox={vb}
            className="arch-svg"
            role="img"
            aria-label="Diagram: Kodi sends a record request to the Vesper server, which pulls the stream from your IPTV provider and writes HLS segments to its data folder. Kodi plays them back."
          >
            <defs>
              <marker
                id="arr"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {paths.map((p) => (
              <g key={p.id} className="edge">
                <path d={p.d} className="base-line" markerEnd="url(#arr)" />
                <path d={p.d} className="flow-line" />
                <circle className="flow-dot" r="6" cx="0" cy="0" />
              </g>
            ))}
            {nodes.map((n) => (
              <g key={n.id} className={`node ${n.hot ? "hot" : ""}`}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="14" />
                <text x={n.x + 18} y={n.y + n.h / 2 - 4} className="nt">
                  {n.t}
                </text>
                <text x={n.x + 18} y={n.y + n.h / 2 + 18} className="ns">
                  {n.s}
                </text>
              </g>
            ))}
          </svg>
          <ol className="legend">
            {LEGEND.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}

function ScrollTriggerPlay(trigger: Element, tl: gsap.core.Timeline) {
  return ScrollTrigger.create({
    trigger,
    start: "top 80%",
    end: "bottom 10%",
    onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
  });
}
