import { handleOAuthCallback } from "@/action/auth";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    console.log("Auth callback request received");

    const requestUrl = new URL(request.url);
    
    // Supabase uses different parameters for different flows:
    // - "code" for PKCE flows (email confirmation, OAuth)
    // - "token_hash" for older email confirmation flows
    // - "type" to indicate the flow type (signup, recovery, etc.)
    // - "provider" to indicate OAuth provider
    const code = requestUrl.searchParams.get("code");
    const tokenHash = requestUrl.searchParams.get("token_hash");
    const type = requestUrl.searchParams.get("type");
    const next = requestUrl.searchParams.get("next") ?? "/";
    const provider = requestUrl.searchParams.get("provider");
    
    console.log("Callback params:", { code, tokenHash, type, next, provider, url: requestUrl.toString() });

    // Check if we have either code or token_hash
    if (!code && !tokenHash) {
        console.error("Missing code or token_hash parameter");
        return NextResponse.redirect(
            new URL("/login?error=Missing%20authentication%20code", requestUrl.origin)
        );
    }

    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        );

        // ============================================
        // OAUTH AUTHENTICATION FLOW
        // ============================================
        if (provider) {
            console.log("Processing OAuth callback for provider:", provider);

            // Validate provider is one of the supported OAuth providers
            const supportedProviders = ["google", "github", "facebook", "twitter", "discord"];
            if (!supportedProviders.includes(provider)) {
                return NextResponse.redirect(
                    new URL("/login?error=unsupported_provider", requestUrl.origin)
                );
            }

            if (!code) {
                return NextResponse.redirect(
                    new URL("/login?error=missing_code", requestUrl.origin)
                );
            }

            // Exchange code for session
            const { error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
                console.error("OAuth authentication error:", error);
                return NextResponse.redirect(
                    new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
                );
            }

            // Handle OAuth-specific user creation/update in database
            const { error: handleOAuthCallbackError } = await handleOAuthCallback();
            if (handleOAuthCallbackError) {
                console.error("OAuth callback error:", handleOAuthCallbackError);
                return NextResponse.redirect(
                    new URL(`/login?error=${encodeURIComponent(handleOAuthCallbackError)}`, requestUrl.origin)
                );
            }

            // Successful OAuth authentication - redirect to next path
            const response = NextResponse.redirect(new URL(next, requestUrl.origin));
            
            // Optional: clear pending signup profile cookie
            try {
                response.cookies.delete("pending_profile");
            } catch { }

            return response;
        }

        // ============================================
        // EMAIL CONFIRMATION FLOW
        // ============================================
        console.log("Processing email confirmation callback");

        // Exchange code for session or verify OTP
        const { data, error } = code 
            ? await supabase.auth.exchangeCodeForSession(code)
            : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as any });

        console.log("Auth result:", { data, error });

        if (error) {
            console.error("Auth error:", error);
            return NextResponse.redirect(
                new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
            );
        }

        // Redirect to next path
        const response = NextResponse.redirect(new URL(next, requestUrl.origin));

        // Optional: clear pending signup profile cookie
        try {
            response.cookies.delete("pending_profile");
        } catch { }

        return response;
    } catch (error) {
        console.error("Unexpected auth callback error:", error);
        return NextResponse.redirect(
            new URL("/login?error=authentication_failed", requestUrl.origin)
        );
    }
}

