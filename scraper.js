// scraper.js
// Responsible for fetching an Instagram post page and extracting media URL(s)
import fetch from 'node-fetch';
import cheerio from 'cheerio';

export async function extractMediaFromInstagramPage(postUrl, userAgent) {
  // Use a friendly UA by default
  const UA = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

  // Append a query to try to force non-JS server HTML (not guaranteed)
  const fetchUrl = postUrl;

  const resp = await fetch(fetchUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!resp.ok) return null;
  const text = await resp.text();
  const $ = cheerio.load(text);

  // 1) try open graph tag: og:video
  const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[name="og:video"]').attr('content');
  if (ogVideo) return ogVideo;

  // 2) try og:image (sometimes videos provide a poster only)
  const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');

  // 3) Instagram often embeds a JSON object inside <script type="application/ld+json"> or window._sharedData
  // Try to find window._sharedData or application/ld+json
  const scripts = $('script');
  let found = null;
  scripts.each((i, el) => {
    const html = $(el).html() || '';
    if (html.includes('window._sharedData')) {
      const m = html.match(/window\._sharedData\s*=\s*(\{.*\});/s);
      if (m && m[1]) {
        try {
          const data = JSON.parse(m[1]);
          // navigate the JSON to find video_url or display_url
          const media = findMediaInSharedData(data);
          if (media) found = media;
        } catch (e) {
          // ignore json parse errors
        }
      }
    }
    if (!found && $(el).attr('type') === 'application/ld+json') {
      try {
        const j = JSON.parse(html);
        // LD+JSON for videos may contain contentUrl
        if (j && j.contentUrl) found = j.contentUrl;
      } catch (e) {}
    }
  });

  if (found) return found;

  // Fallback: sometimes there are <video> tags
  const videoSrc = $('video').attr('src');
  if (videoSrc) return videoSrc;

  // Last resort: return og:image (still useful to show preview)
  return ogImage || null;
}

function findMediaInSharedData(data) {
  try {
    // This tries to locate common fields; Instagram's structure changes frequently,
    // so this is best-effort and brittle.
    const entry = data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
    if (entry) {
      // For videos
      if (entry.is_video && entry.video_url) return entry.video_url;
      // For carousel
      if (entry.edge_sidecar_to_children && entry.edge_sidecar_to_children.edges) {
        const edges = entry.edge_sidecar_to_children.edges;
        // return first video or image
        for (const e of edges) {
          const n = e.node;
          if (n.is_video && n.video_url) return n.video_url;
          if (n.display_url) return n.display_url;
        }
      }
      // fallback display resources
      if (entry.display_resources && entry.display_resources.length) return entry.display_resources.pop().src;
    }
  } catch (e) {
    // ignore
  }
  return null;
}
