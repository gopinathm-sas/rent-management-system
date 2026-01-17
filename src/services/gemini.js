
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Sends an image to Gemini AI to extract the water meter reading.
 * @param {string} base64Image - The base64 encoded image string (without the data:image/... prefix).
 * @param {string} mimeType - The mime type of the image (e.g., "image/jpeg").
 * @returns {Promise<number|null>} - The extracted meter reading number or null if failed.
 */
export async function getMeterReadingFromImage(base64Image, mimeType = "image/jpeg") {
    try {
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is missing. Please check your .env file.");
        }

        console.log("Starting Gemini analysis...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: "Analyze this image of a water meter. Extract the numeric reading shown on the counter. Return ONLY the number as a plain integer or float. Ignore any units or leading zeros if they are not part of the value. If you cannot clearly see a number, return 'ERROR'."
                        },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error Body:", errorText);
            throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        console.log("Gemini Raw Response:", text);

        if (!text || text === 'ERROR') {
            return null;
        }

        // Clean up the text to extract just the number
        // This regex looks for the first sequence of digits, potentially with a decimal point
        const numberMatch = text.match(/(\d+\.?\d*)/);

        if (numberMatch) {
            return parseFloat(numberMatch[0]);
        }

        return null;

    } catch (error) {
        console.error("Failed to analyze image with Gemini:", error);
        throw error;
    }
}
