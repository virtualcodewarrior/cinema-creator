import { NextResponse } from 'next/server';

const SELF_HOSTED = process.env.NEXT_PUBLIC_SELF_HOSTED === '1';
const DENO_BACKEND_URL = process.env.DENO_BACKEND_URL || 'http://localhost:8000';

function addSecurityHeaders(response) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // CSP: allow connections to Deno backend (self-hosted)
    const connectSrc = SELF_HOSTED ? `'self' ${DENO_BACKEND_URL}` : `'self'`;
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src ${connectSrc}; font-src 'self' data:`
    );
    return response;
}

export function middleware(request) {
    const url = request.nextUrl;

    // In self-hosted mode, proxy /api/v1/* to Deno backend
    if (SELF_HOSTED) {
        if (url.pathname.startsWith('/api/v1')) {
            const targetUrl = new URL(url.pathname + url.search, DENO_BACKEND_URL);
            const proxyResponse = NextResponse.rewrite(targetUrl);
            return addSecurityHeaders(proxyResponse);
        }
        return addSecurityHeaders(NextResponse.next());
    }

    return addSecurityHeaders(NextResponse.next());
}

export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};
