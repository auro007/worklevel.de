import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});
import { AuthProvider } from "@/context/AuthProvider";
import { CompanyProvider } from "@/context/CompanyProvider";
import { AppDataProvider } from "@/context/AppDataProvider";
import AppShell from "@/components/AppShell";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import PhonePreviewToggle from "@/components/PhonePreviewToggle";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "WORKLEVEL",
  description: "Service- und Handwerkerverwaltung",
  applicationName: "WORKLEVEL",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WORKLEVEL"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  formatDetection: {
    telephone: false
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
    { media: "(prefers-color-scheme: light)", color: "#ff6a00" }
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={jakarta.className} data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("worklevel:phone-preview")==="1"){document.documentElement.classList.add("phone-preview");document.documentElement.classList.add("is-phone");}var t=localStorage.getItem("worklevel:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <CompanyProvider>
            <AppDataProvider>
              <ConfirmProvider>
                <AppShell>{children}</AppShell>
                <PhonePreviewToggle dock />
                <PwaRegister />
              </ConfirmProvider>
            </AppDataProvider>
          </CompanyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
