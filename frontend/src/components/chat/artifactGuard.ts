export function artifactGuardPrefix(): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none';">
<script>
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('a') : null;
  if (!el) return;
  var href = el.getAttribute('href') || '';
  if (href.startsWith('#')) return;
  e.preventDefault();
  parent.postMessage({ type: 'ARTIFACT_NAV_BLOCKED', href: href }, '*');
}, true);
</script>`;
}

export function injectArtifactGuard(html: string): string {
  const guard = artifactGuardPrefix();
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (open) => `${open}\n${guard}`);
  }
  return `${guard}\n${html}`;
}
