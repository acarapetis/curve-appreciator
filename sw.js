self.addEventListener('install', e => e.waitUntil(
    caches.open('curve-appreciator').then(cache => cache.addAll([
        './',
        './index.html',
        './main.js',
        './capture.js',
        './manifest.json',
        './logo144.png',
        'https://cdnjs.cloudflare.com/ajax/libs/acorn/6.2.0/acorn.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.2/paper-full.js',
        'https://cdn.jsdelivr.net/gh/spite/ccapture.js@v1.0.9/build/CCapture.all.min.js',
        'https://d3js.org/d3-array.v2.min.js',
    ]))
))

self.addEventListener('fetch', e => e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
))
