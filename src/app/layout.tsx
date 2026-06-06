import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import React from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "XML Sitemap Generator - Free SEO Sitemap & Image Crawler",
    template: "%s | XML Sitemap Generator",
  },
  description:
    "Generate comprehensive, SEO-optimized XML sitemaps for your website with real-time tracking, intelligent crawling, and automatic sitemap discovery.",
  metadataBase: new URL("https://xml-sitemap-generator.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "XML Sitemap Generator - Free SEO Sitemap & Image Crawler",
    description:
      "Generate comprehensive, SEO-optimized XML sitemaps for your website with real-time tracking, intelligent crawling, and automatic sitemap discovery.",
    url: "https://xml-sitemap-generator.vercel.app",
    siteName: "XML Sitemap Generator",
    images: [
      {
        url: "/icon.svg",
        width: 512,
        height: 512,
        alt: "XML Sitemap Generator Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@atharvdangedev",
    creator: "@atharvdangedev",
    title: "XML Sitemap Generator - Free SEO Sitemap & Image Crawler",
    description:
      "Generate comprehensive, SEO-optimized XML sitemaps for your website with real-time tracking, intelligent crawling, and automatic sitemap discovery.",
    images: ["/icon.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
