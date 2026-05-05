import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      {/*
        forceRedirectUrl wins over the deprecated `redirect_url` query param,
        which inside the Amplify SSR Lambda comes through as localhost:3000.
        Static path-only forms work cleanly behind any proxy.
      */}
      <SignIn forceRedirectUrl="/" signUpForceRedirectUrl="/" />
    </div>
  );
}
