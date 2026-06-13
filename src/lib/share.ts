export interface ShareNetworkLinks {
  x: string;
  facebook: string;
  whatsapp: string;
  pinterest: string;
}

// Default caption for a cooked dish.
export function cookCaption(title: string): string {
  return `I made ${title} 🍳`;
}

// The URL to include in a share: the public recipe link when public is on,
// otherwise the site homepage.
export function shareUrl(publicOn: boolean, token: string | null, origin: string): string {
  return publicOn && token ? `${origin}/r/${token}` : `${origin}/`;
}

// Pre-filled share URLs for desktop networks (the image comes from the page's
// Open Graph tags, except Pinterest which takes an explicit media URL).
export function networkShareLinks(url: string, text: string, imageUrl?: string): ShareNetworkLinks {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const media = imageUrl ? `&media=${encodeURIComponent(imageUrl)}` : '';
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${u}&description=${t}${media}`,
  };
}

// Whether the browser can share this file via the native share sheet.
export function canShareFiles(file: File): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] });
}
