import { SignIn } from "@clerk/nextjs";

// All redirect URLs are configured on <ClerkProvider> in layout.tsx.
export default function SignInPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignIn />
    </div>
  );
}
