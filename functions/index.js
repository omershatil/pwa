const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({origin: true});
const webpush = require('web-push');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// you can even use Express here
// To deploy the functions we execute on the command line (after installing firebase-tools globally and doing
// 'firebase init' in the command line of the functions folder):
// firebase deploy
//
// we need to initiate the app with the db URL you can find in the google firebase dashboard, and the key file which
// you can find under project settings -> Service accounts in the dashboard. Generate a new key and download it.
var serviceAccount = require('./pwakey');
admin.initializeApp({
  databaseURL: 'https://pwagram-f6ae9.firebaseio.com/',
  credential: admin.credential.cert(serviceAccount)
});
exports.storePostData = functions.https.onRequest((request, response) => {
  cors(request, response, function () {
    admin.database().ref('posts').push({
      id: request.body.id,
      title: request.body.title,
      location: request.body.location,
      image: request.body.image,
    })
      .then(function () {
        // add the private key to the app running on the firebase server, or, more precisely, to web-push lib.
        webpush.setVapidDetails(
          // email address
          'mailto:omershatil@gmail.com');
        // need to fetch all the subscriptions from the db, so we can send them out
        return admin.database().ref('subscriptions').once('value');
      })
      .then(function(subscription) {
        subscription.forEach(function(sub) {
          var pushConfig = {
            endpoint: sub.val().endpoint,
            keys: {
              auth: sub.val().keys.auth,
              p256dh: sub.val().keys.p256dh
            },
          };
          // send the notification with some payload here!
          console.log('Sending push config: ', pushConfig);
          webpush.sendNotification(pushConfig, JSON.stringify({
            title: 'New Post',
            content: 'New Post Added!',
            // pass a url to be used after the user dismisses the notification
            openUrl: '/help'
          }))
            .catch(function (err) {
              console.log(err);
            })
        });
        response.status(201).json({message: 'Data stored', id: request.body.id})
      })
      .catch(function (err) {
        response.status(500).json({error: err});
      })
  });
});
