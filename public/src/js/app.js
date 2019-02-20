// we have two 'enable notification' buttons. so, select them all
var enableNotificationsButtons = document.querySelectorAll('.enable-notifications');

if (!window.Promise) {
	window.Promise = Promise;
}
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js')
		.then(() => {
			console.log('Service worker registered!');
		});
}
// example for how to display notifications. we won't use it anymore once we push notifications from the server
function displayConfirmNotification() {
	// options supported depend on the device! 'title' and 'body' are supported by all devices.
	var options = {
		body: 'You successfully subscribed to our Notification Service',
		// the following may or may not be supported by depending on the device
		icon: '/src/images/icons/app-icon-96x96.png', // could also be 'http://....'
		image: '/src/images/sf-boat.jpg',
		dir: 'ltr', // left to right
		lang: 'en-US', // or BCP 47 etc
		vibrate: [100, 50, 200], // vibrate for 100ms, pause for 50ms, vibrate again for 200ms
		// android top bar has a badge
		badge: 'src/images/icons/app-icon-96x96.png',
		// tag make it so that if you have multiple notifications of the same tag, only one will display
		// which may be what you want, or not (if you have news feeds, you probably don't. if you have an error that repeats
		// itself, you probably do)
		// NOTE: the functionality is up to the OS: some OSs will only allow you to show one notification at a time anyway.
		tag: 'confirm-notification',
		// renotify is true: even if you set the tag a new notification will vibrate and alert the user. if false, new
		// notifications won't renotify nor vibrate the phone again.
		renotify: true,
		// actions are the buttons displayed next to the notifications.
		// each action is a js object. they have 3 props: id, title displayed on the action button, and icon.
		actions: [
			{action: 'confirm', title: 'Okay', icon: 'src/images/icons/app-icon-96x96.png' /*a checkmark may be more suitable for a 'confirm' button... */},
			{action: 'cancel', title: 'Cancel', icon: 'src/images/icons/app-icon-96x96.png' /*an X may be more suitable for a 'confirm' button... */}
		],
		// metadata you can use upon interaction w/the notification. can be as many props as you want (here it's not used
		// for anything. look at the sw where it IS valuable)
		data: {
			url: '/'
		}
	};
	// check if SW is enabled, so we could display push notifications through the sw. of course, w/o sws, push
	// notifications would make little sense, since we won't be able to use them offline.
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.ready
		// with the sw registration we get here we can listen not only to incoming events, but also show notifications
			.then(function (swreg) {
				swreg.showNotification('Successfully subscribed from SW', options)
			})
	}
	// this will be a real service notification on our device
	// we comment this out b/c this is use to show notification w/o the sw and won't work if we are offline. instead, we'll
	// implement notification with the sw above!
	// new Notification('Successfully subscribed', options);
}
function configurePushSub() {
	if (!('serviceWorker' in navigator)) {
		return;
	}
	var reg;
	navigator.serviceWorker.ready
		.then(function (swreg) {
			reg = swreg;
			// check for subscriptions check for this browser on this device. each browser/device yields a distinct service
			return swreg.pushManager.getSubscription();
		})
		.then(function (sub) {
			if (!sub) {
				var convertedVapidPublicKey = urlBase64ToUint8Array('');
				// create a new subscription. if there was one already, it will overwrite it.
				// to prevent from anyone discovering the push notification api we are developing we protect them by passing
				// configuration to subscribe
				return reg.pushManager.subscribe({
					// notifications are only visible to this user
					userVisibleOnly: true,
					// only this server can send messages. note that setting only an ip is not secure enough. hackers can go
					// around it. so, we use VAPID, with public key (as part of the JS code, and thus is visible)
					// and private key is connected to the public one but can't be derived from it, and kept on our
					// APPLICATION server, so can't be accessed. Only the 2 keys together work. See:
					// https://blog.mozilla.org/services/2016/04/04/using-vapid-with-webpush/
					// we'll install a lib, webpush, to do the push notifications for generate the keys and use them to secure
					// the web push messages.
					applicationServerKey: convertedVapidPublicKey
				});
			} else {
				// use existing subscription
			}
		})
		.then(function (newSub) {
			console.log(JSON.stringify(newSub));
			// we want to pass the new subscription to Firebase. Name it 'subscription' and don't forget to pass the '.json'
			// at the end
			return fetch('https://pwagram-f6ae9.firebaseio.com/subscriptions.json', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
				},
				body: JSON.stringify(newSub)
			})
		})
		.then(function (res) {
			if (res.ok) {
				displayConfirmNotification();
			}
		})
		.catch(function (err) {
			console.log(err);
		});
}
function askForNotificationPermission() {
	// the browser will ask the user for permission by default, however, it's better if we do it so we can choose
	// when to ask. since we do this when they user clicks the button, it's highly likely that they'd approve.
	// NOTE: if you ask for notification permission, you implicitly also ask for a push notification permission.
	// those are 2 separate technologies! notification is a simple box to display, and push is sending messages to
	// your app.
	Notification.requestPermission(function (result) {
		console.log('User Choice', result);
		if (result !== 'granted') {
			console.log('No Notification permission granted!');
		} else {
			// TODO: hide button
			configurePushSub();
			// this is to demo manually setting messages. we'll call this above when we are done sending the subscription to
			// Firebase server (see above)
			//displayConfirmNotification();
		}
	})
}
// only show the button if supported by the browser
if ('Notification' in window && 'serviceWorker' in navigator) {
	for (var i = 0; i < enableNotificationsButtons.length; i++) {
		enableNotificationsButtons[i].style.display = 'inline-block';
		enableNotificationsButtons[i].addEventListener('click', askForNotificationPermission);
	}
}