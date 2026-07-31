import type { Metadata, Viewport } from 'next';
import { Barlow, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { AppProviders } from '@/components/app-providers';
import { ErrorReporter } from '@/components/error-reporter';
import type { Lang, Theme } from '@/lib/types';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin', 'latin-ext'], // latin-ext carries ı, İ, ş, ğ, ö, ü, ç
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const geistMono = Geist_Mono({
  // latin-ext is not optional here either: site names, usernames and log lines
  // all render in the mono face, and without it "İzmir LM6" loses its dotted İ
  // to a fallback font.
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DigitalTwin Console',
  description: 'Netlog DigitalTwin — authentication and administration console.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Dark is the product default; the cookie below overrides it per visitor.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#f0f0f0' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendering theme and language from the cookie server-side is what keeps the
  // first paint from flashing the wrong theme, and what makes the `lang`
  // attribute correct before any JavaScript runs.
  const jar = await cookies();
  const theme: Theme = jar.get('digitaltwin_theme')?.value === 'light' ? 'light' : 'dark';
  const lang: Lang = jar.get('digitaltwin_lang')?.value === 'tr' ? 'tr' : 'en';

  return (
    <html lang={lang} data-dt-theme={theme} className={`${barlow.variable} ${geistMono.variable}`}>
      <body className="bg-shell text-fg">
        <AppProviders initialTheme={theme} initialLang={lang}>
          {/* Mounted at the root so an error on any screen — including the auth
              flows — reaches the diagnostics log. */}
          <ErrorReporter />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
