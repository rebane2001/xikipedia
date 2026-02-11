const SW_VERSION = '1.1.4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const filename = new URL(event.request.url).pathname.split("/").at(-1);
  if (filename == "clearHtml")
    return event.respondWith((async () => {
      await caches.delete("html");
      return new Response("cleared", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    })());
  if (filename == "swVer")
    return event.respondWith((()=>new Response(SW_VERSION, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }))());
  if (!["", "index.html", "app.webmanifest", "favicon.ico", "favicon-48.png", "favicon-256.png", "smoldata.json"].includes(filename))
    return;
  event.respondWith((async () => {
    const request = event.request;
    const cachedResponse = await caches.match(request);
    if (cachedResponse)
      return cachedResponse;
    const isSmolData = filename == "smoldata.json";
    // todo: delete after verifying the new one downloaded
    if (isSmolData)
      await caches.delete("smoldata");
    const cache = await caches.open(isSmolData ? "smoldata" : "html");
    try {
      const networkResponse = await fetch(request);
      if (isSmolData)
        progressMonitor(event.clientId, networkResponse.clone());
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    } catch (error) {
      return new Response("Network error happened", {
        status: 408,
        headers: { "Content-Type": "text/plain" },
      });
    }
  })());
});


// based on https://github.com/anthumchris/fetch-progress-indicators/blob/master/sw-basic/sw-simple.js
function progressMonitor(clientId, response) {
  if (!response.body) {
    console.warn("ReadableStream is not yet supported in this browser.  See https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream")
    return response;
  }
  if (!response.ok) {
    // HTTP error code response
    return response;
  }

  let loaded = 0;
  const reader = response.body.getReader();

  return new Response(
    new ReadableStream({
      start(controller) {        
        // get client to post message. Awaiting resolution first read() progress
        // is sent for progress indicator accuracy
        let client;
        clients.get(clientId).then(c => {
          client = c;
          read();
        });

        function read() {
          reader.read().then(({done, value}) => {
            if (done) {
              controller.close();
              return;
            }

            controller.enqueue(value);
            loaded += value.byteLength;
            client.postMessage({event:"downloadProgress",data:loaded})
            read();
          })
          .catch(error => {
            // error only typically occurs if network fails mid-download
            console.error('error in read()', error);
            controller.error(error);
          });
        }
      },

      // Firefox excutes this on page stop, Chrome does not
      cancel(reason) {
        console.log('cancel()', reason);
      }
    })
  )
}