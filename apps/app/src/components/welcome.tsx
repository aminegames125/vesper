import { useState } from "react";
import { useStore } from "../lib/store";
import type { Provider } from "../lib/types";
import { LogoMark } from "./logo";
import { addDemoSource, SourceForm } from "./source-form";
import { Button } from "./ui";

type Step = "hello" | "choose" | "form" | "done";
const ORDER: Step[] = ["hello", "choose", "form", "done"];

const CHOICES: { kind: Provider["kind"] | "demo"; title: string; hint: string }[] = [
  {
    kind: "xtream",
    title: "Xtream login",
    hint: "Server, username and password from your provider.",
  },
  { kind: "m3u", title: "Playlist link", hint: "An .m3u address you already have." },
  { kind: "demo", title: "Free public channels", hint: "Try Vesper right now with a public list." },
];

/**
 * First run. A full-screen two-part layout, nothing like the app itself: a calm brand side and
 * a short guided path on the other. It ends the moment a source loads.
 */
export function Welcome() {
  const finish = useStore((s) => s.finishOnboarding);
  const channels = useStore((s) => s.channels.length);
  const movies = useStore((s) => s.movies.length);
  const shows = useStore((s) => s.shows.length);
  const [step, setStep] = useState<Step>("hello");
  const [kind, setKind] = useState<Provider["kind"]>("xtream");
  const [busy, setBusy] = useState(false);
  const index = ORDER.indexOf(step);

  const pick = async (choice: (typeof CHOICES)[number]["kind"]) => {
    if (choice === "demo") {
      setBusy(true);
      await addDemoSource();
      setBusy(false);
      setStep("done");
      return;
    }
    setKind(choice);
    setStep("form");
  };

  return (
    <div className="scope-dark fixed inset-0 z-50 grid bg-ink text-paper md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-panel p-12 md:flex">
        <div
          aria-hidden
          className="absolute -bottom-40 -left-32 size-[34rem] rounded-full bg-accent/20 blur-3xl"
        />
        <LogoMark size={44} />
        <div className="relative">
          <h1 className="font-display text-7xl leading-[0.95] font-extrabold">Vesper</h1>
          <p className="mt-5 max-w-xs text-lg text-muted">
            A calm, fast player for the TV you already watch.
          </p>
        </div>
      </aside>

      <main className="flex flex-col justify-center px-8 py-10 md:px-20">
        <ol className="mb-12 flex gap-1.5" aria-label="Progress">
          {ORDER.map((s, i) => (
            <li
              key={s}
              className={`h-1 w-10 rounded-full transition-colors ${i <= index ? "bg-accent" : "bg-line"}`}
            />
          ))}
        </ol>

        {step === "hello" && (
          <section className="max-w-md">
            <h2 className="text-4xl font-bold">Let's get you watching.</h2>
            <p className="mt-4 text-muted">
              Vesper plays what you bring: an IPTV login or a playlist link. It takes about a
              minute.
            </p>
            <div className="mt-10 flex items-center gap-3">
              <Button variant="primary" className="px-7 py-3" onClick={() => setStep("choose")}>
                Start
              </Button>
              <Button variant="ghost" onClick={finish}>
                Skip for now
              </Button>
            </div>
          </section>
        )}

        {step === "choose" && (
          <section className="max-w-lg">
            <h2 className="text-3xl font-bold">Where do your channels come from?</h2>
            <ul className="mt-8 flex flex-col gap-2">
              {CHOICES.map((c) => (
                <li key={c.kind}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pick(c.kind)}
                    className="lift surface flex w-full flex-col px-5 py-4 text-left disabled:opacity-60"
                  >
                    <span className="font-semibold">{c.title}</span>
                    <span className="text-sm text-muted">{c.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="mt-6" onClick={() => setStep("hello")}>
              Back
            </Button>
          </section>
        )}

        {step === "form" && (
          <section className="max-w-md">
            <h2 className="text-3xl font-bold">
              {kind === "xtream" ? "Your Xtream login" : "Your playlist link"}
            </h2>
            <p className="mb-8 mt-2 text-sm text-muted">
              Stored on this device only. Vesper ships no channels.
            </p>
            <SourceForm kind={kind} submitLabel="Connect" onAdded={() => setStep("done")} />
            <Button variant="ghost" className="mt-6" onClick={() => setStep("choose")}>
              Back
            </Button>
          </section>
        )}

        {step === "done" && (
          <section className="max-w-md">
            <h2 className="text-4xl font-bold">You're set.</h2>
            <p className="mt-4 text-muted">
              {channels.toLocaleString()} channels · {movies.toLocaleString()} movies ·{" "}
              {shows.toLocaleString()} series
            </p>
            <Button variant="primary" className="mt-10 px-7 py-3" onClick={finish}>
              Start watching
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
