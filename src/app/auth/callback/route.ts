import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { handleOAuthCallback } from '@/action/auth'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/brands'
  const origin = requestUrl.origin

  console.log('🟡 [Callback] OAuth callback received')
  console.log('🟡 [Callback] URL:', requestUrl.toString())
  console.log('🟡 [Callback] Code present:', !!code)
  console.log('🟡 [Callback] Next path:', next)

  if (code) {
    console.log('🟡 [Callback] Exchanging code for session...')
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch (error) {
              // Cookie setting can fail if headers are already sent
              console.error('❌ [Callback] Error setting cookies:', error)
            }
          },
        },
      }
    )
    
    // Exchange the code for a session
    const { error: exchangeError, data: sessionData } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('❌ [Callback] Error exchanging code for session:', exchangeError)
      return NextResponse.redirect(`${origin}/login?error=oauth_failed&message=${encodeURIComponent(exchangeError.message)}`)
    }

    console.log('✅ [Callback] Session created for user:', sessionData?.user?.email)
    console.log('🟡 [Callback] Handling OAuth callback (creating/updating user in DB)...')

    // Handle the OAuth callback (create/update user in database)
    const callbackResult = await handleOAuthCallback()
    
    if (callbackResult.error) {
      console.error('❌ [Callback] Error in OAuth callback:', callbackResult.error)
      return NextResponse.redirect(`${origin}/login?error=callback_failed&message=${encodeURIComponent(callbackResult.error)}`)
    }

    console.log('✅ [Callback] User created/updated successfully')
    console.log('🟡 [Callback] Redirecting to:', `${origin}${next}`)

    // Successful authentication - redirect to next page
    return NextResponse.redirect(`${origin}${next}`)
  }

  // No code present, redirect to login
  console.error('❌ [Callback] No code present in callback URL')
  return NextResponse.redirect(`${origin}/login?error=no_code`)
}

