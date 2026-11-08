import { Helmet } from 'react-helmet-async'

/**
 * Head for an app page that must stay out of search: the auth screens.
 *
 * They are served from the app shell, whose title is the homepage's, so
 * without this Google indexed /login as a second homepage with the same title.
 * noindex rather than a robots.txt Disallow: a blocked URL can still be
 * indexed from links, and every marketing page links /login and /signup.
 */
export default function NoIndexMeta({ title }: { title: string }) {
  return (
    <Helmet>
      <title>{`${title} — Vyostra AI`}</title>
      <meta name="robots" content="noindex" />
    </Helmet>
  )
}
