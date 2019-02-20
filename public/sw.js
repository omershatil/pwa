importScripts('/src/js/idb.js');
importScripts('/src/js/utility.js');

var CACHE_STATIC_NAME = 'static-v55';
var CACHE_DYNAMIC_NAME = 'dynamic-v5';

var STATIC_FILES = [
	'/',
	'index.html',
	'offline.html',
	'/src/js/app.js',
	'/src/js/feed.js',
	'/src/js/idb.js',
	'/src/js/promise.js',
	'/src/js/fetch.js',
	'/src/js/material.min.js',
	'/src/css/app.css',
	'/src/css/feed.css',
	'/src/images/main-image.jpg',
	'https://fonts.googleapis.com/css?family=Roboto:400,700',
	'https://fonts.googleapis.com/icon?family=Material+Icons',
	'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css'
];
function trimCache(cacheName, maxItems) {
	let cache;
	caches.open(cacheName)
		.then(function(selectedCache) {
			cache = selectedCache;
			return selectedCache.keys();
		})
		.then(function(keys) {
			if (keys.length > maxItems) {
				cache.delete(keys[0])
					.then(trimCache(cacheName, maxItems));
			}
		})
}
self.addEventListener('install', function(event) {
	console.log('[SW] Installing Service Worker', event);
	event.waitUntil(
		caches.open(CACHE_STATIC_NAME)
			.then(function(cache) {
				console.log('[SW] Precaching App Shell');
				cache.addAll(STATIC_FILES);
			})
	);
});
self.addEventListener('activate', function(event) {
	console.log('[SW] Activating Service Worker', event);
	event.waitUntil(
		caches.keys()
			.then(function(keyList) {
				return Promise.all(keyList.map(function(key) {
					if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
						console.log('[SW] Removing old cache.', key);
						return caches.delete(key);
					}
				}));
			})
	);
	return self.clients.claim();
});
function isInArray(string, array) {
	var cachePath;
	if (string.indexOf(self.origin) === 0) {
		console.log('matched ', string);
		cachePath = string.substring(self.origin.length);
	} else {
		cachePath = string;
	}
	return array.indexOf(cachePath) > -1;
}
self.addEventListener('fetch', function(event) {
	const url = 'https://pwagram-f6ae9.firebaseio.com/posts.json';
	if (event.request.url.indexOf(url) > -1) {
		// CACHE-THEN-NETWORK
		event.respondWith(fetch(event.request)
				.then(function(res) {
					var clonedRes = res.clone();
					clearAllData('posts')
						.then(function () {
							return clonedRes.json()
						})
						.then(function (data) {
							for (var key in data) {
								writeData('posts', data[key]);
							}
						});
					return res;
				})
		)
	}
	else if(isInArray(event.request.url, STATIC_FILES)) {
		// CACHE-ONLY
		event.respondWith(caches.match(event.request));
	}
	else {
		// CACHE-WITH-NETWORK-FALLBACK
		event.respondWith(
			caches.match(event.request)
				.then(function(response) {
					return response ||
						fetch(event.request)
							.then(function(res) {
								return caches.open(CACHE_DYNAMIC_NAME)
									.then(function(cache) {
										cache.put(event.request.url, res.clone());
										return res;
									})
							})
							.catch(function(err) {
								return caches.open(CACHE_STATIC_NAME)
									.then(function(cache) {
										if (event.request.headers.get('accept').includes('text/html')) {
											return cache.match('/offline.html');
										}
									});
							});
				})
		);
	}
});

// here, instead of calling the server directly, we'll call the API we deployed
// note that the url has a path of storePostData, which is how we named the function in the 'functions/index.js' file.
// var url = 'https://pwagram-f6ae9.firebaseio.com/posts.json';
var url = 'https://us-central1-pwagram-f6ae9.cloudfunctions.net/storePostData';
self.addEventListener('sync', function (event) {
	console.log('[SW] Background syncing', event);
	if (event.tag === 'sync-new-posts') {
		console.log('[SW] Syncing new posts');
		return event.waitUntil(
			readAllData('sync-posts')
				.then(function (data) {
					for (var dt of data) {
						fetch(url, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'Accept': 'application/json',
							},
							body: JSON.stringify({
								id: dt.id,
								title: dt.title,
								location: dt.location,
								image: dt.image
							})
						})
							.then(function (res) {
								console.log('Sent data', res);
								if (res.ok) {
									res.json()
										.then(function (resData) {

											// we know that there's data id field here b/c we return it in storePostData()
											deleteItemFromData('sync-posts', resData.id);
										});
								}
							})
							.catch(function (err) {
								console.log('[SW] Error while sending data', err);
								throw(err);
							})
					}
				})
		);
	}
});
// reactions to notifications, like clicking on the action buttons, is done in the system, not in the browser. so,
// we can only act on it from a SW, even if the app/browser is closed!!
self.addEventListener('notificationclick', function (event) {
	var notification = event.notification;
	var action = event.action;
	console.log(notification);
	if (action === 'confirm') {
		console.log('Confirm was chosen');
		// closing may happen automatically on some devices, but, on Android, for example, it stays in the top bar
		notification.close();
	} else {
		// navigate to one of our app pages on notification user action!
		console.log('action is: ', action);
		event.waitUntil(
			// 'clients' refers to all browser tasks related to this worker
			clients.matchAll()
				.then(function (cls) {
					// find visible windows that run our app
					var client = cls.find(function (cl) {
						console.log('client is: ', cl);
						// we have an open browser window
						return cl.visibilityState === 'visible';
					});
					if (client) {
						console.log('found client');
						// use the url from the metadata set up in the push event handler below
						client.navigate(notification.data.url);
						client.focus();
					} else {
						console.log('client not found');
						// open a new tab or the browser itself, if not open
						clients.openWindow(notification.data.url);
					}
					notification.close();
			})
		);
		notification.close();
	}
});
// reaction to a closing of a notification. valuable if you want to, for example, store the timestamp for it and try
// to figure out why the users didn't interact with it.
// TODO: doesn't work on my machine for some reason. could be that not supported on Windows
self.addEventListener('notificationclose', function (event) {
	console.log('Notification was closed');
});
// here we'll listen to push notifications for the subscription we subscribed to
self.addEventListener('push', function (event) {
	console.log('Notification received!');
	// use default message, just in case we get no data in the payload. may or may not make sense
	var data = {title: 'New!', content: 'Something New Happened', openUrl: '/'};
	if (event.data) {
		data = JSON.parse(event.data.text());
	}
	// show the notification. (see details of the options in app.js)
	var options = {
		body: data.content,
		icon: '/src/images/icons/app-icon-96x96.png',
		badge: 'src/images/icons/app-icon-96x96.png',
		data: {
			url: data.openUrl
		}
	};
	event.waitUntil(
		// the sw itself can't show the notification. it's there to listen to events. we have to reach out to the
		// registration of the service worker. That's what's running in the browser and connects the sw to the browser.
		self.registration.showNotification(data.title, options)
	)
});
