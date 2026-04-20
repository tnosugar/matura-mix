// Matura Mix — config
//
// FIREBASE_CONFIG: the public client config from your Firebase project
//   (Firebase Console → Project settings → Your apps → SDK setup → Config).
//   It's safe to commit this to a public repo; Firebase's security model is
//   enforced by the Realtime Database rules, not by hiding the apiKey.
//
// RESULTS_KEY: the URL key that gates the results page.
//   Bookmark:   results.html?key=<this value>
//   Anyone with that URL can see results. Rotate it if it leaks (just
//   change the string here, commit, push — the old bookmark stops working).

window.MATURA_MIX_CONFIG = {
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyCV6mYUO0B2MxXF7kOpHy_B2rmp5AeuVJ8",
    authDomain: "matura-mix.firebaseapp.com",
    databaseURL: "https://matura-mix-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "matura-mix",
    storageBucket: "matura-mix.firebasestorage.app",
    messagingSenderId: "698020382162",
    appId: "1:698020382162:web:4c412ebc40544ad717340b",
  },
  RESULTS_KEY: "688c41c8a0b81b065bf7d5c6a607b9c1",
  MAX_SONGS: 5,
};
