import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic = pathname.startsWith('/login') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/taste') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')

  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    if (!isPublic) return NextResponse.redirect(new URL('/login', request.url))
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Portal users should only see their portal — redirect them away from staff pages
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, client_slug')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'portal' && profile?.client_slug) {
      return NextResponse.redirect(new URL(`/portal/${profile.client_slug}`, request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
