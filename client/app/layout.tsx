import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/titillium-web/400.css";
import "@fontsource/titillium-web/600.css";
import "@fontsource/titillium-web/700.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "F1 Live", template: "%s · F1 Live" },
  description: "Live Formula 1 timing, track map, race alerts, schedule, standings and replays.",
  applicationName: "F1 Live",
  appleWebApp: { capable: true, title: "F1 Live", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d10" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("f1live.settings")||"{}");if(s.theme&&s.theme!=="system")document.documentElement.setAttribute("data-theme",s.theme)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
