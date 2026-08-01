import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleButton } from "../components/GoogleButton";
import { Alert, Button, Field, Input } from "../components/ui";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  // Carried over from the landing page, so typing an address there isn't
  // work someone has to repeat.
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your booking page in a few minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-ink underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <GoogleButton label="Sign up with Google" />

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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {/* Say the rule up front rather than rejecting after submit. */}
        <p className="text-xs text-muted">At least 8 characters.</p>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
