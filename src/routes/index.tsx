import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getProfile } from "@/lib/db";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Echo Mind — Understand. Remember. Achieve." },
      {
        name: "description",
        content:
          "Echo Mind is your AI companion for better learning: live captions, AI notes, summaries and smart reminders from real lectures.",
      },
      { property: "og:title", content: "Echo Mind — Understand. Remember. Achieve." },
      { property: "og:description", content: "Your AI companion for better learning and understanding." },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    getProfile().then((p) => setHasProfile(!!p)).catch(() => setHasProfile(false));
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-black px-8 text-center select-none">
      {/* Home Screen Logo Image - Circle Framed, Zoomed & Offset-Aligned */}
      <div className="relative mb-6 mt-10 flex size-64 items-center justify-center rounded-full overflow-hidden border-2 border-[#a3e635] shadow-[0_0_25px_rgba(163,230,53,0.45)] bg-black">
        <img
          src="/logo.png"
          alt="Echo Logo"
          className="size-full object-cover scale-[1.32] translate-y-[8px]"
        />
      </div>

      {/* Main Title "Echo" with first letter "E" in Lime Green */}
      <h1 className="text-[52px] font-semibold tracking-tight text-white mt-4">
        <span className="text-[#a3e635]">E</span>cho
      </h1>
      
      {/* Subtitle description matching target visual exactly */}
      <p className="mt-4 text-[17px] text-zinc-300 max-w-[17rem] leading-relaxed font-normal">
        Bridging the gap between hearing and understanding.
      </p>

      {/* Primary Pill Button in Lime Green */}
      <button
        onClick={() => navigate({ to: hasProfile ? "/home" : "/login" })}
        className="mt-14 flex w-full max-w-[18rem] items-center justify-center gap-3 rounded-full bg-[#a3e635] text-black font-semibold py-4 px-6 text-[18px] transition-all hover:brightness-110 shadow-[0_0_15px_rgba(163,230,53,0.3)]"
      >
        Get Started
        <ArrowRight className="size-5" />
      </button>

      {/* Onboarding Pagination indicators */}
      <div className="flex gap-2 mt-12">
        <span className="size-2 rounded-full bg-[#a3e635]" />
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="size-2 rounded-full bg-zinc-700" />
      </div>
    </div>
  );
}
