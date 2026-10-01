// =============================================================================
// SHOP CONFIGURATION — Edit this block to deploy for a new shop/unit
// See README.md for step-by-step setup instructions
// =============================================================================
const SHOP_CONFIG = {

  // Set to false to show the setup wizard (do this first when deploying for a new shop)
  // Set to true once setup is complete to hide the wizard permanently
  setupComplete: true,

  // Display name shown throughout the app
  shopName: 'RAWS Tools Tracker',

  // Firebase project credentials — get these from your Firebase console
  // (Project Settings > Your apps > Web app > SDK setup and configuration)
  firebase: {
    apiKey: "AIzaSyCaWp7eMxsBN--ruRoRUZsrtYI9vspPDhw",
    authDomain: "raws-tool-tracker.firebaseapp.com",
    databaseURL: "https://raws-tool-tracker-default-rtdb.firebaseio.com",
    projectId: "raws-tool-tracker",
    storageBucket: "raws-tool-tracker.firebasestorage.app",
    messagingSenderId: "165597406752",
    appId: "1:165597406752:web:6ea2b825ab9f07895f7e45",
    measurementId: "G-ZB100K429L"
  },

  // Email addresses that have full admin access (add/edit/delete tools, manage logs)
  // All other authenticated users get read + checkout/return access only
  adminEmails: [
    'dustin.butler.6@us.af.mil',
    'conner.schlegel@us.af.mil',
    'dane.dodd@us.af.mil'
  ]

};
// =============================================================================
// END SHOP CONFIGURATION
