import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/echo/AppShell";
import { getProfile, putProfile } from "@/lib/db";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Create your local profile — Echo" },
      { name: "description", content: "Set up a local Echo profile. No account, no cloud sign-in." },
      { property: "og:title", content: "Create your local profile — Echo" },
      { property: "og:description", content: "Set up a local Echo profile. No account needed." },
    ],
  }),
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setName(p.name);
        setAvatar(p.avatar);
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    try {
      await putProfile({ name: name.trim(), createdAt: Date.now(), ...(avatar ? { avatar } : {}) });
      navigate({ to: "/home" });
    } catch {
      setError("Local storage is unavailable in this browser.");
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <AppShell nav={false}>
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-2xl font-semibold">Welcome to echo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a local profile. Everything stays on this device.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <label className="relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-surface-2">
            {avatar ? (
              <img src={avatar} alt="Your avatar" className="size-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">Add photo</span>
            )}
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <label className="mt-8 block text-xs text-muted-foreground" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mark"
          className="mt-2 w-full rounded-xl border border-input bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
        />
        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

        <button
          onClick={save}
          className="glow mt-8 w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground"
        >
          Continue
        </button>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Echo uses a local-first architecture. Learning history is stored on this device, while AI
          processing happens securely on the server.
        </p>
      </div>
    </AppShell>
  );
}
