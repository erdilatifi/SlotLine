import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleButton } from "../components/GoogleButton";
import { Alert, Button, Field, Input } from "../components/ui";
import { useAuth } from "../lib/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "google" ? "Google sign-in didn't complete. Try again." : null,
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      setError("That email and password don't match an account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage your bookings."
      footer={
        <>
          No account?{" "}
          <Link to="/register" className="font-medium text-ink underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <GoogleButton label="Continue with Google" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
