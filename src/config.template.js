// =============================================================================
// SHOP CONFIGURATION — Edit this block to deploy for a new shop/unit
// See README.md for step-by-step setup instructions
// =============================================================================
const SHOP_CONFIG = {

  // Set to false to show the setup wizard (do this first when deploying for a new shop)
  // Set to true once setup is complete to hide the wizard permanently
  setupComplete: false,

  // Display name shown throughout the app
  shopName: 'My Shop Tools Tracker',

  // Firebase project credentials — get these from your Firebase console
  // (Project Settings > Your apps > Web app > SDK setup and configuration)
  firebase: {
    apiKey: "PASTE_YOUR_API_KEY_HERE",
    authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
    databaseURL: "PASTE_YOUR_DATABASE_URL_HERE",
    projectId: "PASTE_YOUR_PROJECT_ID_HERE",
    storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
    messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
    appId: "PASTE_YOUR_APP_ID_HERE"
  },

  // Email addresses that have full admin access (add/edit/delete tools, manage logs)
  // All other authenticated users get read + checkout/return access only
  adminEmails: [
    'your.email@us.af.mil'
  ]

};
// =============================================================================
// END SHOP CONFIGURATION
// =============================================================================
