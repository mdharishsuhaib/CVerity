"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { User, api } from "@/lib/api";
import { useAuth } from "@/components/providers";
import { AuthShell, Notice } from "@/components/auth-fields";
import { Button } from "@/components/ui";

/** Opened from the email link. The token is in the URL fragment (#token=...), which browsers never send to servers. */
export default function Page() {
  const { login } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // React dev mode runs effects twice; a token can only be used once
    once.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    history.replaceState(null, "", window.location.pathname); // drop the token from the address bar and history
    if (!token) {
      setState("error");
      setMsg("This verification link is incomplete. Please open the link from your email again.");
      return;
    }
    api<{ user: User }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then((res) => {
        login(res.user);
        setUser(res.user);
        setState("done");
      })
      .catch((e) => {
        setState("error");
        setMsg(e.message);
      });
  }, [login]);

  if (state === "working") return <AuthShell title="Verifying your email..." sub="This takes a moment." />;
  if (state === "error") {
    return (
      <AuthShell title="Verification failed">
        <Notice>{msg}</Notice>
        <p className="text-sm text-muted">Log in to request a new verification link. <Link className="font-medium text-accent hover:underline" href="/login">Go to log in</Link></p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Email verified" sub="Your account is active.">
      <Notice tone="good">Thanks for confirming your email address. You're now logged in.</Notice>
      <Button className="justify-self-start" onClick={() => router.push(user?.role === "recruiter" ? "/recruiter" : "/seeker")}>Continue</Button>
    </AuthShell>
  );
}
