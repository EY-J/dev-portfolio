"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  login,
  type LoginActionState,
} from "@/features/cms/auth/actions";

const initialState: LoginActionState = {
  success: false,
  error: null,
};

export default function LoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(login, initialState);

  useEffect(() => {
    if (state.success) {
      router.replace("/admin/dashboard");
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          disabled={pending}
          id="email"
          name="email"
          required
          type="email"
        />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          disabled={pending}
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {state.error ? (
        <p aria-live="polite" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
