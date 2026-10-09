import '@kit/kit.css';

// Every toy folder's index.html is read at build time; its <title> and
// meta description become the gallery entry. Nothing to maintain by hand.
const pages = import.meta.glob('./*/index.html', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const list = document.getElementById('list')!;
for (const [path, html] of Object.entries(pages).sort()) {
  const slug = path.split('/')[1]!;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.title || slug;
  const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = `./${slug}/`;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = title;
  const d = document.createElement('span');
  d.className = 'd';
  d.textContent = desc;
  a.append(t, d);
  li.append(a);
  list.append(li);
}
