const SW_VERSION = '1.1.3';

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
        return event.respondWith((() => new Response(SW_VERSION, {
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
            if (isSmolData) {
                const monitoredResponse = progressMonitor(event.clientId, networkResponse.clone());
                await cache.put(request, monitoredResponse.clone());
                return monitoredResponse;  // Return the monitored response, not the original
            } else {
                await cache.put(request, networkResponse.clone());
                return networkResponse;
            }
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
        console.warn("ReadableStream is not yet supported in this browser. See https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream")
        return response;
    }
    if (!response.ok) {
        return response;
    }

    let loaded = 0;
    const reader = response.body.getReader();

    return new Response(
        new ReadableStream({
            async start(controller) {
                try {
                    const client = await clients.get(clientId);
                    if (!client) {
                        console.warn(`Client ${clientId} not found, streaming without progress`);
                    }
                    await read(client, controller);
                } catch (error) {
                    console.error('Error in start()', error);
                    controller.error(error);
                }
            },
            cancel(reason) {
                console.log('cancel()', reason);
            }
        })
    );

    async function read(client, controller) {
        try {
            const { done, value } = await reader.read();
            if (done) {
                controller.close();
                return;
            }
            controller.enqueue(value);
            loaded += value.byteLength;
            if (client) {
                client.postMessage({ event: "downloadProgress", data: loaded });
            }
            await read(client, controller);
        } catch (error) {
            console.error('error in read()', error);
            controller.error(error);
        }
    }
}