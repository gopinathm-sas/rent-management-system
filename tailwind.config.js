/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Preserving the custom color palette from index.html if needed
                emerald: {
                    50: '#ecfdf5',
                    100: '#d1fae5',
                    // ... default tailwind colors are usually fine, 
                    // but we can extend if specific hex values were used.
                    // Using standard Tailwind colors for now as they matched closely.
                }
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
