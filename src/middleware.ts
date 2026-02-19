import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // TODO: Add real session check once NextAuth is fully configured with DB
    // For now, allow access to dashboard routes for UI development

    // Example logic:
    // const token = request.cookies.get('next-auth.session-token')
    // if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    //   return NextResponse.redirect(new URL('/auth/login', request.url))
    // }

    return NextResponse.next()
}

export const config = {
    matcher: '/dashboard/:path*',
}
