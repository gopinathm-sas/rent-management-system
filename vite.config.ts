import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    define: {
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify("AIzaSyCo8ZypJdIqMHcNsgqkf1l_Jc3cGlgtKIM"),
        'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify("AIzaSyCH2Q18CquL9IGi9t6KovkSqQj3DYnXf9g"),
        'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify("munirathnam-illam.firebaseapp.com"),
        'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify("munirathnam-illam"),
        'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify("munirathnam-illam.firebasestorage.app"),
        'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify("852272424128"),
        'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify("1:852272424128:web:e5400d3d2f512d7e477925")
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
    }
})
