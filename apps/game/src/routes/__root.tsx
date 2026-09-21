import type { ReactNode } from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'black-translucent',
      },
      {
        name: 'description',
        content: 'World Drive — open-world driving game powered by real OpenStreetMap data',
      },
      {
        title: 'World Drive',
      },
    ],
    links: [
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Orbitron:wght@400;700;900&display=swap',
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100dvh',
        gap: 12,
        background: '#000',
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 48,
          fontWeight: 900,
          letterSpacing: 2,
        }}
      >
        404
      </div>
      <p style={{ opacity: 0.7 }}>This road leads nowhere.</p>
      <Link
        to="/"
        style={{
          marginTop: 8,
          padding: '10px 20px',
          borderRadius: 8,
          background: '#fff',
          color: '#000',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Back to the road
      </Link>
    </div>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <style>{`
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-tap-highlight-color: transparent;
          }
          :root {
            --sat: env(safe-area-inset-top, 0px);
            --sar: env(safe-area-inset-right, 0px);
            --sab: env(safe-area-inset-bottom, 0px);
            --sal: env(safe-area-inset-left, 0px);
          }
          html, body {
            width: 100%;
            height: 100%;
            height: 100dvh;
            overflow: hidden;
            position: fixed;
            inset: 0;
            background: #000;
            font-family: 'Inter', sans-serif;
            touch-action: none;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
          }
          canvas {
            display: block;
            touch-action: none;
          }
        `}</style>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
