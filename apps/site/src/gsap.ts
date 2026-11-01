import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// Keep animations on the clock, so a busy or throttled tab does not stretch them.
gsap.ticker.lagSmoothing(0);

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
export { gsap, ScrollTrigger, SplitText, useGSAP };
