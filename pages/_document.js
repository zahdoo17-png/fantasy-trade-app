// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#0a1628" />
        <meta property="og:title" content="Fantasy Basketball Trade Analyzer" />
        <meta property="og:description" content="Real-time NBA stats with AI scouting reports. See if a trade is fair before you make it." />
        <meta property="og:type" content="website" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
