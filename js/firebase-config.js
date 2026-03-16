// js/firebase-config.js
// Initialize Firebase using the v8 compat libraries for procedural global access

const firebaseConfig = {
    apiKey: "AIzaSyCxow5Dhxwp0rlUni5uzn5aiOVaFOi6pKM",
    authDomain: "bp-tracker-12d87.firebaseapp.com",
    databaseURL: "https://bp-tracker-12d87-default-rtdb.firebaseio.com",
    projectId: "bp-tracker-12d87",
    storageBucket: "bp-tracker-12d87.firebasestorage.app",
    messagingSenderId: "952502211820",
    appId: "1:952502211820:web:9e433f4d01497ff45c41c9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
const db = firebase.database();
