// Sovereign Vault launch-notification handler.
//
// Runs on Cloudflare Pages Functions. Requires one KV namespace bound as
// NOTIFY_LIST (see the setup steps supplied with this file).
//
// Deliberate choices, so nobody has to reconstruct them later:
//   - Stores the email address and a timestamp. Nothing else. No IP address,
//     no user agent, no referrer. A company whose position is that it holds
//     nothing should not quietly hold a location log.
//   - No third-party form service. The address never leaves infrastructure
//     Barca Labs controls.
//   - No JavaScript on the page. This handler returns complete HTML for every
//     outcome, so the form works with scripting disabled.

const CSS = `
:root{--ink:#0a0b0d;--surface:#14161a;--line:#22262c;--muted:#828994;
--secondary:#b6bcc4;--text:#f2efe9;--accent:#d8b47a;
--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--text);font-family:var(--sans);
font-size:16px;line-height:1.68;-webkit-font-smoothing:antialiased}
.wrap{max-width:600px;margin:0 auto;padding:0 28px}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(216,180,122,.3)}
a:hover{border-bottom-color:var(--accent)}
.site{display:flex;align-items:center;padding:38px 0 0}
.wordmark{display:inline-flex;flex-direction:column;align-items:flex-start;gap:10px;border-bottom:none}
.wordmark .rule{width:40px;height:1px;background:var(--accent)}
.wordmark .name{font-size:14px;font-weight:500;letter-spacing:.19em;text-transform:uppercase;color:var(--text)}
main{padding:76px 0 0}
h1{font-size:32px;line-height:1.22;font-weight:600;letter-spacing:-.018em;margin:0 0 24px;max-width:18ch}
p{margin:0 0 20px;color:var(--secondary)}
.fine{font-size:14.5px;color:var(--muted);margin:34px 0 0}
footer{margin-top:64px;padding:30px 0 76px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
footer p{color:var(--muted);font-size:13.5px;margin:0 0 10px}
@media (max-width:640px){h1{font-size:26px;max-width:none}main{padding-top:52px}.site{padding-top:30px}}
`;

const ICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  "<rect width='64' height='64' fill='%230a0b0d'/><g stroke='%23d8b47a' stroke-width='9' fill='none'>" +
  "<path d='M37 11 L53 27'/><path d='M53 37 L37 53'/><path d='M27 53 L11 37'/><path d='M11 27 L27 11'/></g></svg>";

function page(title, heading, body, status) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Sovereign Vault</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${ICON}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <a class="wordmark" href="/"><span class="rule"></span><span class="name">Barca Labs</span></a>
  </header>
  <main>
    <h1>${heading}</h1>
    ${body}
  </main>
  <footer>
    <p><a href="/sovereign-vault">Sovereign Vault</a> · <a href="/security">Security</a> ·
    <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms</a> ·
    <a href="/support">Support</a></p>
    <p>© 2026 Barca Labs, LLC</p>
  </footer>
</div>
</body>
</html>`;
  return new Response(html, {
    status: status || 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

const BACK = '<p class="fine"><a href="/notify">Back to the form</a></p>';

// Intentionally permissive. The address either reaches a person or it doesn't,
// and a clever pattern that rejects a real address is worse than a loose one
// that accepts a typo.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return page(
      "Something went wrong",
      "That didn't go through.",
      "<p>Nothing was saved. Give it another go in a moment.</p>" + BACK,
      400
    );
  }

  // Honeypot. Real people never fill this in; bots fill in everything.
  // Report success rather than rejection — a bot told it failed simply retries.
  if ((form.get("company") || "").toString().trim() !== "") {
    return page(
      "You're in",
      "You're in.",
      "<p>We'll email you the day it lands.</p>"
    );
  }

  const email = (form.get("email") || "").toString().trim().toLowerCase();

  if (!email || email.length > 254 || !LOOKS_LIKE_EMAIL.test(email)) {
    return page(
      "Check that address",
      "That doesn't look like an email address.",
      "<p>Have another look — nothing was saved.</p>" + BACK,
      400
    );
  }

  if (!env.NOTIFY_LIST) {
    return page(
      "Something went wrong",
      "That didn't go through.",
      "<p>Nothing was saved. Give it another go in a moment.</p>" + BACK,
      500
    );
  }

  const key = "email:" + email;

  try {
    const existing = await env.NOTIFY_LIST.get(key);
    if (existing) {
      return page(
        "Already in",
        "You're already in.",
        "<p>Nothing more to do. We'll email you the day it lands.</p>"
      );
    }

    await env.NOTIFY_LIST.put(
      key,
      JSON.stringify({ email, added: new Date().toISOString() })
    );
  } catch {
    return page(
      "Something went wrong",
      "That didn't go through.",
      "<p>Nothing was saved. Give it another go in a moment.</p>" + BACK,
      500
    );
  }

  return page(
    "You're in",
    "You're in.",
    "<p>We'll email you the day it lands, and not before.</p>"
  );
}

// Anyone who lands on /api/notify directly gets sent to the form.
export async function onRequestGet() {
  return Response.redirect("https://barcalabs.com/notify", 302);
}
